/**
 * Project Ideas — Google Apps Script backend
 * -------------------------------------------
 * Receives submissions from the custom form on the Project Ideas
 * website and appends each one as a row in a Google Sheet tab
 * called "Website Submissions".
 *
 * Setup: follow SETUP_GOOGLE_SHEETS.md in the project root.
 * Short version: paste this whole file into the Apps Script editor
 * of your spreadsheet (Extensions → Apps Script), then
 * Deploy → New deployment → Web app → Execute as: Me,
 * Who has access: Anyone → Deploy → copy the Web App URL into
 * js/config.js on the website.
 *
 * Two modes, both work with this same file:
 *  A) Script bound to a spreadsheet (recommended): open Apps Script
 *     FROM the spreadsheet (Extensions → Apps Script). The script
 *     writes into that spreadsheet automatically.
 *  B) Standalone script: set SPREADSHEET_ID below to your sheet's ID
 *     (the long code in its URL) so the script knows where to write.
 */

// Only needed for mode (B). Leave empty for mode (A).
var SPREADSHEET_ID = "";

// Tab submissions are written to. It is created automatically with
// headers if it does not exist yet.
var SHEET_NAME = "Website Submissions";

// Column order in the sheet — timestamp, submission ID, then the
// 12 form questions, then the page the submission came from.
var HEADERS = [
  "Timestamp",
  "Submission ID",
  "Full Name",
  "USN",
  "Email Address",
  "Project Idea / Application Name",
  "Application Type",
  "Explain Your Idea",
  "What Problem Does Your Idea Solve?",
  "Who Would Benefit?",
  "What Features Would You Like?",
  "Does Your Idea Involve AI?",
  "Interested in Collaborating?",
  "Additional Suggestions or Comments",
  "Submitted From (Page URL)",
  "Public Consent",
  "Status",
  "Live Project URL",
  "Repo URL",
  "Visible on Website"
];

function getSheet_() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("No spreadsheet found. Either bind this script to a sheet (Extensions → Apps Script from the sheet) or set SPREADSHEET_ID in Code.gs.");
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else {
    ensureHeaders_(sheet);
  }
  return sheet;
}

// Fills in any missing header cells (e.g. columns added in a newer
// version of this script) without touching existing headers or data.
function ensureHeaders_(sheet) {
  var range = sheet.getRange(1, 1, 1, HEADERS.length);
  var row = range.getValues()[0];
  var changed = false;
  for (var i = 0; i < HEADERS.length; i++) {
    if (!row[i]) {
      row[i] = HEADERS[i];
      changed = true;
    }
  }
  if (changed) range.setValues([row]);
}

/** Handles the website form's POST request. */
function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    // Server-side check of the required fields (frontend validates too).
    if (!p.fullName || !p.usn || !p.email || !p.ideaName || !p.appType || !p.ideaExplain || !p.problem) {
      return json_({ result: "error", error: "Missing required fields." });
    }
    var sheet = getSheet_();
    // Lock so two submissions at the same moment can't interleave.
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      // Duplicate protection: the website gives every submission a
      // unique ID and reuses it on retries. If this ID is already in
      // the sheet, the original row stands — confirm success without
      // appending a second row.
      if (p.submissionId && sheet.getLastRow() >= 2) {
        var ids = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) {
          if (String(ids[i][0]) === String(p.submissionId)) {
            return json_({ result: "success", duplicate: true });
          }
        }
      }
      sheet.appendRow([
        new Date(),
        p.submissionId || "",
        p.fullName || "",
        p.usn || "",
        p.email || "",
        p.ideaName || "",
        p.appType || "",
        p.ideaExplain || "",
        p.problem || "",
        p.beneficiaries || "",
        p.features || "",
        p.aiInvolved || "",
        p.collaborate || "",
        p.comments || "",
        p.pageUrl || "",
        p.consent === "Yes" ? "Yes" : "No",
        "Submitted",
        "",
        "",
        "No"
      ]);
    } finally {
      lock.releaseLock();
    }
    return json_({ result: "success" });
  } catch (err) {
    return json_({ result: "error", error: String(err) });
  }
}

/**
 * GET handler.
 * - No parameters: simple health check (open the Web App URL to test).
 * - ?feed=ideas: the public Ideas Wall feed (see ideasFeed_ below).
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.feed === "ideas") {
    return ideasFeed_();
  }
  return json_({ result: "ok", message: "Project Ideas Apps Script is running. Submit via the website form." });
}

/**
 * Public feed for the Ideas Wall page.
 *
 * PRIVACY CONTRACT — this is the ONLY data that ever leaves the sheet:
 * a row is included ONLY when the student consented ("Public Consent"
 * = Yes) AND the owner approved it ("Visible on Website" = Yes).
 * Each idea exposes ONLY: student name, idea name, a short excerpt of
 * the explanation, status, and — for Completed projects only — the
 * live project URL and repo URL. USN, email and every other answer
 * NEVER appear here. Never "publish" the sheet itself to the web.
 */
function ideasFeed_() {
  try {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var C = { name: 2, idea: 5, explain: 7, consent: 15, status: 16, live: 17, repo: 18, visible: 19 };
    var STATUSES = ["Submitted", "In Progress", "Completed"];
    var ideas = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (!truthy_(row[C.visible])) continue;              // owner approval required
      if (String(row[C.consent] || "").trim().toLowerCase() !== "yes") continue; // student consent required
      var ideaName = String(row[C.idea] || "").trim();
      if (!ideaName) continue;
      var status = String(row[C.status] || "").trim();
      if (STATUSES.indexOf(status) === -1) status = "Submitted";
      var explain = String(row[C.explain] || "").replace(/\s+/g, " ").trim();
      if (explain.length > 200) explain = explain.slice(0, 197).trim() + "…";
      var done = status === "Completed";
      ideas.push({
        name: String(row[C.name] || "").trim(),
        idea: ideaName,
        explanation: explain,
        status: status,
        liveUrl: done ? String(row[C.live] || "").trim() : "",
        repoUrl: done ? String(row[C.repo] || "").trim() : ""
      });
    }
    ideas.reverse(); // newest submission first
    return json_({ result: "ok", ideas: ideas });
  } catch (err) {
    return json_({ result: "error", error: String(err) });
  }
}

function truthy_(v) {
  var s = String(v || "").trim().toLowerCase();
  return s === "yes" || s === "true" || s === "y";
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
