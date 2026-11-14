# Project Ideas

A modern, responsive, single-page website that collects software project ideas from students and other interested people. Visitors describe an idea for a web app, mobile app, AI tool, desktop app or any other software using a fully custom-built submission form; submissions are stored in a Google Sheet via a small Google Apps Script backend, selected ideas are reviewed for development, and visitors can also express interest in collaborating.

## Tech

- HTML5 (semantic), CSS3 (responsive, mobile-first), vanilla JavaScript
- No build step, no paid services, no database server
- Submissions: custom form → Google Apps Script web app → Google Sheets (free; one-time setup in `SETUP_GOOGLE_SHEETS.md`)

## Project structure

```
project-ideas/
├── index.html              # the whole single-page site (incl. the custom form)
├── css/
│   └── style.css           # all styling (dark navy + purple/blue gradient theme)
├── js/
│   ├── config.js           # ← paste your Apps Script Web App URL here
│   ├── main.js             # mobile nav, scrollspy, reveal animations, FAQ accordion
│   └── form.js             # form validation, submission, loading/success/error states
├── apps-script/
│   └── Code.gs             # backend to paste into Apps Script (writes rows to the Sheet)
├── assets/
│   └── favicon.svg         # site icon
├── SETUP_GOOGLE_SHEETS.md  # one-time backend setup: Sheet + Apps Script + connecting + testing
├── netlify.toml            # Netlify config (publish the project folder as-is)
└── README.md
```

## Before going live — connect the form (one-time, ~10 min)

The form ships with a placeholder endpoint in `js/config.js` and will honestly refuse to "submit" until connected. Follow **`SETUP_GOOGLE_SHEETS.md`**: create/choose the Google Sheet, paste `apps-script/Code.gs` into its Apps Script editor, deploy as a web app, paste the URL into `js/config.js`, then run the test submissions described there.

## Run locally

No build or install needed.

**Option 1 — just open it:** double-click `index.html`.

**Option 2 — local server (recommended, closest to the live site):**

```powershell
cd C:\path\to\project-ideas
py -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Deploy to Netlify (free)

**Drag & drop (easiest):**
1. Go to https://app.netlify.com/drop
2. Drag the whole `project-ideas` folder onto the page.
3. Netlify publishes it and gives you a live URL.

**Git (auto-updates on every push):**
1. Push this folder to a GitHub repository.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Build command: leave empty. Publish directory: `.` (already set in `netlify.toml`).
4. Deploy. Future pushes redeploy automatically.

**Updating the live site:** edit the files, then either re-drag the folder onto your site's Deploys page (drag & drop method) or push to GitHub (Git method).

## The submission form

- All 12 original questions, grouped into 4 sections: Personal Information · Project Overview · Idea Description · AI and Collaboration. Application Type, AI involvement and Collaboration all use selectable cards with the original choices.
- Required: Full Name, USN, Email Address, Project Idea / Application Name, Application Type, Explain Your Idea, What Problem Does Your Idea Solve? Everything else is optional (email must also be in a valid format).
- Application Type uses selectable cards with the original 6 choices; AI and Collaboration use pill-style radio choices (Yes / No / Maybe / Not Sure and Yes / No / Maybe).
- Sections: Personal Information · Project Overview · Idea Description · AI and Collaboration, with a live progress indicator for the 7 required fields and character counters on the long-text answers (Explain 1200, Problem 1000, Features 1000, Comments 600).
- Client-side validation with inline messages, a loading state on the submit button, and duplicate protection at two levels (the button locks while submitting, and every submission carries a unique ID the Apps Script deduplicates on, so retries can't create double rows).
- The success confirmation appears **only** when the Apps Script backend replies `{"result":"success"}` — any network, HTTP or script error shows the error state and keeps the visitor's answers in the form.
- There is **no Google Forms embed anywhere** in this project — the form is fully custom HTML/CSS/JS.

## Ideas Wall (v4)

A second page, **`ideas.html`**, shows approved student ideas as cards with a progress status:

- **Submitted** — approved and waiting, **In Progress** — being built, **Completed** — finished, with **View Project** (live preview) and **GitHub Repo** buttons.
- Students choose via a mandatory "I Accept / I Don't Accept" option on the form; the site owner approves each idea from the Google Sheet (set `Visible on Website` = Yes, update `Status`, paste the two links when Completed).
- Data comes from the same Apps Script web app: `GET <APPS_SCRIPT_URL>?feed=ideas`. The feed is **whitelisted** — it only ever returns name, idea, a short explanation excerpt, status and Completed links, and only for consented + approved rows. USN, email and all other answers never leave the Sheet.
- `js/ideas.js` renders cards with `textContent` only (no `innerHTML`), so submissions cannot inject markup into the page.

## AI help chat (v5)

An **"Idea Assistant"** chat widget (bottom-right of every page, `js/chat.js`) answers visitors' questions about this website:

- It is a **real AI** (Groq `openai/gpt-oss-20b`, free tier) called by the same Apps Script backend (`POST action=chat`) — not a fixed if/else script. The API key lives only in the script's **Script Properties** (`GROQ_API_KEY`); it never appears in this repo or on the website.
- Its knowledge is grounded in the website: how submission and consent work, the statuses, Kasim and his projects — plus the **live Ideas Wall list, read fresh from the Sheet on every chat** through the same consent + approval privacy filter as the wall feed (no USN/email is ever sent to the AI). Approving or hiding an idea in the Sheet updates the assistant's answers automatically.
- Chat messages are not stored, and the assistant directs would-be submitters to the form. If the AI is unconfigured or unreachable, the widget shows a friendly FAQ fallback and the rest of the site is unaffected.
- Setup (one-time): paste the latest `Code.gs`, add the `GROQ_API_KEY` script property, deploy a New version — see `SETUP_GOOGLE_SHEETS.md`, "AI help chat (v5)".
