# Setup Guide — Connecting the Custom Form to Google Sheets

The Project Ideas website now has a fully custom submission form. It sends each submission to a small **Google Apps Script** web app, which appends it as a row in a **Google Sheet**. Total cost: ₹0. One-time setup: about 10 minutes.

**No working endpoint is shipped with the site on purpose.** Until you finish Step 4 below, the form honestly shows a "not connected yet" message instead of pretending a submission worked.

---

## What you need

- A Google account.
- The project files (this folder).
- About 10 minutes, once.

---

## Step 1 — Create (or choose) the Google Sheet

**Option A — a brand-new sheet**
1. Go to https://sheets.new — this creates a blank spreadsheet.
2. Rename it, e.g. `Project Ideas — Submissions`.

**Option B — reuse the existing Google Forms response spreadsheet** ⭐
If you want the new website submissions stored in the **same spreadsheet file** that your old Google Form was collecting responses into:

1. Open your Google Form → **Responses** tab → click the green Sheets icon ("Link to Sheets") / "View responses in Sheets". That opens the response spreadsheet.
2. Use **that** spreadsheet for Step 2 — do not create a new one.

Two honest things to know about Option B:
- The Apps Script writes website submissions into a **new tab** inside that same spreadsheet, called **`Website Submissions`**, which it creates automatically. Your spreadsheet will then hold both tabs in one file.
- Website submissions will **not** appear in the Google Form's **Responses dashboard**, and they should **not** be written into the Form's own response tab (that tab is managed by Google Forms; writing into it manually can break its structure). The website data lives in its own tab in the same file — that's the correct and safe way to share a spreadsheet.

---

## Step 2 — Add the Apps Script to the spreadsheet

1. With the spreadsheet open, go to **Extensions → Apps Script**. A code editor opens, attached ("bound") to this spreadsheet.
2. Delete whatever placeholder code is shown (`myFunction` etc.).
3. Open **`apps-script/Code.gs`** from this project and paste its entire contents into the editor.
4. Save (Ctrl+S). Name the script project anything, e.g. `Project Ideas Form Backend`.
5. You can leave `SPREADSHEET_ID` empty — because the script is bound to the sheet, it finds the spreadsheet automatically.
   *(Only if you created the script standalone at script.google.com instead: paste the sheet's ID — the long code between `/d/` and `/edit` in the sheet's URL — into `SPREADSHEET_ID` in `Code.gs`.)*

---

## Step 3 — Deploy the script as a web app

1. In the Apps Script editor: **Deploy → New deployment**.
2. Click the gear icon ⚙ next to "Select type" → **Web app**.
3. Set:
   - **Description:** Project Ideas form backend
   - **Execute as:** **Me** (your account — so it can write into your sheet)
   - **Who has access:** **Anyone** (so visitors can submit without signing in; the script only appends rows, it exposes nothing)
4. Click **Deploy**. Google asks you to authorize the script — approve it (it's your own script accessing your own sheet; if you see "unverified", click **Advanced → Go to project**).
5. Copy the **Web app URL**. It looks like:
   `https://script.google.com/macros/s/AKfyc.../exec`

> ⚠️ Keep this exact URL safe, and note: **every time you edit Code.gs later, you must create a New deployment (or update the deployment) for changes to go live** — the `/exec` URL only serves the latest deployment you point it to. Editing the code alone changes nothing on the live endpoint.

---

## Step 4 — Connect the website to the endpoint

1. Open **`js/config.js`** in the project.
2. Replace the placeholder:
   ```js
   APPS_SCRIPT_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE"
   ```
   with your real URL:
   ```js
   APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfyc.../exec"
   ```
3. Save, and re-upload/redeploy the website (Netlify) with the updated file.

That's the whole connection — the form code reads the endpoint only from `js/config.js`.

---

## Step 5 — Test it

**Test 1 — the endpoint is alive (successful path, backend)**
Open your Web App URL directly in a browser. You should see:
```json
{"result":"ok","message":"Project Ideas Apps Script is running. Submit via the website form."}
```

**Test 2 — a real submission (successful path, full flow)**
1. Open the website (locally or the Netlify URL).
2. Fill the form with an obvious test entry, e.g. Idea Name: `TEST — please delete`.
3. Submit. You should see the animated **"Idea submitted — thank you!"** confirmation.
4. Open the spreadsheet → **`Website Submissions`** tab → your test row should be there with all 12 answers + a timestamp. (Delete the test row afterwards.)

**Test 3 — validation (client-side)**
Submit with Full Name empty → the form refuses, marks the field red with a message, and nothing is sent.

**Test 4 — a failed submission (error path)**
Temporarily change one character in the URL in `js/config.js`, reload, and submit → the form shows the red error banner ("couldn't reach the server…") and keeps your answers in place. Fix the URL back afterwards. Also try submitting with Wi-Fi off — same honest error, no fake success.

**How success is confirmed (no fake success):**
The form sends a simple urlencoded POST (no CORS preflight) and the Apps Script answers with JSON. The website shows the success confirmation **only** when that answer is `{"result":"success"}`. A script-side error (e.g. missing required fields) returns `{"result":"error", ...}` and the visitor sees the error state instead.

**Test 5 — duplicate protection**
Every submission carries a unique Submission ID (stored in the sheet's second column). If a visitor's connection drops after submitting and they retry, the retry reuses the same ID and the Apps Script confirms success **without adding a second row**. You can verify this in the sheet after Test 2: one test submission = one row, with one Submission ID.

---

## Troubleshooting

| Problem | Likely cause & fix |
|---|---|
| "Sorry, unable to open the file at present" when opening Apps Script (URL contains `authuser=3` or similar) | Multiple Google accounts are signed into the browser and Google opened the script with the wrong one. Nothing is broken or lost. Fix: open a Private/Incognito window, sign in with ONLY the account that owns the Sheet, open the Sheet there, and do Extensions → Apps Script (and all remaining steps) inside that window. |
| Form says "isn't connected yet" | `js/config.js` still has the placeholder, or the pasted URL isn't a `script.google.com/macros/s/…/exec` URL. |
| Success message but no row in the sheet | Check you're looking at the **`Website Submissions`** tab; confirm the deployment's "Execute as" is **Me**; re-check Test 1. |
| Test 1 shows a Google sign-in / authorization page | The deployment's "Who has access" isn't **Anyone**, or you haven't authorized the script yet. Redeploy with the Step 3 settings. |
| It worked, then stopped after editing Code.gs | Code edits need a **new version** of the deployment: Deploy → Manage deployments → ✏️ Edit → Version: **New version** → Deploy. This keeps the **same `/exec` URL**, so `js/config.js` doesn't change. (A brand-new deployment creates a *different* URL.) |
| 401 / 403 style error page at the URL | Redeploy → New deployment, "Who has access: Anyone". |

## Privacy note

The form collects only the 12 answers shown on it. The sheet is visible only to people you share the spreadsheet with — don't share it publicly, since it contains submitters' names/emails.

---

# Ideas Wall — how it works & how you run it (v4)

The website's **Ideas Wall** page (`ideas.html`) shows approved student ideas with their progress. You control everything from the Sheet — no code changes per project.

## What's new in the script
The updated `Code.gs` adds 5 columns to the "Website Submissions" tab (they are created automatically the first time the new script runs — you don't add them by hand):

| Column | Who sets it | Meaning |
|---|---|---|
| Public Consent | the student (required form choice: I Accept / I Don't Accept) | "Yes" = the student agreed to be on the public wall |
| Status | **you** | `Submitted` → `In Progress` → `Completed` |
| Live Project URL | **you** | the working project's link (paste when Completed) |
| Repo URL | **you** | the GitHub repo link (paste when Completed) |
| Visible on Website | **you** | `Yes` = show on the wall, `No` = hidden |

After pasting the new `Code.gs`, deploy it with **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** — the `/exec` URL stays the same, so the form keeps working untouched.

## To publish an idea on the wall
1. Read the submission in the Sheet.
2. Check the student's **Public Consent** says `Yes` (if it says No, leave the idea hidden — they didn't agree to public display).
3. Set **Visible on Website** to `Yes`. The idea appears on the wall with status `Submitted`.

## To update progress
- Started building it? Change **Status** to `In Progress`.
- Finished? Change **Status** to `Completed` and paste the **Live Project URL** and **Repo URL**. The wall card now shows **View Project** and **GitHub Repo** buttons. (Buttons appear only for Completed projects with links filled in.)

## Privacy — the important part
The wall's data feed (`/exec?feed=ideas`) is whitelisted inside the script: it only ever sends a student's **name, idea name, a short explanation excerpt, status, and Completed-project links** — and only for rows where consent = Yes AND Visible = Yes. USN, email and all other answers never leave the Sheet. **Never** use Google Sheets' own "File → Share → Publish to web" on this spreadsheet — that would publish everything, including emails.

## The Overview tab (private summary)

The script also maintains a private **Overview** tab inside the same
spreadsheet — a short, easy-to-read summary of every submission, so
you don't have to read the long answers in "Website Submissions".

Each Overview row shows: Date · Student Name · USN · Email · Idea
Name · Type (shortened, e.g. "Web App") · Idea in Short · Problem in
Short · AI? · Collaborate? · Consent · Status · On Wall?

- New submissions are added to the Overview automatically.
- If you edit Status / Visible / links in "Website Submissions",
  refresh the Overview afterwards: in the sheet, use the
  **Project Ideas → Rebuild Overview tab** menu (appears after you
  save the latest Code.gs and reload the sheet; the first click may
  ask you to authorise the script — that's normal), or open
  `<your Web App URL>?action=rebuild-overview` in a browser.
- The Overview is **private**: it exists only inside your Google
  Sheet. Nothing from it is sent to the website — the public Ideas
  Wall feed still exposes only name, idea, short excerpt, status and
  (for Completed projects) the two links. Never share the spreadsheet
  itself publicly.
