# Bench CRM: working notes for Claude

This repo is the Precision Tech Bench CRM web app. It deploys to GitHub Pages from `main`.
Several Claude sessions and computers work on it, so GitHub is the single source of truth.

## Every session
1. Start with `git fetch` and `git status`. If GitHub is ahead and the working tree is clean, run `git pull --ff-only`.
2. Make the change, test it, then commit and push to `main` when the owner says so.
3. If a push is rejected, pull and merge. Never force-push, and read what came in before resolving conflicts.
4. Tell the owner about anything that arrived from another session (other branches, merged pull requests).

## Do not touch
- `config.js` is the owner's encrypted login vault. Never overwrite it with the `PTB_VAULT = null` placeholder, and never commit passwords, tokens or keys.
- Keep this repo outside OneDrive (it lives in `C:\dev\bench-crm`). OneDrive can corrupt a `.git` folder.

## Layout
- `app.js` is the whole app. `index.html` holds the styles. `logo.png` is printed on invoices, estimates, work orders and reports.
- `tests/` has the test files and fixtures added by earlier sessions. They need Node to run.
