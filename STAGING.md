# Staging copy — project-ideas-try

This repository is the **staging / try-out copy** of Project Ideas (v4, with the Ideas Wall).
The live project lives in `kpm1598/project-ideas`.

Workflow: build and verify changes here first (including a separate Netlify
site from this repo if wanted), check the end product, and only then copy the
verified files into the real `project-ideas` repo.

Note: both copies use the same Apps Script backend URL in `js/config.js`.
The script update for v4 (consent/status/feed) is deployed once, via
Manage deployments → New version, and serves both copies.
