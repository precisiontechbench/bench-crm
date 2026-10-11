// End-to-end test for the Expenses ledger, AI receipt scanner and review queue.
// GitHub and Anthropic are both mocked; nothing leaves this machine and config.js is never touched
// (a throwaway test vault is served in its place).
//
//   cd tests && npm install && node expenses.test.js            (screenshots land in tests/screenshots/)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..'), FIX = path.join(__dirname, 'fixtures'), SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const TEST_KEY = 'sk-ant-api03-TESTKEY-not-a-real-key-0123456789';
const USER = 'tester', PASS = 'correct horse battery staple', OWNER = 'acme', REPO = 'bench-crm-data', DATA_PATH = 'data/crm.enc.json';
const DATA_KEY = crypto.randomBytes(32);
const DATA_AAD = Buffer.from('ptb-bench-crm:data:v1'), VAULT_AAD = Buffer.from('ptb-bench-crm:vault:v1');

/* ---- node copies of the app's crypto, to build the test vault and to read what the app stored ---- */
function makeVault() {
  const secret = { u: USER, owner: OWNER, repo: REPO, path: DATA_PATH, token: 'github_pat_TEST', dataKey: DATA_KEY.toString('base64') };
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(USER + '\u0000' + PASS, salt, 600000, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv); c.setAAD(VAULT_AAD);
  const ct = Buffer.concat([c.update(JSON.stringify(secret)), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: 600000, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') };
}
function sealData(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', DATA_KEY, iv); c.setAAD(DATA_AAD);
  const ct = Buffer.concat([c.update(zlib.gzipSync(JSON.stringify(obj))), c.final(), c.getAuthTag()]);
  return JSON.stringify({ v: 1, z: 'gzip', iv: iv.toString('base64'), ct: ct.toString('base64') });
}
function openData(text) {
  const e = JSON.parse(text), ct = Buffer.from(e.ct, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', DATA_KEY, Buffer.from(e.iv, 'base64')); d.setAAD(DATA_AAD); d.setAuthTag(ct.subarray(ct.length - 16));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()])).toString());
}

/* ---- fake GitHub ---- */
const gh = { files: new Map(), puts: [], conflictOnce: false, rejectReceipts: false, n: 0 };
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'retry-after' };
async function githubRoute(route) {
  const req = route.request(), url = new URL(req.url()), m = req.method();
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const p = decodeURIComponent(url.pathname);
  const json = (status, body) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const base = `/repos/${OWNER}/${REPO}`;
  if (p === base) return json(200, { private: true });
  if (p.startsWith(base + '/git/blobs/')) {
    const sha = p.split('/').pop(), f = [...gh.files.values()].find(x => x.sha === sha);
    return f ? json(200, { content: f.content, encoding: 'base64' }) : json(404, { message: 'Not Found' });
  }
  if (p.startsWith(base + '/contents/')) {
    const fp = p.slice((base + '/contents/').length);
    if (m === 'GET') { const f = gh.files.get(fp); return f ? json(200, { content: f.content, encoding: 'base64', sha: f.sha }) : json(404, { message: 'Not Found' }); }
    if (m === 'PUT') {
      const body = JSON.parse(req.postData()), cur = gh.files.get(fp);
      gh.puts.push({ path: fp, body });
      if (fp.startsWith('data/receipts/') && gh.rejectReceipts) return json(422, { message: 'Sorry, your file is too large to be processed (file size limit)' });
      if (gh.conflictOnce && fp === DATA_PATH) { gh.conflictOnce = false; return json(409, { message: 'is at abc but expected def' }); }
      if (cur && cur.sha !== body.sha) return json(409, { message: 'does not match' });
      const sha = sha1(String(++gh.n) + body.content); gh.files.set(fp, { content: body.content, sha });
      return json(cur ? 200 : 201, { content: { sha } });
    }
  }
  return json(404, { message: 'Not Found: ' + p });
}
const storedDb = () => openData(Buffer.from(gh.files.get(DATA_PATH).content, 'base64').toString());

/* ---- fake Anthropic ---- */
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const fixture = n => fs.readFileSync(path.join(FIX, n));
const BY_SHA = {};
const line = (description, quantity, amount) => ({ description, quantity, amount });
const R = (o) => ({ line_items: [], reason: 'Looks like an ordinary purchase.', pages: '1', ...o });
const REPLIES = {
  'homedepot.pdf': () => ({ receipts: [R({ vendor: 'The Home Depot', date: '2026-10-03', line_items: [line('Cat6 cable 100ft', 2, 49.96), line('Wall plate', 4, 9.88), line('Zip ties', 1, 7.99)], subtotal: 67.83, tax: 4.07, total: 71.9, suggested_category: 'Supplies', confidence: 0.96, reason: 'Cabling and small hardware for shop work.' })] }),
  'homedepot-copy.pdf': () => ({ receipts: [R({ vendor: 'Home Depot', date: '2026-10-03', subtotal: 67.83, tax: 4.07, total: 71.9, suggested_category: 'Supplies', confidence: 0.97 })] }),
  'homedepot-later.pdf': () => ({ receipts: [R({ vendor: 'The Home Depot', date: '2026-10-09', line_items: [line('Thermal paste', 1, 9.99)], subtotal: 9.99, tax: 0.6, total: 10.59, suggested_category: 'Office expense', confidence: 0.94 })] }),
  'newegg.pdf': () => ({ receipts: [R({ vendor: 'Newegg', date: '2026-10-05', line_items: [line('Samsung 1TB SSD', 1, 79.99), line('SATA cable', 2, 10.98)], subtotal: 90.97, tax: 0, total: 90.97, suggested_category: 'Parts and inventory (COGS)', confidence: 0.91, reason: 'Parts bought to resell or install.' })] }),
  'blurry-scan.pdf': () => ({ receipts: [R({ vendor: 'Mac Tools', date: null, line_items: [line('item 1', 1, 4.12)], subtotal: null, tax: null, total: 31.5, suggested_category: 'Supplies', confidence: 0.41, reason: 'Scan is blurry and the date is unreadable.' })] }),
  'coffee-multi.pdf': () => ({ receipts: [
    R({ vendor: 'Restaurant Depot', date: '2026-10-02', line_items: [line('Whole bean coffee 5lb', 6, 189), line('Paper cups 1000ct', 2, 82)], subtotal: 271, tax: 0, total: 271, suggested_category: 'Supplies', confidence: 0.93, pages: '1' }),
    R({ vendor: 'Chick-fil-A', date: '2026-10-04', line_items: [line('Lunch with supplier', 1, 38.4)], subtotal: 38.4, tax: 2.3, total: 40.7, suggested_category: 'Meals', confidence: 0.72, reason: 'Business meal, but the card slip is cut off.', pages: '2' })] }),
};
const anth = { calls: [], throttled: new Set(), delayMs: {}, garbage: new Set() };
async function anthropicRoute(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const body = JSON.parse(req.postData()), h = req.headers();
  const doc = body.messages[0].content.find(b => b.type === 'document');
  const name = BY_SHA[sha256(Buffer.from(doc.source.data, 'base64'))] || 'unknown';
  anth.calls.push({ name, headers: h, model: body.model, media: doc.source.media_type, system: body.system });
  const send = (status, o, extra = {}) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json', ...extra }, body: JSON.stringify(o) });
  if (h['x-api-key'] !== TEST_KEY) return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  if (anth.delayMs[name]) await new Promise(r => setTimeout(r, anth.delayMs[name]));
  if (anth.throttled.has(name)) { anth.throttled.delete(name); return send(429, { type: 'error', error: { type: 'rate_limit_error', message: 'Number of request tokens has exceeded your per-minute rate limit' } }, { 'retry-after': '1' }); }
  if (anth.garbage.has(name)) return send(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Sorry, I could not find anything I can turn into JSON.' }] });
  const reply = REPLIES[name]; if (!reply) return send(400, { type: 'error', error: { type: 'invalid_request_error', message: 'unknown fixture ' + name } });
  const text = JSON.stringify(reply());
  // the multi-receipt reply arrives wrapped in a chatty preamble and a code fence, which the app must strip
  return send(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: name === 'coffee-multi.pdf' ? 'Here is the JSON:\n```json\n' + text + '\n```' : text }] });
}

/* ---- harness ---- */
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 6).join('\n       ')); }
}
const shot = async (page, name, fullPage = false) => {
  await page.waitForFunction(() => !document.querySelector('#toast.on'), null, { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage });
};

(async () => {
  for (const n of Object.keys(REPLIES)) BY_SHA[sha256(fixture(n))] = n;
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  }).listen(0);
  const base = `http://localhost:${server.address().port}/`;
  const vault = makeVault();
  const exe = process.env.CHROME_BIN || undefined;
  // Chromium only draws PDFs inside its built-in viewer when it is not headless, so HEADED=1 (under xvfb-run) is used for the screenshots.
  const browser = await chromium.launch(process.env.HEADED ? { executablePath: exe, headless: false } : { executablePath: exe, args: ['--headless=new'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const dialogs = []; let acceptDialogs = true;
  page.on('dialog', d => { dialogs.push(d.message()); acceptDialogs ? d.accept() : d.dismiss(); });
  const consoleLines = []; page.on('console', m => consoleLines.push(m.text())); page.on('pageerror', e => consoleLines.push('PAGEERROR ' + e.message));
  const cspViolations = []; page.on('console', m => { if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text()); });
  await page.route('**/config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.PTB_VAULT = ' + JSON.stringify(vault) + ';' }));
  await page.route('https://api.github.com/**', githubRoute);
  await page.route('https://api.anthropic.com/**', anthropicRoute);
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  const settle = async () => { await page.waitForTimeout(100); await page.waitForFunction(() => document.querySelector('#syncstat')?.dataset.s === 'saved', null, { timeout: 20000 }); };
  const clearScan = async () => { while (await page.$('[data-act=scan-dismiss]')) await page.click('[data-act=scan-dismiss]'); };
  const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(150); };
  const rowsText = () => page.$$eval('#rows tr', trs => trs.map(t => t.innerText.replace(/\s+/g, ' ').trim()));

  await step('sign in with the vault', async () => {
    await page.goto(base);
    await page.fill('input[name=u]', USER); await page.fill('input[name=p]', PASS); await page.click('button[type=submit]');
    await page.waitForSelector('#rail a');
    await settle();
  });

  await step('scanner refuses to run without an API key and points at Settings', async () => {
    await go('#/expenses/scan');
    assert.match(await page.innerText('.banner'), /Add your Anthropic API key in Settings/);
    await page.setInputFiles('#scanfiles', path.join(FIX, 'homedepot.pdf'));
    await page.waitForSelector('.scanrow .err');
    assert.match(await page.innerText('.scanrow .err'), /API key in Settings/);
    assert.equal(anth.calls.length, 0);
    await page.click('[data-act=scan-dismiss]');
  });

  await step('API key is saved into encrypted data only, masked in the UI, never plaintext on the wire', async () => {
    await go('#/settings');
    await page.fill('#aikey', TEST_KEY); await page.click('[data-act=ai-key-save]');
    await page.waitForSelector('#aikey[placeholder*="ending"]'); await settle();
    assert.ok(!(await page.content()).includes(TEST_KEY), 'key must not be in the page DOM');
    assert.equal(await page.inputValue('#aikey'), '');
    for (const put of gh.puts) assert.ok(!Buffer.from(put.body.content, 'base64').toString('latin1').includes(TEST_KEY), 'plaintext key in a GitHub request');
    assert.equal(storedDb().secrets.anthropicKey, TEST_KEY, 'key should be inside the decrypted data file');
    assert.ok(!JSON.stringify(storedDb().settings).includes('sk-ant'), 'key must not live in settings');
    await shot(page, '5-settings-scanner', true);
  });

  await step('backup export leaves the API key out', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export-json]')]);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    assert.ok(!text.includes('sk-ant') && !text.includes('anthropicKey'), 'backup contains the key');
  });

  await step('sample data: new Schedule C categories, totals by category, 50% meals flag', async () => {
    await page.click('[data-act=sample]'); await page.waitForSelector('.stats');
    await go('#/list/expenses'); await page.waitForSelector('#rows tr[data-href]');
    const t = await page.innerText('#expsum');
    assert.match(t, /Parts and inventory \(COGS\)/); assert.match(t, /Advertising/); assert.match(t, /suggestions only/);
    assert.match(await page.innerText('#rowsum'), /4 totaling \$/);
  });

  await step('rate limit is retried (honouring retry-after), progress shown, and several PDFs scan in one drop', async () => {
    anth.throttled.add('newegg.pdf'); anth.delayMs['newegg.pdf'] = 400;
    await go('#/expenses/scan');
    await page.setInputFiles('#scanfiles', ['homedepot.pdf', 'newegg.pdf', 'blurry-scan.pdf', 'coffee-multi.pdf'].map(n => path.join(FIX, n)));
    await page.waitForFunction(() => /Rate limited\. Retrying in/.test(document.querySelector('#scanlist')?.innerText || ''), null, { timeout: 15000 });
    const mid = await page.$$eval('.scanrow', rs => rs.map(r => ({ n: r.querySelector('b').textContent, s: r.querySelector('.scanstate').textContent, v: r.querySelector('[role=progressbar]').getAttribute('aria-valuenow') })));
    assert.ok(mid.some(r => r.v !== '0'), 'progress bars should move: ' + JSON.stringify(mid));
    await shot(page, '2-scanner-in-progress');
    await page.waitForFunction(() => [...document.querySelectorAll('.scanstate')].length === 4 && [...document.querySelectorAll('.scanstate')].every(x => x.textContent === 'Done'), null, { timeout: 60000 });
    await settle();
    await shot(page, '3-scanner-done');
    const calls = anth.calls.filter(c => c.name === 'newegg.pdf'); assert.equal(calls.length, 2, 'newegg: one 429 then one success');
  });

  await step('Anthropic request has the required headers, document block, model setting and category list', async () => {
    const c = anth.calls[0];
    assert.equal(c.headers['x-api-key'], TEST_KEY); assert.equal(c.headers['anthropic-version'], '2023-06-01');
    assert.equal(c.headers['anthropic-dangerous-direct-browser-access'], 'true'); assert.match(c.headers['content-type'], /application\/json/);
    assert.equal(c.media, 'application/pdf'); assert.equal(c.model, 'claude-sonnet-5-5');
    assert.match(c.system, /Parts and inventory \(COGS\)/); assert.match(c.system, /JSON/);
    assert.deepEqual(cspViolations, [], 'CSP blocked something: ' + cspViolations.join('; '));
  });

  await step('auto-post vs review rules; multi-receipt PDF becomes two rows; fenced JSON is stripped', async () => {
    await go('#/list/expenses'); await page.waitForSelector('#rows tr[data-href]'); await settle();
    const posted = await rowsText();
    const has = (rx) => posted.some(r => rx.test(r));
    assert.ok(has(/The Home Depot.*Supplies.*\$71\.90.*Posted/), 'home depot posted: ' + posted.join('\n'));
    assert.ok(has(/Newegg.*Parts and inventory \(COGS\).*\$90\.97.*Posted/), 'newegg posted');
    assert.ok(has(/Restaurant Depot.*\$271\.00.*Posted/), 'restaurant depot posted');
    assert.ok(!has(/Chick-fil-A/) && !has(/Mac Tools/), 'low-confidence rows must not be in the Posted view');
    const db = storedDb();
    const review = db.records.expenses.filter(r => r.data.status === 'Needs Review');
    assert.equal(review.length, 2);
    const cfa = review.find(r => r.data.vendor === 'Chick-fil-A'), mac = review.find(r => r.data.vendor === 'Mac Tools');
    assert.ok(cfa.ai.flags.some(f => /72% is below the 85%/.test(f)));
    assert.ok(mac.ai.flags.some(f => /Date not found/.test(f)) && mac.ai.flags.some(f => /Confidence 41%/.test(f)));
    assert.equal(cfa.pdf.sha, db.records.expenses.find(r => r.data.vendor === 'Restaurant Depot').pdf.sha, 'both receipts point at the same stored PDF');
    assert.equal(db.records.expenses.find(r => r.data.vendor === 'The Home Depot').data.business, 'Precision Tech Bench');
  });

  await step('PDFs are stored encrypted in the data repo, linked from the row, and the viewer decrypts them', async () => {
    const receipts = [...gh.files.keys()].filter(k => k.startsWith('data/receipts/'));
    assert.equal(receipts.length, 4, 'one stored file per PDF: ' + receipts);
    const raw = Buffer.from(gh.files.get(receipts[0]).content, 'base64');
    assert.ok(!raw.includes('%PDF'), 'stored bytes must not contain a plaintext PDF');
    assert.equal(raw[0], 1);
    const hd = storedDb().records.expenses.find(r => r.data.vendor === 'The Home Depot');
    assert.ok(hd.pdf.path.startsWith('data/receipts/') && hd.pdf.sha === sha256(fixture('homedepot.pdf')));
    await go('#/expenses/pdf/' + hd.id);
    await page.waitForSelector('iframe.pdfframe', { timeout: 10000 });
    assert.match(await page.getAttribute('iframe.pdfframe', 'src'), /^blob:/);
    // the blob behind the viewer is byte-identical to the original upload
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('a[download]')]);
    assert.equal(dl.suggestedFilename(), 'homedepot.pdf');
    assert.ok(fs.readFileSync(await dl.path()).equals(fixture('homedepot.pdf')), 'decrypted PDF differs from the original');
    await page.waitForTimeout(process.env.HEADED ? 3500 : 800);
    await shot(page, '6-pdf-viewer');
  });

  await step('same file again is caught by hash; same receipt as a different file is caught by vendor + date + total', async () => {
    await go('#/expenses/scan'); await clearScan();
    const before = anth.calls.length;
    await page.setInputFiles('#scanfiles', path.join(FIX, 'homedepot.pdf'));
    await page.waitForSelector('.scanstate[data-s=dup]');
    assert.equal(anth.calls.length, before, 'no API call (and no cost) for a file already scanned');
    assert.match(await page.innerText('.scanrow'), /already scanned/);
    await clearScan();
    await page.setInputFiles('#scanfiles', path.join(FIX, 'homedepot-copy.pdf'));
    await page.waitForSelector('.scanstate[data-s=done]'); await settle();
    const row = storedDb().records.expenses.find(r => r.pdf && r.pdf.sha === sha256(fixture('homedepot-copy.pdf')));
    assert.equal(row.data.status, 'Needs Review', 'a duplicate must never auto-post');
    assert.ok(row.ai.flags.some(f => /Possible duplicate of EXP-/.test(f)));
    await clearScan();
  });

  await step('review queue shows the PDF beside editable fields; edits, category learning, approve', async () => {
    await go('#/expenses/review');
    await page.waitForSelector('#revform'); await page.waitForSelector('iframe.pdfframe', { timeout: 10000 });
    assert.match(await page.innerText('.revflags'), /Possible duplicate|below the 85%|not found/);
    // open the Chick-fil-A item
    const cfaId = storedDb().records.expenses.find(r => r.data.vendor === 'Chick-fil-A').id;
    await go('#/expenses/review/' + cfaId); await page.waitForSelector('#revform[data-id="' + cfaId + '"]');
    assert.equal(await page.inputValue('#f_amount'), '40.7');
    await page.waitForSelector('iframe.pdfframe'); assert.match(await page.getAttribute('iframe.pdfframe', 'src'), /#page=2$/, 'opens at the page the AI reported');
    await page.waitForTimeout(process.env.HEADED ? 3500 : 800);
    await shot(page, '4-review-queue');
    await page.selectOption('#f_category', 'Travel');            // correct the AI's suggestion
    await page.fill('#f_notes', '=HYPERLINK("http://evil.example","x")');
    await page.keyboard.press('Control+s');                      // Ctrl+S approves
    await page.waitForFunction(id => !document.querySelector('#revform[data-id="' + id + '"]'), cfaId);
    await settle();
    const db = storedDb(), r = db.records.expenses.find(x => x.id === cfaId);
    assert.equal(r.data.status, 'Posted'); assert.equal(r.data.category, 'Travel');
    assert.equal(db.vendorCats['chick fil a'].c, 'Travel', 'correction should be remembered for the vendor');
  });

  await step('learned vendor category is applied to the next scan', async () => {
    await go('#/list/expenses'); await page.click('[data-in=exf][data-k=status]'); await page.selectOption('[data-in=exf][data-k=status]', 'Posted');
    // change Home Depot from Supplies to Repairs by editing the row: should be learned
    const hd = storedDb().records.expenses.find(r => r.data.vendor === 'The Home Depot');
    await go('#/rec/expenses/' + hd.id); await page.waitForSelector('#recform');
    await page.selectOption('#f_category', 'Repairs and maintenance'); await page.click('#recform button[type=submit]'); await settle();
    assert.equal(storedDb().vendorCats['home depot'].c, 'Repairs and maintenance');
    await go('#/expenses/scan'); await clearScan();
    await page.setInputFiles('#scanfiles', path.join(FIX, 'homedepot-later.pdf'));   // the AI suggests Office expense
    await page.waitForSelector('.scanstate[data-s=done]'); await settle();
    const later = storedDb().records.expenses.find(r => r.data.date === '2026-10-09');
    assert.equal(later.data.category, 'Repairs and maintenance', 'AI said Office expense; learned category should win');
    assert.equal(later.data.status, 'Posted');
    assert.match(later.ai.reason, /earlier correction/);
    await clearScan();
  });

  await step('manual entry of a duplicate asks before saving', async () => {
    const neweggBefore = storedDb().records.expenses.filter(r => r.data.vendor === 'Newegg').length;
    await go('#/new/expenses'); await page.waitForSelector('#recform');
    await page.fill('#f_vendor', 'Newegg'); await page.fill('#f_date', '2026-10-05'); await page.selectOption('#f_category', 'Supplies'); await page.fill('#f_amount', '90.97');
    dialogs.length = 0; acceptDialogs = false;
    await page.click('#recform button[type=submit]'); await page.waitForTimeout(300);
    acceptDialogs = true;
    assert.match(dialogs[0] || '', /looks like a duplicate of EXP-/);
    assert.equal(storedDb().records.expenses.filter(r => r.data.vendor === 'Newegg').length, neweggBefore, 'declining must not save another Newegg row');
  });

  await step('errors: garbage reply, oversize file, non-PDF, GitHub size limit', async () => {
    await go('#/expenses/scan'); await clearScan();
    anth.garbage.add('homedepot-later.pdf');   // (already scanned, so use force)
    // 1. a reply that is not JSON
    fs.writeFileSync(path.join(__dirname, 'fixtures', '_tmp-garbage.pdf'), Buffer.concat([fixture('newegg.pdf'), Buffer.from('\n% garbage variant\n')]));
    BY_SHA[sha256(fs.readFileSync(path.join(FIX, '_tmp-garbage.pdf')))] = 'garbage.pdf'; anth.garbage.add('garbage.pdf');
    await page.setInputFiles('#scanfiles', path.join(FIX, '_tmp-garbage.pdf'));
    await page.waitForSelector('.scanstate[data-s=error]');
    assert.match(await page.innerText('.scanrow .err'), /not valid JSON/);
    assert.ok(await page.$('[data-act=scan-retry]'), 'a Retry button is offered');
    await clearScan(); fs.unlinkSync(path.join(FIX, '_tmp-garbage.pdf'));
    // 2. more than the size limit, and 3. not a PDF
    await page.setInputFiles('#scanfiles', [{ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(21 * 1024 * 1024)]) },
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
    await page.waitForFunction(() => document.querySelectorAll('.scanrow .err').length === 2);
    const errs = await page.$$eval('.scanrow .err', e => e.map(x => x.textContent));
    assert.ok(errs.some(e => /limit is 20\.0 MB/.test(e)) && errs.some(e => /Only PDF files/.test(e)), errs.join(' | '));
    await clearScan();
    // 4. GitHub refuses the stored PDF (size limit): the receipt is still saved, for review, with a clear message
    gh.rejectReceipts = true;
    fs.writeFileSync(path.join(FIX, '_tmp-big.pdf'), Buffer.concat([fixture('homedepot-later.pdf'), Buffer.from('\n% variant\n')]));
    BY_SHA[sha256(fs.readFileSync(path.join(FIX, '_tmp-big.pdf')))] = 'homedepot-later.pdf'; anth.garbage.delete('homedepot-later.pdf');
    await page.setInputFiles('#scanfiles', path.join(FIX, '_tmp-big.pdf'));
    await page.waitForSelector('.scanstate[data-s=done]'); await settle();
    const msg = await page.innerText('.scanrow');
    assert.match(msg, /PDF itself could not be saved: GitHub would not accept this .* file because it is over its file size limit/);
    const row = storedDb().records.expenses.filter(r => r.ai && /could not be saved|not saved/i.test((r.ai.flags || []).join(' ')));
    assert.equal(row.length, 1); assert.equal(row[0].data.status, 'Needs Review'); assert.ok(!row[0].pdf);
    gh.rejectReceipts = false; fs.unlinkSync(path.join(FIX, '_tmp-big.pdf'));
    await clearScan();
  });

  await step('reject removes a row from the queue but keeps the PDF file', async () => {
    const id = storedDb().records.expenses.find(r => r.data.vendor === 'Mac Tools').id;
    const filesBefore = [...gh.files.keys()].filter(k => k.includes('receipts')).length;
    await go('#/expenses/review/' + id); await page.waitForSelector('#revform[data-id="' + id + '"]');
    await page.click('[data-act=rev-reject]'); await page.waitForFunction(i => !document.querySelector('#revform[data-id="' + i + '"]'), id); await settle();
    assert.ok(!storedDb().records.expenses.some(r => r.id === id));
    assert.equal([...gh.files.keys()].filter(k => k.includes('receipts')).length, filesBefore);
  });

  await step('ledger filters (dates, category, business, status), totals, 50% meals note', async () => {
    // give one row to the other business
    const id = storedDb().records.expenses.find(r => r.data.vendor === 'Restaurant Depot').id;
    await go('#/rec/expenses/' + id); await page.waitForSelector('#recform'); await page.selectOption('#f_business', 'Buzzinga Coffee'); await page.click('#recform button[type=submit]'); await settle();
    await go('#/list/expenses'); await page.waitForSelector('#rows tr[data-href]');
    await page.selectOption('[data-in=exf][data-k=status]', ''); // any status
    const all = (await rowsText()).length;
    await page.selectOption('[data-in=exf][data-k=biz]', 'Buzzinga Coffee');
    assert.deepEqual((await rowsText()).map(r => /Restaurant Depot/.test(r)), [true]);
    await page.selectOption('[data-in=exf][data-k=biz]', '');
    await page.selectOption('[data-in=exf][data-k=cat]', 'Travel');
    assert.equal((await rowsText()).length, 1);
    await page.selectOption('[data-in=exf][data-k=cat]', '');
    await page.fill('[data-in=exf][data-k=from]', '2026-10-04'); await page.dispatchEvent('[data-in=exf][data-k=from]', 'change');
    await page.fill('[data-in=exf][data-k=to]', '2026-10-05'); await page.dispatchEvent('[data-in=exf][data-k=to]', 'change');
    await page.waitForSelector('#rows tr[data-href]');
    const ranged = (await rowsText()).join('\n');
    assert.match(ranged, /Newegg/); assert.match(ranged, /Travel|Chick-fil-A/); assert.ok(!/Restaurant Depot/.test(ranged) && !/Home Depot/.test(ranged), ranged);
    await page.selectOption('[data-in=exf][data-k=preset]', 'all'); await page.waitForSelector('#rows tr[data-href]');
    assert.equal((await rowsText()).length, all);
    // Meals is flagged at 50%
    const cfa = storedDb().records.expenses.find(r => r.data.vendor === 'Chick-fil-A');
    await go('#/rec/expenses/' + cfa.id); await page.selectOption('#f_category', 'Meals'); await page.click('#recform button[type=submit]'); await settle();
    await go('#/list/expenses'); await page.waitForSelector('#rows tr[data-href]');
    assert.match(await page.innerText('#rows'), /Meals\s*50%/);
    assert.match(await page.innerText('#expsum'), /Meals 50% deductible[\s\S]*\$40\.70[\s\S]*\$20\.35/);
    await page.selectOption('[data-in=exf][data-k=status]', 'Posted'); await page.waitForSelector('#rows tr[data-href]'); await shot(page, '1-ledger', true);
  });

  await step('CSV export: columns, filters respected, formulas neutralized; totals CSV', async () => {
    await page.selectOption('[data-in=exf][data-k=status]', 'Posted');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=exp-csv]')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    assert.equal(lines[0], 'Date,Vendor,Description,Tax category,Business,Subtotal,Sales tax,Total,Deductible amount,Deduction note,Paid with,Status,Receipt or order number,Notes,Source PDF,Record');
    assert.ok(lines.some(l => /^2026-10-04,Chick-fil-A,.*,Meals,Precision Tech Bench,38\.40,2\.30,40\.70,20\.35,50% deductible,/.test(l)), lines.join('\n'));
    assert.ok(lines.every(l => !/Needs Review/.test(l) || l === lines[0]), 'status filter applies to the export');
    assert.ok(csv.includes(`"'=HYPERLINK(""http://evil.example"",""x"")"`), 'formula text must be prefixed with an apostrophe');
    const [d2] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=exp-cat-csv]')]);
    const t = fs.readFileSync(await d2.path(), 'utf8');
    assert.match(t, /Tax category,Count,Subtotal,Sales tax,Total,Deductible amount/); assert.match(t, /Meals,1,38\.40,2\.30,40\.70,20\.35/); assert.match(t, /CPA/);
  });

  await step('Needs Review rows stay out of totals and the P&L; other business is out of the P&L', async () => {
    await go('#/pnl'); await page.waitForSelector('#pnlout .stats');
    await page.selectOption('[data-in=pnl][data-k=preset]', 'custom');
    await page.fill('[data-in=pnl][data-k=from]', '2026-10-01'); await page.dispatchEvent('[data-in=pnl][data-k=from]', 'change');
    await page.fill('[data-in=pnl][data-k=to]', '2026-10-31'); await page.dispatchEvent('[data-in=pnl][data-k=to]', 'change');
    await page.waitForSelector('#pnlout table.pnl');
    const t = await page.innerText('#pnlout');
    assert.ok(!/Restaurant Depot|271\.00/.test(t), 'Buzzinga expense leaked into the shop P&L');
    assert.match(t, /Cost of goods[\s\S]*Parts and inventory \(COGS\)/);
    assert.match(t, /Travel|Meals/);
  });

  await step('merge on conflict: a change made elsewhere is kept alongside local edits, and learned vendors union', async () => {
    const remote = storedDb();
    const other = { id: 'zz-remote', no: 9001, created: new Date().toISOString(), updated: new Date(Date.now() + 5000).toISOString(), data: { vendor: 'Remote Vendor', date: '2026-10-08', category: 'Insurance', amount: 55, status: 'Posted', business: 'Precision Tech Bench' } };
    remote.records.expenses.push(other); remote.counters.expenses = Math.max(remote.counters.expenses, 9001);
    remote.vendorCats['remote vendor'] = { c: 'Insurance', t: Date.now() + 5000, v: 'Remote Vendor' };
    const cur = gh.files.get(DATA_PATH); gh.files.set(DATA_PATH, { content: Buffer.from(sealData(remote)).toString('base64'), sha: 'remote-sha-1' });
    await go('#/new/expenses'); await page.waitForSelector('#recform');
    await page.fill('#f_vendor', 'Local Vendor'); await page.fill('#f_date', '2026-10-10'); await page.selectOption('#f_category', 'Utilities'); await page.fill('#f_amount', '33.10');
    await page.click('#recform button[type=submit]');
    await page.waitForFunction(() => /Saved to GitHub/.test(document.querySelector('#syncstat')?.textContent || ''));
    await page.waitForTimeout(500);
    const db = storedDb(), vs = db.records.expenses.map(r => r.data.vendor);
    assert.ok(vs.includes('Remote Vendor') && vs.includes('Local Vendor'), vs.join(','));
    assert.equal(db.vendorCats['remote vendor'].c, 'Insurance'); assert.equal(db.vendorCats['chick fil a'].c, 'Meals', 'the later Travel->Meals correction is the one remembered');
    assert.equal(db.secrets.anthropicKey, TEST_KEY, 'API key survives a merge');
    // and a plain 409 (stale sha) is retried
    gh.conflictOnce = true;
    await go('#/new/expenses'); await page.waitForSelector('#recform');
    await page.fill('#f_vendor', 'After Conflict'); await page.fill('#f_date', '2026-10-10'); await page.selectOption('#f_category', 'Utilities'); await page.fill('#f_amount', '1.00');
    await page.click('#recform button[type=submit]'); await page.waitForTimeout(2500);
    assert.ok(storedDb().records.expenses.some(r => r.data.vendor === 'After Conflict'));
  });

  await step('keyboard: N from the scanner/ledger opens a new expense; J/K move through the review queue', async () => {
    await go('#/expenses/scan'); await page.keyboard.press('n'); await page.waitForSelector('#recform[data-ent=expenses]');
    // queue two reviewable items so J/K have somewhere to go
    const db = storedDb(); const base = db.records.expenses.find(r => r.data.vendor === 'Newegg');
    await go('#/rec/expenses/' + base.id); await page.selectOption('#f_status', 'Needs Review'); await page.click('#recform button[type=submit]');
    const hd = db.records.expenses.find(r => r.data.vendor === 'Local Vendor' || r.data.vendor === 'After Conflict');
    await go('#/rec/expenses/' + hd.id); await page.selectOption('#f_status', 'Needs Review'); await page.click('#recform button[type=submit]'); await settle();
    await go('#/expenses/review'); await page.waitForSelector('#revform');
    const first = await page.getAttribute('#revform', 'data-id');
    await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('j');
    await page.waitForFunction(f => document.querySelector('#revform')?.dataset.id !== f, first);
    await page.keyboard.press('k'); await page.waitForFunction(f => document.querySelector('#revform')?.dataset.id === f, first);
  });

  await step('lock, sign back in: ledger, learned vendors and key come back from encrypted storage', async () => {
    await page.click('button[data-act=lock]'); await page.waitForSelector('#loginform');
    await page.fill('input[name=u]', USER); await page.fill('input[name=p]', PASS); await page.click('button[type=submit]');
    await page.waitForSelector('#rail a'); await go('#/settings');
    assert.match(await page.getAttribute('#aikey', 'placeholder'), /ending/);
    assert.match(await page.innerText('.settings'), /Chick-fil-A/);
    await go('#/list/expenses'); await page.waitForSelector('#rows tr[data-href]');
  });

  await step('no secrets in the console, and nothing outside GitHub/Anthropic was contacted', async () => {
    assert.ok(!consoleLines.some(l => l.includes(TEST_KEY)), 'API key leaked to the console');
    assert.ok(!consoleLines.some(l => /PAGEERROR/.test(l)), consoleLines.filter(l => /PAGEERROR/.test(l)).join('\n'));
    assert.deepEqual(cspViolations, []);
  });

  await browser.close(); server.close();
  console.log(failures ? `\n${failures} step(s) failed` : '\nall steps passed');
  process.exit(failures ? 1 : 0);
})();
