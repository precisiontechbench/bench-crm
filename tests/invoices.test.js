// End-to-end test for the invoice scanner (paid QuickBooks invoices -> Paid invoice records) and its review queue.
// GitHub and Anthropic are both mocked; nothing leaves this machine and config.js is never touched
// (a throwaway test vault is served in its place).
//
//   cd tests && npm install && node invoices.test.js            (screenshots land in tests/screenshots/)
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
const gh = { files: new Map(), puts: [], n: 0 };
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
const li = (description, quantity, unit_price, taxable = true, category = 'Services: Labor') => ({ description, quantity, unit_price, amount: Math.round(quantity * unit_price * 100) / 100, taxable, category });
const INV = o => ({ document_type: 'invoice', voided: false, invoice_number: null, customer: { name: null, email: null, phone: null, address: null }, date: null, due_date: null, terms: null,
  line_items: [], subtotal: null, tax: null, tax_rate_percent: 6, total: null, amount_paid: null, balance_due: null, paid: null, payment_date: null, payment_method: null,
  memo: null, confidence: 0.96, reason: 'Clear QuickBooks invoice.', pages: '1', ...o });
const JANE = { name: 'Jane Doe', email: 'jane@example.com', phone: '502-555-0101', address: '12 Oak St, Carrollton KY' };
const JANE_LINES = [li('Malware removal and cleanup', 1, 95), li('Windows tune-up', 1, 35)];
const REPLIES = {
  'inv-paid.pdf': () => ({ invoices: [INV({ invoice_number: '1001', customer: JANE, date: '2026-03-10', due_date: '2026-03-10', terms: 'Due on receipt', line_items: JANE_LINES,
    subtotal: 130, tax: 7.8, total: 137.8, amount_paid: 137.8, balance_due: 0, paid: true, payment_date: '2026-03-12', payment_method: 'Credit Card', memo: 'Thank you!', confidence: 0.97 })] }),
  'inv-paid-existing.pdf': () => ({ invoices: [INV({ invoice_number: '1002', customer: { name: 'JANE DOE', email: null, phone: null, address: null }, date: '2026-04-02', terms: 'Net 15',
    line_items: [li('SSD install', 1, 60)], subtotal: 60, tax: 3.6, total: 63.6, balance_due: 0, paid: null, payment_method: 'Check' })] }),
  'inv-unpaid.pdf': () => ({ invoices: [INV({ invoice_number: '1003', customer: { name: 'Bob Builder', email: 'bob@example.com', phone: null, address: null }, date: '2026-09-20',
    line_items: [li('Data recovery', 1, 250)], subtotal: 250, tax: 15, total: 265, amount_paid: 0, balance_due: 265, paid: false, confidence: 0.95 })] }),
  'inv-dup-number.pdf': () => ({ invoices: [INV({ invoice_number: '1001', customer: JANE, date: '2026-03-10', line_items: JANE_LINES, subtotal: 130, tax: 7.8, total: 137.8, balance_due: 0, paid: true, confidence: 0.96 })] }),
  'inv-near-customer.pdf': () => ({ invoices: [INV({ invoice_number: '1004', customer: { name: 'Jane M Doe', email: null, phone: null, address: null }, date: '2026-05-05',
    line_items: [li('Router (AX1800)', 1, 80, true, 'Parts: Hardware')], subtotal: 80, tax: 4.8, total: 84.8, balance_due: 0, paid: true })] }),
  'inv-multi.pdf': () => ({ invoices: [
    INV({ invoice_number: '1005', customer: { name: 'Carroll Diner', email: null, phone: null, address: null }, date: '2026-06-01', line_items: [li('Network cabling', 2, 120, false)], subtotal: 240, tax: 0, tax_rate_percent: 0, total: 240, balance_due: 0, paid: true, pages: '1' }),
    // the printed total does not match subtotal + tax, so this one must go to review (and keeps its customer, who now exists)
    INV({ invoice_number: '1006', customer: { name: 'Carroll Diner', email: null, phone: null, address: null }, date: '2026-06-15', line_items: [li('POS troubleshooting', 1, 150, true, 'Misc')], subtotal: 150, tax: 9, total: 160, balance_due: 0, paid: true, pages: '2' })] }),
};
const anth = { calls: [] };
async function anthropicRoute(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const body = JSON.parse(req.postData()), h = req.headers();
  const doc = body.messages[0].content.find(b => b.type === 'document'), ask = body.messages[0].content.find(b => b.type === 'text');
  const name = BY_SHA[sha256(Buffer.from(doc.source.data, 'base64'))] || 'unknown';
  anth.calls.push({ name, headers: h, model: body.model, system: body.system, ask: ask && ask.text });
  const send = (status, o) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(o) });
  if (h['x-api-key'] !== TEST_KEY) return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  const reply = REPLIES[name]; if (!reply) return send(400, { type: 'error', error: { type: 'invalid_request_error', message: 'unknown fixture ' + name } });
  const text = JSON.stringify(reply());
  return send(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: name === 'inv-multi.pdf' ? 'Here is the JSON:\n```json\n' + text + '\n```' : text }] });
}

/* ---- harness ---- */
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 8).join('\n       ')); }
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
  const scanFiles = async names => {
    await go('#/invoices/scan'); await clearScan();
    await page.setInputFiles('#scanfiles', names.map(n => path.join(FIX, n)));
    await page.waitForFunction(n => { const s = [...document.querySelectorAll('.scanstate')]; return s.length === n && s.every(x => ['Done', 'Failed', 'Already scanned'].includes(x.textContent)); }, names.length, { timeout: 60000 });
    await settle();
  };
  const inv = ref => storedDb().records.invoices.find(r => r.data.reference === ref);
  const custs = () => storedDb().records.customers;
  const custName = id => (custs().find(c => c.id === id) || { data: {} }).data.name;
  const setPnl = async (from, to, basis) => {
    await go('#/pnl'); await page.selectOption('[data-in=pnl][data-k=preset]', 'custom');
    await page.fill('[data-in=pnl][data-k=from]', from); await page.press('[data-in=pnl][data-k=from]', 'Tab');
    await page.fill('[data-in=pnl][data-k=to]', to); await page.press('[data-in=pnl][data-k=to]', 'Tab');
    await page.selectOption('[data-in=pnl][data-k=basis]', basis); await page.waitForTimeout(150);
    return page.innerText('#pnlout .stats');
  };

  await step('sign in with the vault and save the API key', async () => {
    await page.goto(base);
    await page.fill('input[name=u]', USER); await page.fill('input[name=p]', PASS); await page.click('button[type=submit]');
    await page.waitForSelector('#rail a'); await settle();
    await go('#/settings'); await page.fill('#aikey', TEST_KEY); await page.click('[data-act=ai-key-save]');
    await page.waitForSelector('#aikey[placeholder*="ending"]'); await settle();
  });

  await step('Invoices list has Scan invoices and Needs review tabs; scanner refuses to run without a key is covered by the expense test', async () => {
    await go('#/list/invoices');
    const tabs = await page.innerText('nav.tabs');
    assert.match(tabs, /All invoices/); assert.match(tabs, /Scan invoices/); assert.match(tabs, /Needs review/);
    await go('#/invoices/scan');
    assert.match(await page.innerText('h1'), /Scan invoices/);
    assert.equal(await page.getAttribute('#dz', 'data-kind'), 'invoices');
  });

  await step('two paid invoices post automatically as Closed; the customer is created once and matched case-insensitively', async () => {
    await scanFiles(['inv-paid.pdf', 'inv-paid-existing.pdf']);
    const db = storedDb(), a = inv('1001'), b = inv('1002');
    assert.equal(a.data.status, 'Closed'); assert.equal(b.data.status, 'Closed');
    assert.equal(db.records.customers.length, 1, 'one customer, not two: ' + JSON.stringify(db.records.customers.map(c => c.data.name)));
    assert.equal(a.data.customer, b.data.customer); assert.equal(custName(a.data.customer), 'Jane Doe');
    const c = db.records.customers[0].data; assert.equal(c.email, 'jane@example.com'); assert.equal(c.phone, '502-555-0101');
    // figures are kept exactly as read from the PDF
    assert.equal(a.data.subtotal, 130); assert.equal(a.data.tax, 7.8); assert.equal(a.data.total, 137.8); assert.equal(a.data.amount_paid, 137.8); assert.equal(a.data.balance, 0);
    assert.equal(a.data.date_issued, '2026-03-10'); assert.equal(a.data.paid_date, '2026-03-12'); assert.equal(a.data.payment_method, 'Card'); assert.equal(a.data.terms, 'Due on receipt');
    assert.equal(a.data.tax_rate, 6); assert.deepEqual(a.data.items.map(l => [l.d, l.q, l.p, l.t]), [['Malware removal and cleanup', 1, 95, true], ['Windows tune-up', 1, 35, true]]);
    assert.ok(a.data.items.every(l => l.c === 'Services: Labor'), 'lines carry their category');
    assert.equal(a.data.title, 'Malware removal and cleanup; Windows tune-up'); assert.equal(a.data.notes, 'Thank you!');
    // an invoice that does not show a payment date does not get a made-up one; paid with no amount means paid in full
    assert.equal(b.data.paid_date, undefined); assert.equal(b.data.amount_paid, 63.6); assert.equal(b.data.payment_method, 'Check'); assert.equal(b.data.due, '2026-04-17');
    assert.equal(a.pdf.name, 'inv-paid.pdf'); assert.equal(a.ai.newCustomer, true); assert.equal(b.ai.newCustomer, false);
    assert.equal(db.records.expenses.length, 0, 'invoices must never create expense rows');
    await shot(page, 'inv-1-scanner-done');
  });

  await step('the request is the invoice prompt, not the receipt prompt', async () => {
    const c = anth.calls[0];
    assert.equal(c.headers['x-api-key'], TEST_KEY); assert.equal(c.model, 'claude-sonnet-5-5');
    assert.match(c.system, /invoices/); assert.match(c.system, /QuickBooks/); assert.match(c.system, /"invoices":\[/); assert.ok(!/Schedule C/.test(c.system));
    assert.match(c.ask, /every invoice/); assert.match(c.system, /"Services: Labor", "Parts: Hardware"/); assert.match(c.system, /"category":string\|null/);
    assert.deepEqual(cspViolations, [], 'CSP blocked something: ' + cspViolations.join('; '));
  });

  await step('scanning invoices does not start follow-up reminders, even after the invoice is edited and saved', async () => {
    let db = storedDb();
    assert.equal(db.records.followups.length, 0);
    assert.ok(inv('1001').autoFU, 'imported invoices are marked so follow-ups never start');
    await go('#/rec/invoices/' + inv('1001').id); await page.waitForSelector('#recform');
    assert.ok(await page.$('#f_pdf'), 'the Source PDF field shows on an invoice that has one');
    await page.fill('#f_notes', 'Edited by hand'); await page.click('#recform button[type=submit]'); await settle();
    db = storedDb(); assert.equal(db.records.followups.length, 0); assert.equal(inv('1001').data.notes, 'Edited by hand'); assert.equal(inv('1001').data.status, 'Closed');
  });

  await step('unpaid, duplicate-number, near-match customer and a bad total all go to review; a customer is only created by a clean invoice', async () => {
    await scanFiles(['inv-unpaid.pdf', 'inv-dup-number.pdf', 'inv-near-customer.pdf', 'inv-multi.pdf']);
    const db = storedDb();
    const un = inv('1003'), dup = db.records.invoices.find(r => r.data.reference === '1001' && r.id !== inv('1001').id), near = inv('1004'), ok = inv('1005'), bad = inv('1006');
    assert.equal(un.data.status, 'Needs Review'); assert.ok(un.ai.flags.some(f => /Not fully paid \(\$265\.00 still due\)/.test(f)));
    assert.equal(un.data.customer, undefined, 'a review row does not create its customer yet'); assert.equal(un.data.balance, 265);
    assert.equal(dup.data.status, 'Needs Review'); assert.ok(dup.ai.flags.some(f => /Possible duplicate of INV-/.test(f)));
    assert.equal(near.data.status, 'Needs Review'); assert.ok(near.ai.flags.some(f => /close to the existing customer .*Jane Doe/.test(f))); assert.equal(near.data.customer, undefined);
    assert.equal(ok.data.status, 'Closed'); assert.equal(custName(ok.data.customer), 'Carroll Diner');
    assert.equal(bad.data.status, 'Needs Review'); assert.ok(bad.ai.flags.some(f => /Subtotal plus tax does not equal the total/.test(f)));
    assert.equal(custName(bad.data.customer), 'Carroll Diner', 'a known customer is linked even on a review row');
    assert.deepEqual(db.records.customers.map(c => c.data.name).sort(), ['Carroll Diner', 'Jane Doe']);
    assert.equal(ok.pdf.sha, bad.pdf.sha, 'both invoices in the multi-invoice PDF point at the same stored file');
    assert.equal(ok.data.tax_rate, 0); assert.equal(ok.data.items[0].t, false);
    assert.equal(near.data.items[0].c, 'Parts: Hardware'); assert.equal(bad.data.items[0].c, 'Services: Labor', 'an unknown category falls back to the default');
  });

  await step('same file again is caught by hash with no API call', async () => {
    const before = anth.calls.length;
    await go('#/invoices/scan'); await clearScan();
    await page.setInputFiles('#scanfiles', path.join(FIX, 'inv-paid.pdf'));
    await page.waitForSelector('.scanstate[data-s=dup]');
    assert.equal(anth.calls.length, before); assert.match(await page.innerText('.scanrow'), /already scanned \(INV-/);
    await clearScan();
  });

  await step('PDFs are stored encrypted under data/invoices/ and the viewer decrypts them', async () => {
    const files = [...gh.files.keys()].filter(k => k.startsWith('data/invoices/'));
    assert.equal(files.length, 6, 'one stored file per PDF: ' + files);
    assert.equal([...gh.files.keys()].filter(k => k.startsWith('data/receipts/')).length, 0);
    const raw = Buffer.from(gh.files.get(files[0]).content, 'base64'); assert.ok(!raw.includes('%PDF')); assert.equal(raw[0], 1);
    assert.ok(gh.puts.some(p => p.path.startsWith('data/invoices/') && p.body.message === 'Bench CRM invoice'));
    const a = inv('1001'); assert.ok(a.pdf.path.startsWith('data/invoices/') && a.pdf.sha === sha256(fixture('inv-paid.pdf')));
    await go('#/invoices/pdf/' + a.id);
    await page.waitForSelector('iframe.pdfframe', { timeout: 10000 });
    assert.match(await page.getAttribute('iframe.pdfframe', 'src'), /^blob:/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('a[download]')]);
    assert.equal(dl.suggestedFilename(), 'inv-paid.pdf'); assert.ok(fs.readFileSync(await dl.path()).equals(fixture('inv-paid.pdf')), 'decrypted PDF differs from the original');
    await go('#/rec/invoices/' + a.id); assert.ok(await page.$('a.btn[href^="#/invoices/pdf/"]'), 'record page links to the PDF');
  });

  await step('review rows stay out of the unpaid total and the Profit & Loss; the dashboard points at the queue', async () => {
    await go('#/');
    const t = await page.innerText('#view');
    assert.match(t, /4 scanned invoices\s+waiting for your review/); assert.match(t, /unpaid on 0 invoices/);
    const stats = await setPnl('2026-01-01', '2026-12-31', 'accrual');
    assert.match(stats, /\$430\.00\s+revenue/, 'only the three Closed invoices (130 + 60 + 240) count: ' + stats);
  });

  await step('review: unpaid invoice shows the PDF beside the fields; paying it in full and approving adds the customer and keeps the PDF figures', async () => {
    const un = inv('1003');
    await go('#/invoices/review'); await page.waitForSelector('#revform');
    const pend = storedDb().records.invoices.filter(r => r.data.status === 'Needs Review').sort((a, b) => a.no - b.no);
    await page.keyboard.press('j'); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => location.hash), '#/invoices/review/' + pend[1].id, 'J moves to the next invoice in the invoice queue');
    await page.keyboard.press('k'); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => location.hash), '#/invoices/review/' + pend[0].id);
    await go('#/invoices/review/' + un.id); await page.waitForSelector('#revform[data-id="' + un.id + '"]'); await page.waitForSelector('iframe.pdfframe', { timeout: 10000 });
    assert.match(await page.innerText('.revflags'), /Not fully paid/);
    assert.match(await page.innerText('#revform'), /Customer on the PDF: Bob Builder/);
    assert.equal(await page.inputValue('#f_total'), '265.00');
    assert.equal(await page.inputValue('#f_status'), 'Needs Review');
    await page.waitForTimeout(process.env.HEADED ? 3500 : 800); await shot(page, 'inv-2-review-queue');
    acceptDialogs = true; dialogs.length = 0;
    await page.fill('#f_amount_paid', '265'); await page.fill('#f_paid_date', '2026-09-25');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(id => !document.querySelector('#revform[data-id="' + id + '"]'), un.id); await settle();
    assert.ok(dialogs.some(d => /Add "Bob Builder" as a new customer/.test(d)), dialogs.join(' | '));
    const r = inv('1003');
    assert.equal(r.data.status, 'Closed'); assert.equal(r.data.balance, 0); assert.equal(r.data.total, 265); assert.equal(r.data.tax, 15); assert.equal(r.data.subtotal, 250);
    assert.equal(custName(r.data.customer), 'Bob Builder'); assert.equal(custs().find(c => c.data.name === 'Bob Builder').data.email, 'bob@example.com');
    assert.ok(r.ai.approved);
  });

  await step('review: picking an existing customer for the near match; the duplicate is rejected and its PDF stays', async () => {
    const near = inv('1004'), jane = custs().find(c => c.data.name === 'Jane Doe');
    await go('#/invoices/review/' + near.id); await page.waitForSelector('#revform[data-id="' + near.id + '"]');
    assert.match(await page.innerText('.revflags'), /close to the existing customer/);
    await page.selectOption('#f_customer', jane.id); dialogs.length = 0;
    await page.click('#revform button[type=submit]');
    await page.waitForFunction(id => !document.querySelector('#revform[data-id="' + id + '"]'), near.id); await settle();
    assert.equal(inv('1004').data.status, 'Closed'); assert.equal(inv('1004').data.customer, jane.id); assert.equal(storedDb().records.customers.length, 3, 'no extra customer');
    assert.equal(dialogs.length, 0, 'no dialog when a customer was chosen: ' + dialogs.join(' | '));
    const dup = storedDb().records.invoices.find(r => r.data.reference === '1001' && r.id !== inv('1001').id), pdfPath = dup.pdf.path;
    await go('#/invoices/review/' + dup.id); await page.waitForSelector('#revform[data-id="' + dup.id + '"]');
    assert.match(await page.innerText('.revflags'), /Possible duplicate of INV-/);
    await page.click('[data-act=rev-reject]'); await page.waitForFunction(id => !document.querySelector('#revform[data-id="' + id + '"]'), dup.id); await settle();
    assert.ok(!storedDb().records.invoices.some(r => r.id === dup.id)); assert.ok(gh.files.has(pdfPath), 'the PDF file is kept on purpose');
  });

  await step('review: editing a line recalculates the totals; approving a paid invoice keeps the amount paid', async () => {
    const bad = inv('1006');
    await go('#/invoices/review/' + bad.id); await page.waitForSelector('#revform[data-id="' + bad.id + '"]');
    assert.match(await page.innerText('.revflags'), /Subtotal plus tax does not equal the total/);
    assert.equal(await page.inputValue('#f_total'), '160.00');
    await page.fill('.li-p', '151');
    assert.equal(await page.inputValue('#f_subtotal'), '151.00'); assert.equal(await page.inputValue('#f_tax'), '9.06'); assert.equal(await page.inputValue('#f_total'), '160.06');
    await page.fill('#f_amount_paid', '160.06');
    await page.click('#revform button[type=submit]');
    await page.waitForFunction(id => !document.querySelector('#revform[data-id="' + id + '"]'), bad.id); await settle();
    const r = inv('1006'); assert.equal(r.data.total, 160.06); assert.equal(r.data.subtotal, 151); assert.equal(r.data.tax, 9.06); assert.equal(r.data.status, 'Closed'); assert.equal(r.data.balance, 0);
    assert.equal(pendingCount(), 0);
    await go('#/invoices/review'); assert.match(await page.innerText('.empty'), /Nothing is waiting for review/);
  });

  await step('after review, all six invoices count: unpaid total is $0, P&L revenue matches, other invoices are untouched', async () => {
    await go('#/');
    assert.doesNotMatch(await page.innerText('#view'), /scanned invoices?\s+waiting/);
    const stats = await setPnl('2026-01-01', '2026-12-31', 'accrual');
    assert.match(stats, /\$911\.00\s+revenue/, '130 + 60 + 250 + 80 + 240 + 151: ' + stats);
    const cash = await setPnl('2026-01-01', '2026-12-31', 'cash');
    assert.match(cash, /\$911\.00\s+revenue/, cash);
  });

  await step('Profit & Loss splits revenue by invoice line category', async () => {
    await setPnl('2026-01-01', '2026-12-31', 'accrual');
    const t = await page.innerText('#pnlout .pnl');
    assert.match(t, /Revenue\s+Services: Labor\s+\$831\.00\s+Parts: Hardware\s+\$80\.00\s+Revenue \(before sales tax\)\s+\$911\.00/, t);
    await shot(page, 'inv-3-pnl-by-category');
  });

  await step('invoice lines have a category (default Services: Labor); a Parts: Hardware line with a purchased-part expense tied to the invoice', async () => {
    const jane = custs().find(c => c.data.name === 'Jane Doe');
    await go('#/new/invoices'); await page.waitForSelector('#recform');
    assert.deepEqual(await page.$$eval('.li-c option', os => os.map(o => o.textContent)), ['Services: Labor', 'Parts: Hardware']);
    assert.equal(await page.inputValue('.li-c'), 'Services: Labor');
    await page.selectOption('#f_customer', jane.id); await page.selectOption('#f_status', 'Sent');
    await page.fill('.li-d', 'Diagnostics'); await page.fill('.li-p', '50');
    await page.click('[data-act=line-add]');
    const rows = await page.$$('.lines tbody tr'); const second = rows[rows.length - 1];
    await (await second.$('.li-d')).fill('RAM 16GB'); await (await second.$('.li-p')).fill('40'); await (await second.$('.li-c')).selectOption('Parts: Hardware');
    await page.click('#recform button[type=submit]'); await settle();
    const made = storedDb().records.invoices.find(r => (r.data.items || []).some(l => l.d === 'RAM 16GB'));
    assert.deepEqual(made.data.items.map(l => [l.d, l.c]), [['Diagnostics', 'Services: Labor'], ['RAM 16GB', 'Parts: Hardware']]);
    // the purchase of the part is an expense tied to that invoice
    await go('#/new/expenses'); await page.waitForSelector('#recform');
    assert.ok(await page.$('#f_invoice'), 'expenses have a Billable to invoice field');
    await page.fill('#f_vendor', 'Newegg'); await page.fill('#f_date', '2026-06-20'); await page.selectOption('#f_category', 'Parts and inventory (COGS)'); await page.fill('#f_amount', '31.5');
    await page.selectOption('#f_invoice', made.id);
    await page.click('#recform button[type=submit]'); await settle();
    assert.equal(storedDb().records.expenses.find(r => r.data.vendor === 'Newegg').data.invoice, made.id);
    await go('#/rec/invoices/' + made.id); assert.match(await page.innerText('.related'), /Expenses[\s\S]*Newegg/, 'the invoice lists the expense tied to it');
    const t = await (async () => { await setPnl('2026-01-01', '2026-12-31', 'accrual'); return page.innerText('#pnlout .pnl'); })();
    assert.match(t, /Services: Labor\s+\$881\.00\s+Parts: Hardware\s+\$120\.00\s+Revenue \(before sales tax\)\s+\$1,001\.00/, t);
    assert.match(t, /Cost of goods\s+Parts and inventory \(COGS\)\s+\$31\.50/, 'the part is cost of goods, separate from the revenue lines: ' + t);
  });

  await step('the income category list is editable in Settings and shows in the invoice form', async () => {
    await go('#/settings'); await page.fill('[data-in=inccats]', 'Services: Labor, Parts: Hardware, Services: Software'); await page.press('[data-in=inccats]', 'Tab'); await settle();
    assert.deepEqual(storedDb().settings.incomeCats, ['Services: Labor', 'Parts: Hardware', 'Services: Software']);
    await go('#/new/invoices'); await page.waitForSelector('#recform');
    assert.deepEqual(await page.$$eval('.li-c option', os => os.map(o => o.textContent)), ['Services: Labor', 'Parts: Hardware', 'Services: Software']);
  });

  await step('keyboard: N from the invoice scanner opens a new invoice', async () => {
    await go('#/invoices/scan'); await page.keyboard.press('n'); await page.waitForTimeout(200);
    assert.match(await page.evaluate(() => location.hash), /^#\/new\/invoices/);
  });

  await step('an older data file (no invoice scanner fields) is upgraded when it is opened, without touching its records', async () => {
    const db = storedDb(); const before = db.records.invoices.length;
    const fs_ = db.schema.invoices.fields;
    db.schema.invoices.fields = fs_.filter(f => f.id !== 'reference' && f.id !== 'pdf');
    db.schema.invoices.fields.find(f => f.id === 'status').options = ['Draft', 'Sent', 'Paid', 'Closed', 'Void'];
    db.schema.expenses.fields = db.schema.expenses.fields.filter(f => f.id !== 'invoice');
    db.meta.mig = db.meta.mig.filter(k => k !== 'inv_scan' && k !== 'exp_invoice');
    gh.files.set(DATA_PATH, { content: Buffer.from(sealData(db)).toString('base64'), sha: sha1('old' + Date.now()) });
    await page.reload(); await page.fill('input[name=u]', USER); await page.fill('input[name=p]', PASS); await page.click('button[type=submit]');
    await page.waitForSelector('#rail a');
    await go('#/fields/invoices');
    const t = await page.innerText('#view'); assert.match(t, /Original invoice number/); assert.match(t, /Source PDF/);
    await go('#/fields/expenses'); assert.match(await page.innerText('#view'), /Billable to invoice/);
    await go('#/list/invoices'); await page.waitForSelector('#rows tr[data-href]');
    assert.ok((await page.$$eval('[data-in=filter] option', os => os.map(o => o.textContent))).includes('Needs Review'), 'Needs Review is offered as a status');
    assert.equal(await page.$$eval('#rows tr[data-href]', r => r.length), before);
    await page.selectOption('[data-in=filter]', 'Closed');
    assert.match(await page.innerText('#rows'), /Jane Doe/);
  });

  await step('no secrets in the console, and nothing outside GitHub/Anthropic was contacted', async () => {
    assert.ok(!consoleLines.some(l => l.includes(TEST_KEY)), 'API key leaked to the console');
    assert.ok(!consoleLines.some(l => /PAGEERROR/.test(l)), consoleLines.filter(l => /PAGEERROR/.test(l)).join('\n'));
    for (const put of gh.puts) assert.ok(!Buffer.from(put.body.content, 'base64').toString('latin1').includes(TEST_KEY), 'plaintext key in a GitHub request');
  });

  await browser.close(); server.close();
  console.log(failures ? `\n${failures} step(s) failed` : '\nall steps passed');
  process.exit(failures ? 1 : 0);

  function pendingCount() { return storedDb().records.invoices.filter(r => r.data.status === 'Needs Review').length; }
})();
