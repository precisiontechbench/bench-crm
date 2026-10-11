# PTB Bench CRM

A static, installable web app (served from GitHub Pages) for running the repair bench: customers, devices, tickets, estimates, invoices, services, expenses and follow-ups.

Records are encrypted in the browser (AES-256-GCM) and saved to a **private** data repository (`bench-crm-data`). The app signs in with `config.js`, an encrypted vault holding the GitHub token and the data key. `config.js` is never edited by hand or by the scanner; to change the login, use Settings > Security.

Keyboard: `N` new, `/` search, `Ctrl+S` save, `Alt+1`-`Alt+9` sections, `J`/`K` move through lists and the review queue.

## Expenses and the AI receipt scanner

Expenses has four tabs: **Ledger**, **Scan receipts**, **Needs review**, **Profit & Loss**.

**Ledger.** Date, vendor, description, subtotal, sales tax, total, tax category, business (Precision Tech Bench / Buzzinga Coffee), payment method, notes, source PDF and status (Posted / Needs Review). Filter by date range, category, business and status; totals by category (with the Meals 50% rule applied) sit above the table. **Export CSV** and **Totals CSV** give your accountant exactly what is on screen (filters and search included). Text cells that start with `=`, `+`, `-` or `@` are prefixed with an apostrophe so a spreadsheet never runs them as formulas.

**Tax categories** default to IRS Schedule C lines: Advertising, Car and truck, Contract labor, Insurance, Legal and professional, Office expense, Rent or lease, Repairs and maintenance, Supplies, Taxes and licenses, Travel, Meals, Utilities, Software and subscriptions, Parts and inventory (COGS), Other. Edit the list under Expenses > Edit fields > Tax category. They are suggestions only; **your CPA should confirm them.** Settings lets you choose which categories are only 50% deductible (Meals by default) and which count as cost of goods on the Profit & Loss report. Existing data on the old default category list is moved to these categories once, automatically. A list you had customized is left alone.

**Scanner.** Drop one or many PDFs on Scan receipts. Each PDF is sent to the Anthropic Messages API as a base64 document and the reply is validated (code fences stripped, dates, amounts, category and confidence checked) before anything is saved. Multi-page PDFs, scans and PDFs holding several receipts are handled; each receipt becomes its own row. Each file shows its own progress, errors have a Retry button, and rate limits (429), overload and server errors are retried automatically with a visible countdown. Files are scanned one at a time. The limit is 20 MB per PDF.

**Posting rules.** A receipt is posted automatically only when confidence is at least 85%, the vendor, date and total are all present, **and** it is not a possible duplicate, the subtotal plus tax matches the total, the date is not in the future and the PDF was saved. Anything else goes to **Needs review** with the reasons listed, the PDF beside editable fields, and Approve / Save edits / Reject. Needs Review rows are left out of ledger totals and the Profit & Loss report.

**Duplicates** (same vendor, date and total, in any status) are never posted silently: scanned ones go to review with a warning, and manual saves and approvals ask first. Scanning the exact same file twice is caught by its hash before any API call is made.

**Learning.** When you change a row's category, the app remembers vendor -> category (inside the encrypted data) and applies it on later scans. Settings lists what it has learned and lets you forget entries.

**PDF storage.** Each original PDF is encrypted with the same data key and saved as `<data folder>/receipts/<id>.pdf.enc` in the private data repository, linked from its ledger row. Click **View PDF** on a row to decrypt and view it. A file over the size limit is refused with a clear message (the receipt is still saved, for review, without its PDF). Rejecting or deleting a row keeps the PDF file on purpose, since these are tax records; delete the file in GitHub if you want it gone.

**Profit & Loss** counts only Posted expenses for the first business in the list (Precision Tech Bench), because it is built from this shop's invoices.

## Setup

1. Deploy as before (GitHub Pages) and sign in. No change to `config.js` is needed.
2. In the [Anthropic console](https://console.anthropic.com) create an API key just for this app.
3. **Set a low monthly spend limit on that key / workspace** (for example $10-$20) under the console's limits and billing settings. The key lives in a browser, so a spend cap is your safety net.
4. In Bench CRM open **Settings > Receipt scanner (AI)**, paste the key and press Save key. The default model is `claude-sonnet-5-5`; change it in the same section.
5. Pick the business on Scan receipts and drop your PDFs.

### Where the API key lives

- Only inside the AES-256-GCM encrypted data file (`db.secrets`), decrypted after you sign in and held in memory. It is not in `config.js`, not in the page, not in the backup JSON (Export backup leaves it out) and never logged. The settings field shows only the last four characters.
- Erase all data and Restore backup keep the stored key. Use Remove key to delete it. Locking the app clears it from memory.
- Because the key is read in the browser, the request carries `anthropic-dangerous-direct-browser-access: true`. Anyone who can sign in to the CRM can use the key, which is another reason to cap its spend.

### Content Security Policy

`connect-src` now also allows `https://api.anthropic.com` and nothing else new. The PDF viewer needs `frame-src blob:` so the browser can show the decrypted PDF in an iframe; it only allows frames from blob URLs this page created.

## Tests

`tests/expenses.test.js` drives the real app in Chromium with GitHub and Anthropic both mocked (a stateful fake repository, including 409 conflicts and size rejections, and per-file fake AI replies including a 429 and a fenced reply). It uses a throwaway vault, so `config.js` is untouched. It covers sign-in, key storage, scanning, posting rules, duplicates, learning, review, PDF storage and viewing, ledger filters, CSV export, merge on conflict, and keyboard shortcuts, and writes screenshots to `tests/screenshots/`.

```
cd tests
npm install
python3 make_fixtures.py        # only to rebuild the sample PDFs (needs reportlab and Pillow)
node expenses.test.js           # headless
HEADED=1 xvfb-run -a node expenses.test.js    # headed; needed for the PDF to draw in screenshots
```
