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
 * v6: every submission also gets a Public ID (PI-0001, PI-0002, …)
 * used on the Ideas Wall and in each idea's own page URL
 * (?feed=idea&id=PI-0001).
 * v7: the AI brief is STRUCTURED — five parts stored in the
 * "Brief Problem", "Brief Solution", "Brief Build", "Brief Tech"
 * and "Brief Audience" columns. The idea's page shows all five;
 * the wall shows Problem + Solution. (The old single "AI Brief"
 * column is no longer written.) The sheet menu item "Generate AI
 * briefs + IDs for existing rows" backfills IDs and briefs for
 * older submissions — running it from the editor is also what
 * triggers Google's permission prompt for the AI calls.
 *
 * AI CHAT (v5): the website's help chatbot posts action=chat here.
 * It calls the Groq AI API (model openai/gpt-oss-20b). The API key
 * is read from Script Properties — Project Settings → Script
 * Properties → add GROQ_API_KEY — and is NEVER written in this
 * file or anywhere on the website. Without the key, chat simply
 * replies "not configured" and the site keeps working as before.
 * After pasting this file, Deploy → Manage deployments → edit →
 * New version (the Web App URL stays the same).
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
  "Visible on Website",
  "AI Brief",
  "Public ID",
  "Brief Problem",
  "Brief Solution",
  "Brief Build",
  "Brief Tech",
  "Brief Audience"
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

/** Handles the website's POST requests (idea form + AI chat). */
function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    // AI help chat — handled separately; it never touches the sheet.
    if (p.action === "chat") {
      return handleChat_(p);
    }
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
      // Give the new row its Public ID and its structured AI brief
      // (five Brief * columns). Also wrapped separately: if the AI
      // is unreachable or unconfigured, the row simply keeps empty
      // brief parts (the feeds fall back to the text excerpt) and
      // the submission still succeeds exactly as before.
      try { fillPublicIdAndBrief_(sheet, sheet.getLastRow()); } catch (aiErr) { /* ignore */ }
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
      .addItem("Generate AI briefs + IDs for existing rows", "backfillBriefsAndIds")
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
 * - ?feed=idea&id=PI-0001: one public idea's detail feed, for the
 *   idea's own page (see ideaDetailFeed_ below). Same privacy rules.
 * - ?action=rebuild-overview: rebuilds the private Overview tab from
 *   the main tab and reports how many rows it summarised. It exposes
 *   NO submission data — it only reorganises the owner's own sheet.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.feed === "ideas") {
    return ideasFeed_();
  }
  if (e && e.parameter && e.parameter.feed === "idea") {
    return ideaDetailFeed_(e.parameter.id);
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
 * Each idea exposes ONLY: its Public ID, student name, idea name, a
 * short brief (the structured brief's Problem + Solution when they
 * exist, else a short excerpt of the explanation), the five brief
 * parts themselves ("briefParts" — the wall card stays short and
 * shows only the flat brief; the full structure is presented on
 * the idea's own page), the excerpt itself, status, the submission
 * date ("date", e.g. "15 Nov 2026"), and — for
 * Completed projects only — the live project URL and repo URL.
 * USN, email, the internal submission ID and every other answer
 * NEVER appear here.
 * Never "publish" the sheet itself to the web.
 */
// The submission's date as a short human string ("15 Nov 2026"),
// read from the Timestamp column (index 0). Real submissions store
// a Date object there; a stored string that parses as a date is
// formatted the same way, anything else passes through as trimmed
// text, and an empty cell stays empty (the site then shows no date).
function submittedDate_(row) {
  var v = row[0];
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "d MMM yyyy");
  }
  var s = String(v || "").trim();
  if (!s) return "";
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "d MMM yyyy");
  }
  return s;
}

function ideasFeed_() {
  try {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var C = { name: 2, idea: 5, explain: 7, consent: 15, status: 16, live: 17, repo: 18, visible: 19, publicId: 21 };
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
      var parts = briefPartsFromRow_(row);
      var brief = briefTextFromParts_(parts);
      var done = status === "Completed";
      ideas.push({
        id: String(row[C.publicId] || "").trim(),
        name: String(row[C.name] || "").trim(),
        idea: ideaName,
        brief: brief || explain,
        briefParts: parts,
        explanation: explain,
        status: status,
        date: submittedDate_(row),
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

/**
 * Detail feed for ONE public idea (?feed=idea&id=PI-0001), used by
 * the idea's own page (idea.html). Same privacy contract as the wall
 * feed: the row must be consented AND owner-approved, and only the
 * public fields leave the sheet — except that here the explanation
 * is returned IN FULL (it is the idea's own page), along with the
 * structured brief as "briefParts" ({problem, solution, build,
 * tech, audience}; empty strings for any part not yet generated).
 * An unknown id and a non-public id are indistinguishable: both
 * answer {"result":"error","error":"Idea not found."}.
 */
function ideaDetailFeed_(idParam) {
  try {
    var wanted = String(idParam || "").trim().toLowerCase();
    if (!wanted) return json_({ result: "error", error: "Idea not found." });
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var C = { name: 2, idea: 5, explain: 7, consent: 15, status: 16, live: 17, repo: 18, visible: 19, publicId: 21 };
    var STATUSES = ["Submitted", "In Progress", "Completed"];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (String(row[C.publicId] || "").trim().toLowerCase() !== wanted) continue;
      // The id exists — but if the row is not public, answer exactly
      // as if it did not exist (never confirm a private submission).
      if (!truthy_(row[C.visible])) break;
      if (String(row[C.consent] || "").trim().toLowerCase() !== "yes") break;
      var status = String(row[C.status] || "").trim();
      if (STATUSES.indexOf(status) === -1) status = "Submitted";
      var done = status === "Completed";
      var full = String(row[C.explain] || "").trim();
      var parts = briefPartsFromRow_(row);
      var brief = briefTextFromParts_(parts);
      if (!brief) {
        brief = full.replace(/\s+/g, " ").trim();
        if (brief.length > 200) brief = brief.slice(0, 197).trim() + "…";
      }
      return json_({ result: "ok", idea: {
        id: String(row[C.publicId] || "").trim(),
        name: String(row[C.name] || "").trim(),
        idea: String(row[C.idea] || "").trim(),
        brief: brief,
        briefParts: parts,
        explanation: full,
        status: status,
        date: submittedDate_(row),
        liveUrl: done ? String(row[C.live] || "").trim() : "",
        repoUrl: done ? String(row[C.repo] || "").trim() : ""
      }});
    }
    return json_({ result: "error", error: "Idea not found." });
  } catch (err) {
    return json_({ result: "error", error: String(err) });
  }
}

// ---------- Public IDs + structured AI briefs ----------
//
// Public ID: a short stable code per submission (PI-0001, PI-0002, …)
// shown on the wall and used in each idea's page URL. It is assigned
// in submission order, continuing from the highest ID already in the
// sheet, and never changes once set. It is NOT the internal
// submission ID (that stays private, for duplicate protection only).
//
// Structured AI brief (v7): the same Groq model as the chat analyses
// each submission into five parts, stored in the "Brief Problem",
// "Brief Solution", "Brief Build", "Brief Tech" and "Brief
// Audience" columns. The idea's own page shows all five; the wall's
// one-line brief is Problem + Solution. When the parts are missing
// the feeds fall back to the plain text excerpt, so the site works
// even with the AI unconfigured. The old single "AI Brief" column
// (index 20) is kept in HEADERS so existing sheets stay aligned,
// but nothing writes to it any more.

var AI_BRIEF_COL = 20;  // 0-based index of the legacy "AI Brief" (no longer written)
var PUBLIC_ID_COL = 21; // 0-based index of "Public ID" in HEADERS
var BRIEF_PROBLEM_COL = 22;   // "Brief Problem"
var BRIEF_SOLUTION_COL = 23;  // "Brief Solution"
var BRIEF_BUILD_COL = 24;     // "Brief Build"
var BRIEF_TECH_COL = 25;      // "Brief Tech"
var BRIEF_AUDIENCE_COL = 26;  // "Brief Audience"

// The five brief parts of one sheet row, whitespace-normalised.
// Missing cells come back as empty strings.
function briefPartsFromRow_(row) {
  return {
    problem: String(row[BRIEF_PROBLEM_COL] || "").replace(/\s+/g, " ").trim(),
    solution: String(row[BRIEF_SOLUTION_COL] || "").replace(/\s+/g, " ").trim(),
    build: String(row[BRIEF_BUILD_COL] || "").replace(/\s+/g, " ").trim(),
    tech: String(row[BRIEF_TECH_COL] || "").replace(/\s+/g, " ").trim(),
    audience: String(row[BRIEF_AUDIENCE_COL] || "").replace(/\s+/g, " ").trim()
  };
}

function briefPartsComplete_(parts) {
  return !!(parts.problem && parts.solution && parts.build && parts.tech && parts.audience);
}

// The wall's one-line brief: Problem + Solution (whichever exists).
function briefTextFromParts_(parts) {
  var bits = [];
  if (parts.problem) bits.push(parts.problem);
  if (parts.solution) bits.push(parts.solution);
  return bits.join(" ");
}

function publicIdNumber_(v) {
  var m = /^PI-(\d+)$/i.exec(String(v == null ? "" : v).trim());
  return m ? parseInt(m[1], 10) : 0;
}

function formatPublicId_(n) {
  var s = String(n);
  while (s.length < 4) s = "0" + s;
  return "PI-" + s;
}

// Highest PI number currently in the sheet (0 when none).
function maxPublicIdNumber_(values) {
  var max = 0;
  for (var r = 1; r < values.length; r++) {
    var n = publicIdNumber_(values[r][PUBLIC_ID_COL]);
    if (n > max) max = n;
  }
  return max;
}

// Fills the Public ID and structured brief parts of one sheet row
// (1-based row number) when they are missing. Used right after a
// submission is appended; the caller wraps it so a failure can
// never break the submission itself.
function fillPublicIdAndBrief_(sheet, rowNum) {
  var values = sheet.getDataRange().getValues();
  var row = values[rowNum - 1];
  if (!row) return;
  if (!String(row[PUBLIC_ID_COL] || "").trim()) {
    var id = formatPublicId_(maxPublicIdNumber_(values) + 1);
    sheet.getRange(rowNum, PUBLIC_ID_COL + 1).setValue(id);
    row[PUBLIC_ID_COL] = id;
  }
  if (!briefPartsComplete_(briefPartsFromRow_(row))) {
    var parts = generateBriefParts_(row);
    if (parts) writeBriefParts_(sheet, rowNum, parts);
  }
}

// Writes the five brief parts into one sheet row (1-based).
function writeBriefParts_(sheet, rowNum, parts) {
  sheet.getRange(rowNum, BRIEF_PROBLEM_COL + 1).setValue(parts.problem);
  sheet.getRange(rowNum, BRIEF_SOLUTION_COL + 1).setValue(parts.solution);
  sheet.getRange(rowNum, BRIEF_BUILD_COL + 1).setValue(parts.build);
  sheet.getRange(rowNum, BRIEF_TECH_COL + 1).setValue(parts.tech);
  sheet.getRange(rowNum, BRIEF_AUDIENCE_COL + 1).setValue(parts.audience);
}

// One brief field, whitespace-normalised and capped in length
// (truncated with an ellipsis when over the cap).
function capBriefField_(value, cap) {
  var s = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (s.length > cap) s = s.slice(0, cap - 1).trim() + "…";
  return s;
}

// Asks Groq for the structured brief of one submission row. The
// model must reply with STRICT JSON only:
// {"problem","solution","build","tech","audience"}. Returns the
// parts object, or null on ANY failure (no key, network error,
// malformed JSON, missing problem/solution) — callers treat null
// as "store nothing; the feeds use the excerpt instead", never as
// an error, and a submission is never failed because of the AI.
function generateBriefParts_(row) {
  try {
    var key = String(PropertiesService.getScriptProperties().getProperty("GROQ_API_KEY") || "").trim();
    if (!key) return null;
    var facts = [
      "Idea name: " + String(row[5] || "").trim(),
      "Type: " + String(row[6] || "").trim(),
      "Explanation: " + String(row[7] || "").trim(),
      "Problem it solves: " + String(row[8] || "").trim(),
      "Who benefits: " + String(row[9] || "").trim(),
      "Features wanted: " + String(row[10] || "").trim()
    ].join("\n");
    var resp = UrlFetchApp.fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + key },
      payload: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: "You write structured factual briefs for a student project-ideas website. Reply with STRICT JSON only — no markdown, no code fences, no commentary, no text outside the JSON object." },
          { role: "user", content: "Analyse the student project idea below and reply with a JSON object with exactly these keys: \"problem\", \"solution\", \"build\", \"tech\", \"audience\".\nRules:\n- problem: the pain point, one plain line.\n- solution: how this idea solves it, one plain line.\n- build: what will actually be built (the product and its core features), one plain line.\n- tech: a realistic beginner-friendly tech stack suited to the idea, comma-separated and short (examples: HTML/CSS/JS, FastAPI, SQLite, Firebase — pick what fits this idea).\n- audience: exactly who this is built for, one plain line.\nNo hype, no emojis, no marketing words.\n\n" + facts }
        ],
        temperature: 0.3,
        max_tokens: 400,
        reasoning_effort: "low"
      }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return null;
    var data = JSON.parse(resp.getContentText());
    var raw = "";
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      raw = String(data.choices[0].message.content || "");
    }
    // Defensive parse: keep only the outermost {...} (this also
    // strips any ```json fences or stray prose), then JSON.parse.
    var start = raw.indexOf("{");
    var end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    var parsed = JSON.parse(raw.slice(start, end + 1));
    var parts = {
      problem: capBriefField_(parsed.problem, 160),
      solution: capBriefField_(parsed.solution, 160),
      build: capBriefField_(parsed.build, 160),
      tech: capBriefField_(parsed.tech, 120),
      audience: capBriefField_(parsed.audience, 160)
    };
    // Problem and Solution are the minimum viable brief; without
    // both, treat the whole reply as a failure and store nothing.
    if (!parts.problem || !parts.solution) return null;
    return parts;
  } catch (err) {
    return null;
  }
}

/**
 * Menu action (also safe to run from the script editor): backfills
 * the Public ID and structured brief of every existing row that is
 * missing them. A row needs brief (re)generation when ANY of its
 * five Brief * fields is empty; rows that have an ID and all five
 * parts are skipped. Regeneration only ever FILLS empty cells —
 * text already present (including Kasim's manual edits in the
 * Brief columns) is never overwritten. Running this from the editor is also the
 * simplest way to trigger Google's permission prompt for the AI
 * calls (UrlFetchApp) — click Run, then Allow.
 */
function backfillBriefsAndIds() {
  var n = backfillBriefsAndIds_();
  try {
    SpreadsheetApp.getUi().alert("AI briefs + IDs: " + n + " row(s) updated.");
  } catch (err) { /* no UI (editor run) — the count is in the log */ }
  return n;
}

function backfillBriefsAndIds_() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var next = maxPublicIdNumber_(values) + 1;
  var updated = 0;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var hasId = !!String(row[PUBLIC_ID_COL] || "").trim();
    var partsComplete = briefPartsComplete_(briefPartsFromRow_(row));
    if (hasId && partsComplete) continue;
    var changed = false;
    if (!hasId) {
      sheet.getRange(r + 1, PUBLIC_ID_COL + 1).setValue(formatPublicId_(next));
      next++;
      changed = true;
    }
    if (!partsComplete) {
      var parts = generateBriefParts_(row);
      if (parts) {
        // Merge, never overwrite: any part already in the row (for
        // example Kasim's own hand edits in the Brief columns) is
        // kept exactly as-is; the AI text fills only the empty cells.
        var existing = briefPartsFromRow_(row);
        writeBriefParts_(sheet, r + 1, {
          problem: existing.problem || parts.problem,
          solution: existing.solution || parts.solution,
          build: existing.build || parts.build,
          tech: existing.tech || parts.tech,
          audience: existing.audience || parts.audience
        });
        changed = true;
      }
    }
    if (changed) updated++;
  }
  Logger.log("Generate AI briefs + IDs: updated " + updated + " row(s).");
  return updated;
}

// ---------- AI help chat (Groq) ----------
//
// The website widget posts { action: "chat", message, history }.
// The Groq API key comes from Script Properties (GROQ_API_KEY) —
// set it under Project Settings → Script Properties. The key must
// never be pasted into this file or the website code.

var CHAT_MODEL = "openai/gpt-oss-20b";

// The assistant's fixed knowledge: this website, its owner, and his
// projects. The LIVE Ideas Wall list is NOT kept here — it is read
// fresh from the sheet on every chat (see buildWallKnowledge_()),
// so the AI's answers about listed ideas are always current.
var CHAT_SYSTEM_PROMPT = [
  "You are the Idea Assistant, the AI help chatbot of the Project Ideas website. You are a real AI assistant — understand what the visitor means, including follow-up questions and questions asked in their own words, and answer naturally. Answer ONLY about this website, its owner Kasim Patel, his projects, and the ideas listed on the website. Be friendly, clear and concise — usually at most 120 words, plain language, no markdown headings.",
  "",
  "ABOUT THE WEBSITE (use only these facts; never invent features, dates or promises):",
  "- Project Ideas collects software project ideas from students; selected ideas may be turned into real working projects. Anyone can submit — you do not need to be a developer or have technical knowledge.",
  "- To submit an idea, use the Submit Idea form on the Submit Idea page (submit.html). It has 12 questions. Name, USN, email, idea name, application type, the idea explanation and the problem it solves are required; the rest are optional.",
  "- The form asks for public consent. Choosing 'I Accept' means the idea MAY be shown on the public Ideas Wall. Choosing 'I Don't Accept' means the idea is still submitted, but kept fully private and never shown.",
  "- Even with 'I Accept', an idea appears on the Ideas Wall only after Kasim approves it. The wall shows ONLY the student's name, the idea name, a short excerpt, the status, and — only for Completed projects — the live project and code links. USN and email are NEVER shown publicly.",
  "- Project statuses: 'Submitted' (received, waiting for review), 'In Progress' (being worked on), 'Completed' (finished — its live project and code links are on the wall).",
  "- The Ideas Wall page shows the approved public ideas. There is also a Meet the Developer page about Kasim.",
  "- The form also asks whether the student is interested in collaborating on their idea. Contact: kppatel1713@gmail.com.",
  "",
  "ABOUT KASIM PATEL (the website's creator):",
  "- Kasim Patel is a B.Tech CSE (AI & ML) student at Dayananda Sagar University, Bengaluru, India. He builds AI tools and Android apps.",
  "- His projects: LabhSetu (a conversational AI that helps people discover government benefits they are eligible for — built with his team Tech Vedas), CleanOS (an Android app that helps clean up phone storage), Smart Warehouse AI (smart warehouse inventory and storage management), and Aarohi (his local-first personal AI assistant — a work in progress). Project Ideas is this website itself.",
  "- If asked about Kasim or his projects, answer from the lines above; for anything deeper, point to the Meet the Developer page.",
  "",
  "RULES:",
  "- A list of the ideas currently on the public Ideas Wall follows at the end of these instructions (it is refreshed from the website's data for every chat). Use it to answer questions like which ideas are listed, who submitted an idea, what an idea is about, or which projects are completed. If an idea is not in that list, say it is not on the public wall — never invent ideas, names or statuses.",
  "- This chat does NOT save anything. If someone describes an idea here, warmly tell them to submit it through the form on the Submit Idea page so it is actually recorded.",
  "- Never ask the visitor for personal information (no USN, email, phone or passwords), and never reveal anyone's USN or email — you are never given them.",
  "- If the question is about something else entirely (not this website, Kasim, his projects, or the listed ideas), politely say you can only help with Project Ideas, and suggest a question you could answer.",
  "- If you do not know something from the information above, say so honestly and suggest checking the FAQ page or emailing Kasim."
].join("\n");

// Reads the CURRENT public Ideas Wall from the sheet — the same
// privacy filter as the wall feed itself: a row is included ONLY
// when the student consented (Public Consent = Yes) AND the owner
// approved it (Visible on Website = Yes), and ONLY the public
// fields are read (name, idea, explanation, status, links).
// Private/unapproved rows and USN/email never reach the AI.
// Capped at the 30 newest ideas so the prompt stays lean; each
// explanation is shortened. Any failure returns "" — chat still
// works, the AI just answers without the live list.
function buildWallKnowledge_() {
  try {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var C = { name: 2, idea: 5, explain: 7, consent: 15, status: 16, live: 17, repo: 18, visible: 19 };
    var STATUSES = ["Submitted", "In Progress", "Completed"];
    var lines = [];
    for (var r = values.length - 1; r >= 1 && lines.length < 30; r--) { // newest first
      var row = values[r];
      if (!truthy_(row[C.visible])) continue;
      if (String(row[C.consent] || "").trim().toLowerCase() !== "yes") continue;
      var ideaName = String(row[C.idea] || "").trim();
      if (!ideaName) continue;
      var status = String(row[C.status] || "").trim();
      if (STATUSES.indexOf(status) === -1) status = "Submitted";
      var line = "- \"" + ideaName + "\" by " + (String(row[C.name] || "").trim() || "a student") +
        " — Status: " + status + ". " + short_(row[C.explain], 160);
      if (status === "Completed") {
        var live = String(row[C.live] || "").trim();
        var repo = String(row[C.repo] || "").trim();
        if (live) line += " Live project: " + live + ".";
        if (repo) line += " Code: " + repo + ".";
      }
      lines.push(line);
    }
    if (!lines.length) return "";
    return "\n\nIDEAS CURRENTLY LISTED ON THE PUBLIC IDEAS WALL (live data, refreshed for this chat):\n" + lines.join("\n");
  } catch (err) {
    return ""; // the wall list is an enhancement — never break chat
  }
}

function handleChat_(p) {
  try {
    var message = String(p.message || "").trim().slice(0, 500);
    if (!message) return json_({ result: "error", error: "Empty message." });

    // .trim() guards against stray spaces/newlines from pasting the key.
    var key = String(PropertiesService.getScriptProperties().getProperty("GROQ_API_KEY") || "").trim();
    if (!key) return json_({ result: "error", error: "Chat is not configured yet." });

    // The system prompt carries the fixed knowledge PLUS the live
    // Ideas Wall list, read fresh from the sheet for this very chat —
    // so the AI always knows the current listed ideas, with no code
    // or prompt edits needed when the wall changes.
    var messages = [{ role: "system", content: CHAT_SYSTEM_PROMPT + buildWallKnowledge_() }];
    var hist = parseChatHistory_(p.history);
    for (var i = 0; i < hist.length; i++) messages.push(hist[i]);
    messages.push({ role: "user", content: message });

    var resp = UrlFetchApp.fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + key },
      payload: JSON.stringify({
        model: CHAT_MODEL,
        messages: messages,
        temperature: 0.3,
        max_tokens: 600,
        reasoning_effort: "low"
      }),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    if (code !== 200) {
      // Include Groq's own error detail (never the key) so problems
      // like a wrong key or unknown model are diagnosable, not silent.
      var detail = "";
      try { detail = String(resp.getContentText() || "").slice(0, 200); } catch (e2) { /* ignore */ }
      return json_({ result: "error", error: "AI service error (HTTP " + code + ")" + (detail ? ": " + detail : "") });
    }
    var data = JSON.parse(resp.getContentText());
    var reply = "";
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      reply = String(data.choices[0].message.content || "").trim();
    }
    if (!reply) return json_({ result: "error", error: "Empty AI reply." });
    if (reply.length > 1500) reply = reply.slice(0, 1497).trim() + "…";
    return json_({ result: "success", reply: reply });
  } catch (err) {
    return json_({ result: "error", error: "Chat failed: " + (err && err.message ? err.message : String(err)) });
  }
}

/**
 * Manual diagnostic — run this from the Apps Script editor
 * (select testChat in the function dropdown → Run → View → Logs).
 * It calls the AI exactly like the website does and logs the raw
 * result, so a key/network/model problem shows its real reason.
 */
function testChat() {
  var out = handleChat_({ message: "In one short sentence, what is this website?" });
  Logger.log(out.getContent());
}

// Accepts the widget's JSON history string; keeps only the last 6
// well-formed {role, content} turns so a bad client can't inject
// arbitrary roles (e.g. a fake "system" message).
function parseChatHistory_(raw) {
  var out = [];
  try {
    var arr = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i] || {};
      if (m.role !== "user" && m.role !== "assistant") continue;
      var c = String(m.content || "").trim().slice(0, 500);
      if (c) out.push({ role: m.role, content: c });
    }
  } catch (err) { /* malformed history is ignored, never fatal */ }
  return out.slice(-6);
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
