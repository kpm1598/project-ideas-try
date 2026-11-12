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

// PRIVATE summary tab — "for our eyes only". The main tab holds every
// long answer; this Overview tab mirrors each submission as ONE short
// row (short date, short text) so the owner can understand a
// submission at a glance. It lives only inside this spreadsheet —
// nothing from it is ever sent to the website.
var OVERVIEW_NAME = "Overview";
var OVERVIEW_HEADERS = [
  "Date",
  "Student Name",
  "USN",
  "Email",
  "Idea Name",
  "Type",
  "Idea in Short",
  "Problem in Short",
  "AI?",
  "Collaborate?",
  "Consent",
  "Status",
  "On Wall?"
];

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
      var newRow = [
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
      ];
      sheet.appendRow(newRow);
      // Mirror a short version into the private Overview tab. Wrapped
      // separately: the Overview must NEVER break a real submission.
      try { appendOverviewRow_(newRow); } catch (ovErr) { /* ignore */ }
    } finally {
      lock.releaseLock();
    }
    return json_({ result: "success" });
  } catch (err) {
    return json_({ result: "error", error: String(err) });
  }
}

/**
 * When the script is bound to the spreadsheet, opening the sheet adds
 * a "Project Ideas" menu with one useful action: rebuild the Overview
 * tab from the main tab (use it after editing Status / Visible cells
 * in "Website Submissions", so the Overview matches again).
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Project Ideas")
      .addItem("Rebuild Overview tab", "rebuildOverview")
      .addToUi();
  } catch (err) { /* not bound to a sheet — menu just doesn't appear */ }
}

/** Menu action (also safe to run from the script editor). */
function rebuildOverview() {
  var n = rebuildOverview_();
  try {
    SpreadsheetApp.getUi().alert("Overview rebuilt: " + n + " submission(s) summarised.");
  } catch (err) { /* no UI (editor run) — the count is in the log */ }
  return n;
}

/**
 * GET handler.
 * - No parameters: simple health check (open the Web App URL to test).
 * - ?feed=ideas: the public Ideas Wall feed (see ideasFeed_ below).
 * - ?action=rebuild-overview: rebuilds the private Overview tab from
 *   the main tab and reports how many rows it summarised. It exposes
 *   NO submission data — it only reorganises the owner's own sheet.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.feed === "ideas") {
    return ideasFeed_();
  }
  if (e && e.parameter && e.parameter.action === "rebuild-overview") {
    try {
      var n = rebuildOverview_();
      return json_({ result: "ok", action: "rebuild-overview", rows: n });
    } catch (err) {
      return json_({ result: "error", error: String(err) });
    }
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

// ---------- Private Overview tab ----------

function getOverviewSheet_() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var ov = ss.getSheetByName(OVERVIEW_NAME);
  if (!ov) ov = ss.insertSheet(OVERVIEW_NAME);
  if (ov.getLastRow() === 0) {
    ov.appendRow(OVERVIEW_HEADERS);
    ov.setFrozenRows(1);
    formatOverview_(ov);
  }
  return ov;
}

function formatOverview_(ov) {
  try {
    var header = ov.getRange(1, 1, 1, OVERVIEW_HEADERS.length);
    header.setFontWeight("bold");
    var widths = [130, 150, 90, 190, 200, 130, 300, 300, 55, 95, 70, 95, 70];
    for (var i = 0; i < widths.length; i++) ov.setColumnWidth(i + 1, widths[i]);
    ov.getRange(1, 1, Math.max(ov.getLastRow(), 1), OVERVIEW_HEADERS.length).createFilter();
  } catch (err) { /* formatting is a nicety, never fatal */ }
}

// One short Overview row from one full "Website Submissions" row.
// Column indexes match HEADERS order in the main tab.
function overviewRow_(row) {
  var when = row[0];
  var dateStr = "";
  try {
    dateStr = when instanceof Date
      ? Utilities.formatDate(when, Session.getScriptTimeZone(), "dd MMM, h:mm a")
      : String(when || "");
  } catch (err) { dateStr = String(when || ""); }
  return [
    dateStr,
    String(row[2] || "").trim(),
    String(row[3] || "").trim(),
    String(row[4] || "").trim(),
    String(row[5] || "").trim(),
    shortType_(row[6]),
    short_(row[7], 90),
    short_(row[8], 90),
    String(row[11] || "").trim(),
    String(row[12] || "").trim(),
    String(row[15] || "").trim(),
    String(row[16] || "Submitted").trim(),
    truthy_(row[19]) ? "Yes" : "No"
  ];
}

function appendOverviewRow_(fullRow) {
  var ov = getOverviewSheet_();
  ov.appendRow(overviewRow_(fullRow));
}

// Rebuilds the whole Overview from the main tab (newest at the bottom,
// same order as "Website Submissions"). Returns the row count.
function rebuildOverview_() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var ov = getOverviewSheet_();
  if (ov.getLastRow() > 1) {
    ov.getRange(2, 1, ov.getLastRow() - 1, OVERVIEW_HEADERS.length).clearContent();
  }
  var rows = [];
  for (var r = 1; r < values.length; r++) rows.push(overviewRow_(values[r]));
  if (rows.length) {
    ov.getRange(2, 1, rows.length, OVERVIEW_HEADERS.length).setValues(rows);
  }
  return rows.length;
}

function short_(text, max) {
  var s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length > max) s = s.slice(0, max - 1).trim() + "…";
  return s;
}

function shortType_(t) {
  var s = String(t || "").trim();
  var map = {
    "Web Application": "Web App",
    "Mobile Application (Android / iOS)": "Mobile App",
    "AI-powered Application": "AI App",
    "Desktop Application": "Desktop App",
    "Not sure yet": "Not sure",
    "Other software project": "Other"
  };
  return map[s] || s;
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
