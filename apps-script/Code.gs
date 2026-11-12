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
  "Submitted From (Page URL)"
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
  }
  return sheet;
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
        p.pageUrl || ""
      ]);
    } finally {
      lock.releaseLock();
    }
    return json_({ result: "success" });
  } catch (err) {
    return json_({ result: "error", error: String(err) });
  }
}

/** Simple health check — open the Web App URL in a browser to test. */
function doGet() {
  return json_({ result: "ok", message: "Project Ideas Apps Script is running. Submit via the website form." });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
