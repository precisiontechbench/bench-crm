// PTB Bench CRM
(() => {
'use strict';
const KEY = 'ptb-bench-crm';
const ENTS = ['customers','assets','tickets','estimates','invoices','services','followups'];
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const digits = s => String(s||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');

const FIELD_TYPES = {text:'Short text', textarea:'Long text', number:'Number', currency:'Money', date:'Date', select:'Dropdown', checkbox:'Checkbox', phone:'Phone', email:'Email', url:'Web link', relation:'Link to record', lineitems:'Line items'};
const F = (id,label,type,x={}) => ({id,label,type,...x});
const DEFAULT_SCHEMA = {
  customers:{label:'Customers', singular:'Customer', prefix:'C', fields:[
    F('name','Name','text',{required:true,list:true,title:true,locked:true}),
    F('phone','Phone','phone',{list:true}),
    F('phone_mobile','Phone is a cell (can text)','checkbox'),
    F('email','Email','email',{list:true}),
    F('company','Company or organization','text',{list:true}),
    F('address','Address','textarea'),
    F('contact_pref','Preferred contact','select',{options:['Call','Text','Email']}),
    F('source','How they found us','select',{options:['Walk-in','Website','Referral','Phone','Facebook','Repeat customer']}),
    F('notes','Notes','textarea')]},
  assets:{label:'Assets', singular:'Asset', prefix:'A', fields:[
    F('customer','Owner','relation',{target:'customers',required:true,list:true,locked:true}),
    F('type','Device type','select',{list:true,options:['Desktop','Laptop','All-in-one','Tablet','Phone','Printer','Router / network','Server','Game console','Other']}),
    F('make','Make','text',{list:true,title:true}),
    F('model','Model','text',{list:true,title:true}),
    F('serial','Serial or service tag','text',{list:true}),
    F('os','Operating system','select',{options:['Windows 11','Windows 10','macOS','Linux','ChromeOS','iOS / iPadOS','Android','Other']}),
    F('specs','Specs (CPU, RAM, storage)','textarea'),
    F('warranty','Warranty expires','date'),
    F('login_note','Login on file','text',{hint:'Only with customer consent. Clear it when the job closes.'}),
    F('condition','Condition at intake','textarea')]},
  tickets:{label:'Tickets', singular:'Ticket', prefix:'T', fields:[
    F('title','Issue','text',{required:true,list:true,title:true}),
    F('customer','Customer','relation',{target:'customers',required:true,list:true,locked:true}),
    F('asset','Device','relation',{target:'assets',list:true,locked:true}),
    F('status','Status','select',{list:true,locked:true,default:'New',options:['New','Diagnosing','Waiting on parts','Waiting on customer','In progress','Ready for pickup','Closed']}),
    F('priority','Priority','select',{list:true,default:'Normal',options:['Low','Normal','High','Urgent']}),
    F('category','Category','select',{list:true,options:['Hardware','Software','Virus / malware','Network','Data recovery','Setup / install','Training','Other']}),
    F('intake','Came in by','select',{options:['Walk-in','Drop-off','Website','Phone','Onsite','Remote']}),
    F('date_in','Date in','date',{default:'today'}),
    F('due','Promised by','date'),
    F('problem','Problem as described','textarea'),
    F('diagnosis','Diagnosis','textarea'),
    F('work','Work performed','textarea'),
    F('parts','Parts used','textarea'),
    F('labor','Labor hours','number'),
    F('quote','Quote','currency'),
    F('total','Final total','currency'),
    F('paid','Paid','checkbox')]},
  estimates:{label:'Estimates', singular:'Estimate', prefix:'EST', fields:[
    F('title','Description','text',{list:true,title:true}),
    F('customer','Customer','relation',{target:'customers',required:true,list:true,locked:true}),
    F('ticket','Ticket','relation',{target:'tickets',list:true,locked:true}),
    F('status','Status','select',{list:true,locked:true,default:'Draft',options:['Draft','Sent','Approved','Declined','Expired','Converted']}),
    F('date','Date','date',{list:true,default:'today'}),
    F('valid_until','Valid until','date'),
    F('items','Line items','lineitems',{locked:true}),
    F('tax_rate','Tax rate (%)','number',{default:'6',hint:'Kentucky sales tax is 6%. Untick Tax on any line that is not taxable.'}),
    F('subtotal','Subtotal','currency',{calc:true,locked:true}),
    F('tax','Tax','currency',{calc:true,locked:true}),
    F('total','Total','currency',{calc:true,locked:true,list:true}),
    F('notes','Notes for the customer','textarea')]},
  invoices:{label:'Invoices', singular:'Invoice', prefix:'INV', fields:[
    F('title','Description','text',{list:true,title:true}),
    F('customer','Customer','relation',{target:'customers',required:true,list:true,locked:true}),
    F('ticket','Ticket','relation',{target:'tickets',list:true,locked:true}),
    F('estimate','From estimate','relation',{target:'estimates',locked:true}),
    F('status','Status','select',{list:true,locked:true,default:'Draft',options:['Draft','Sent','Paid','Closed','Void']}),
    F('date_issued','Date issued','date',{list:true,default:'today'}),
    F('service_date','Service date','date',{locked:true,default:'today',hint:'Automatic follow-ups are scheduled from this date.'}),
    F('terms','Net terms','select',{default:'Due on receipt',options:['Due on receipt','Net 7','Net 15','Net 30'],hint:'Picking terms fills in the Balance due date from the Date issued. You can still change that date.'}),
    F('due','Balance due date','date',{list:true}),
    F('items','Line items','lineitems',{locked:true}),
    F('tax_rate','Tax rate (%)','number',{default:'6',hint:'Kentucky sales tax is 6%. Untick Tax on any line that is not taxable.'}),
    F('subtotal','Subtotal','currency',{calc:true,locked:true}),
    F('tax','Tax','currency',{calc:true,locked:true}),
    F('total','Total','currency',{calc:true,locked:true,list:true}),
    F('amount_paid','Amount paid','currency',{hint:'Filled in automatically when you mark the invoice Paid.'}),
    F('balance','Balance due','currency',{calc:true,locked:true,list:true}),
    F('payment_method','Payment method','select',{options:['Cash','Card','Check','Zelle','Venmo','Other']}),
    F('paid_date','Date paid','date'),
    F('notes','Notes for the customer','textarea')]},
  services:{label:'Services', singular:'Service', prefix:'SVC', fields:[
    F('item','Item','text',{required:true,list:true,title:true,locked:true}),
    F('category','Category','select',{list:true,options:['Labor','Diagnostics','Repair','Virus / malware','Data recovery','Setup / install','Parts','Onsite','Remote support','Other']}),
    F('price','Price','currency',{required:true,list:true,locked:true}),
    F('unit','Priced per','select',{list:true,default:'Each',options:['Each','Hour','Flat rate']}),
    F('taxable','Tax','select',{list:true,locked:true,default:'Taxable',options:['Taxable','Non-taxable'],hint:'Sets the Tax box when you add this service to an estimate or invoice.'}),
    F('status','Status','select',{list:true,locked:true,default:'Active',options:['Active','Retired'],hint:'Retired services stay on old invoices but are no longer suggested.'}),
    F('description','Description','textarea')]},
  followups:{label:'Follow-ups', singular:'Follow-up', prefix:'F', fields:[
    F('subject','Subject','text',{required:true,list:true,title:true}),
    F('customer','Customer','relation',{target:'customers',list:true,locked:true}),
    F('ticket','Ticket','relation',{target:'tickets',list:true,locked:true}),
    F('invoice','Invoice','relation',{target:'invoices',locked:true}),
    F('method','Method','select',{list:true,options:['Call','Text','Email','Visit']}),
    F('due','Due','date',{list:true,locked:true,default:'today'}),
    F('status','Status','select',{list:true,locked:true,default:'Pending',options:['Pending','Left message','No answer','Done']}),
    F('notes','Notes','textarea')]}
};
const ICON = {
  bench:'<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  customers:'<circle cx="12" cy="8" r="3.5"/><path d="M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5"/>',
  assets:'<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M9.5 7h5M9.5 10.5h5M12 17h0"/>',
  tickets:'<path d="M3 12l5.5-6.5H21v13H8.5z"/><circle cx="9" cy="12" r="1.4"/>',
  followups:'<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  estimates:'<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 4V2.5h6V4M8.5 10h7M8.5 14h4.5"/>',
  invoices:'<path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  services:'<path d="M3.5 3.5h8l9 9-8 8-9-9z"/><circle cx="8" cy="8" r="1.5"/>',
  settings:'<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'
};
const icon = k => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]||''}</svg>`;

/* ---------- storage ---------- */
function freshDb(){
  return { v:1, schema:clone(DEFAULT_SCHEMA),
    records:{customers:[],assets:[],tickets:[],estimates:[],invoices:[],services:[],followups:[]},
    counters:{customers:1000,assets:1000,tickets:1000,estimates:1000,invoices:1000,services:1000,followups:1000},
    meta:{updated:0, configUpdated:0, mig:['phone_mobile','fu_invoice','inv_terms']},
    settings:{ shopName:'Precision Tech Bench', shopLine:'439 Main Street, Carrollton, KY 41008',
      terms:'Please back up your data. We are not responsible for data loss during repair. Devices not picked up within 30 days of notice may be recycled.',
      closed:['Closed'], done:['Done'], estDone:['Declined','Expired','Converted'], invDone:['Paid','Closed','Void'], svcDone:['Retired'],
      followTrigger:['Paid','Closed'], fuEnabled:true, fuDays:14, fuMonths:2, invoiceNote:'Thank you for choosing Precision Tech Bench!',
      leadsUrl:'', leadsKey:'', imported:[], lastSync:'', lastBackup:'', autoLock:30 } };
}
let db = null;

/* ---------- helpers ---------- */
const sch = ent => db.schema[ent];
const fld = (ent,id) => sch(ent).fields.find(f => f.id === id);
const find = (ent,id) => id ? db.records[ent]?.find(r => r.id === id) : null;
const tagOf = (ent,r) => `${sch(ent).prefix}-${r.no}`;
function label(ent, r, depth=0){
  if (!r) return '(removed)';
  const parts = sch(ent).fields.filter(f => f.title).map(f => f.type==='relation' && depth>0 ? '' : fmt(f, r.data[f.id], depth+1)).filter(Boolean);
  return parts.join(' ') || `${sch(ent).singular} ${tagOf(ent,r)}`;
}
function fmt(f, v, depth=0){
  if (v === undefined || v === null || v === '' || v === false) return '';
  switch (f.type){
    case 'relation': { const r = find(f.target, v); return r ? label(f.target, r, depth+1) : '(removed)'; }
    case 'checkbox': return 'Yes';
    case 'currency': return '$' + Number(v).toFixed(2);
    case 'lineitems': return Array.isArray(v) ? v.map(l => l.d).filter(Boolean).join('; ') : '';
    case 'date': { const [y,m,d] = String(v).split('-'); return y&&m&&d ? `${+m}/${+d}/${y}` : String(v); }
    case 'phone': { const x = digits(v); return x.length===10 ? `(${x.slice(0,3)}) ${x.slice(3,6)}-${x.slice(6)}` : String(v); }
    default: return String(v);
  }
}
const DONE_KEY = {tickets:'closed', followups:'done', estimates:'estDone', invoices:'invDone', services:'svcDone'};
const isClosed = (ent,r) => DONE_KEY[ent] ? (db.settings[DONE_KEY[ent]] || []).includes(r.data.status) : false;
const round2 = n => Math.round((+n || 0) * 100) / 100;
function shiftDate(iso, {days=0, months=0}){
  const [y,m,d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last) + days);
  return dt.toISOString().slice(0,10);
}
function computeTotals(ent, data){
  const li = sch(ent).fields.find(f => f.type === 'lineitems'); if (!li) return data;
  const items = Array.isArray(data[li.id]) ? data[li.id] : [];
  const sub = round2(items.reduce((a,l) => a + (+l.q||0) * (+l.p||0), 0));
  const taxable = round2(items.filter(l => l.t !== false).reduce((a,l) => a + (+l.q||0) * (+l.p||0), 0));
  const tax = round2(taxable * (+data.tax_rate || 0) / 100), total = round2(sub + tax);
  const put = (k,v) => { if (fld(ent,k)) data[k] = v; };
  put('subtotal', sub); put('tax', tax); put('total', total);
  put('balance', round2(total - (+data.amount_paid || 0)));
  return data;
}
const STATUS_COLORS = {'New':'var(--focus)','Diagnosing':'var(--warn)','Waiting on parts':'var(--warn)','Waiting on customer':'var(--warn)','In progress':'var(--mat-dim)','Ready for pickup':'var(--ok)','Closed':'var(--muted)','Pending':'var(--warn)','Done':'var(--ok)','Draft':'var(--muted)','Sent':'var(--focus)','Paid':'var(--ok)','Approved':'var(--ok)','Declined':'var(--danger)','Void':'var(--muted)','Converted':'var(--mat-dim)','Urgent':'var(--danger)','High':'var(--warn)','Active':'var(--ok)','Retired':'var(--muted)'};
const pill = v => v ? `<span class="pill" style="--pc:${STATUS_COLORS[v]||'var(--muted)'}">${h(v)}</span>` : '';
function cell(ent, f, r){
  const v = r.data[f.id];
  if (f.type==='select' && (f.id==='status' || f.id==='priority')) return pill(v);
  if (ent==='customers' && f.id==='phone' && v && r.data.phone_mobile) return h(fmt(f, v)) + ' <span class="meta">cell</span>';
  if (f.id==='balance' && +v > 0 && !isClosed(ent, r)) return `<b style="color:var(--danger)">${h(fmt(f, v))}</b>`;
  return h(fmt(f, v));
}
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove('on'), 2600); }
function resolveDefault(f){ return f.default === 'today' ? today() : f.default; }
function createRecord(ent, data){
  const r = { id:uid(), no:++db.counters[ent], created:new Date().toISOString(), updated:new Date().toISOString(), data:{...data} };
  db.records[ent].push(r); return r;
}
function setIf(ent, data, id, value){
  const f = fld(ent,id); if (!f || value === undefined || value === null || value === '') return;
  if (f.type === 'select' && !f.options.includes(value)) return;
  data[id] = value;
}
function download(name, text, type){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- secure storage: AES-256-GCM, synced to a private GitHub repo ---------- */
const TE = new TextEncoder(), TD = new TextDecoder();
const VAULT_AAD = TE.encode('ptb-bench-crm:vault:v1'), DATA_AAD = TE.encode('ptb-bench-crm:data:v1');
const ITER = 600000, PENDING = 'ptb-bench-crm-pending', MIN_PW = 14;
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let sess = null;                 // {u, owner, repo, path, token, dataKey(b64), key(CryptoKey)} held in memory only
let remoteSha = null, dirty = false, pushing = false, pushAgain = false, pushTimer = null, lastPull = 0, idleTimer = null;
let lockNote = '', pendingSetup = null, syncState = {s:'idle', msg:''};

async function passKey(u, p, salt, iter){
  const base = await crypto.subtle.importKey('raw', TE.encode(u.trim().toLowerCase() + '\u0000' + p), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations:iter}, base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
async function sealVault(u, p, secret){
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await passKey(u, p, salt, ITER);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:VAULT_AAD}, k, TE.encode(JSON.stringify(secret))));
  return {v:1, kdf:'PBKDF2-SHA256', iter:ITER, salt:b64e(salt), iv:b64e(iv), ct:b64e(ct)};
}
async function openVault(v, u, p){
  const k = await passKey(u, p, b64d(v.salt), v.iter || ITER);
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(v.iv), additionalData:VAULT_AAD}, k, b64d(v.ct));
  return JSON.parse(TD.decode(pt));
}
async function gz(u8, compress){
  const stream = new Blob([u8]).stream().pipeThrough(compress ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function sealData(obj){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:DATA_AAD}, sess.key, await gz(TE.encode(JSON.stringify(obj)), true)));
  return JSON.stringify({v:1, z:'gzip', iv:b64e(iv), ct:b64e(ct)});
}
async function openData(text){
  const e = JSON.parse(text);
  const pt = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(e.iv), additionalData:DATA_AAD}, sess.key, b64d(e.ct)));
  return JSON.parse(TD.decode(e.z === 'gzip' ? await gz(pt, false) : pt));
}
function ensureShape(d){
  const f = freshDb();
  for (const k of ['schema','records','counters','settings']) d[k] = {...f[k], ...(d[k]||{})};
  d.deleted = d.deleted || {}; d.meta = d.meta || {updated:0, configUpdated:0};
  d.meta.mig = d.meta.mig || [];
  const once = (key, fn) => { if (!d.meta.mig.includes(key)) { fn(); d.meta.mig.push(key); } };
  const addAfter = (ent, afterId, field) => { const fs = d.schema[ent]?.fields; if (!fs || fs.some(x => x.id === field.id)) return;
    const i = fs.findIndex(x => x.id === afterId); fs.splice(i < 0 ? fs.length : i + 1, 0, clone(field)); };
  once('phone_mobile', () => addAfter('customers', 'phone', DEFAULT_SCHEMA.customers.fields.find(x => x.id === 'phone_mobile')));
  once('fu_invoice', () => addAfter('followups', 'ticket', DEFAULT_SCHEMA.followups.fields.find(x => x.id === 'invoice')));
  once('inv_terms', () => {
    addAfter('invoices', 'service_date', DEFAULT_SCHEMA.invoices.fields.find(x => x.id === 'terms'));
    const due = d.schema.invoices?.fields.find(x => x.id === 'due');
    if (due){ due.label = 'Balance due date'; due.list = true; }
  });
  return d;
}

async function gh(method, url, body, token){
  return fetch('https://api.github.com' + url, { method, cache:'no-store', referrerPolicy:'no-referrer',
    headers:{ Authorization:'Bearer ' + (token || sess.token), Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', ...(body ? {'Content-Type':'application/json'} : {}) },
    body: body ? JSON.stringify(body) : undefined });
}
async function ghError(r){
  let m = ''; try { m = (await r.json()).message || ''; } catch(e) {}
  if (r.status === 401) return new Error('GitHub rejected the access token. It may have expired. Update it in Settings > Security.');
  if (r.status === 403) return new Error(/rate limit/i.test(m) ? 'GitHub rate limit reached. Try again in a few minutes.' : 'The token is missing Contents read and write permission on the data repository.');
  if (r.status === 404) return new Error('GitHub could not find the data repository, or the token cannot see it.');
  return new Error(`GitHub error ${r.status}${m ? ': ' + m : ''}`);
}
const repoPath = s => `/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}`;
const filePath = s => repoPath(s) + '/contents/' + s.path.split('/').map(encodeURIComponent).join('/');

async function pull(){
  const r = await gh('GET', filePath(sess));
  if (r.status === 404) return null;
  if (!r.ok) throw await ghError(r);
  const j = await r.json(); let b = j.content;
  if (!b || j.encoding === 'none'){   // files over 1 MB come through the blob API
    const br = await gh('GET', repoPath(sess) + '/git/blobs/' + j.sha); if (!br.ok) throw await ghError(br); b = (await br.json()).content; }
  return { data: ensureShape(await openData(TD.decode(b64d(b.replace(/\s/g,''))))), sha: j.sha };
}
function merge(local, remote){
  const newer = (remote.meta.configUpdated || 0) > (local.meta.configUpdated || 0) ? remote : local;
  const out = ensureShape(clone(newer));
  out.deleted = {...remote.deleted};
  for (const [k,v] of Object.entries(local.deleted)) out.deleted[k] = Math.max(v, out.deleted[k] || 0);
  for (const e of ENTS){
    const m = new Map();
    for (const r of [...(remote.records[e]||[]), ...(local.records[e]||[])]){ const c = m.get(r.id); if (!c || r.updated > c.updated) m.set(r.id, r); }
    out.records[e] = [...m.values()].filter(r => !(out.deleted[r.id] >= Date.parse(r.updated))).sort((a,b) => a.no - b.no);
    out.counters[e] = Math.max(local.counters[e] || 0, remote.counters[e] || 0);
  }
  out.settings.imported = [...new Set([...(local.settings.imported||[]), ...(remote.settings.imported||[])])];
  const cutoff = Date.now() - 180*864e5; for (const [k,v] of Object.entries(out.deleted)) if (v < cutoff) delete out.deleted[k];
  return out;
}
function setSync(s, msg=''){
  syncState = {s, msg, at:new Date()};
  const el = $('#syncstat'); if (!el) return;
  const txt = {saved:'Saved to GitHub ' + syncState.at.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}), saving:'Saving…', pending:'Unsaved changes', error:'Not saved. Retrying.', idle:''}[s];
  el.textContent = txt; el.dataset.s = s; el.title = msg;
}
function schedulePush(ms){ clearTimeout(pushTimer); pushTimer = setTimeout(push, ms); }
async function stashPending(){
  try { if (sess && db && dirty) localStorage.setItem(PENDING, JSON.stringify({u:sess.u, repo:sess.owner + '/' + sess.repo, blob: await sealData(db)})); } catch(e) {}
}
async function push(){
  if (!sess || !db) return;
  if (pushing){ pushAgain = true; return; }
  pushing = true; clearTimeout(pushTimer); setSync('saving');
  let merged = false;
  try {
    for (let attempt = 0; attempt < 4; attempt++){
      dirty = false;
      const sealed = await sealData(db);
      const r = await gh('PUT', filePath(sess), { message:'Bench CRM update', content:b64e(TE.encode(sealed)), ...(remoteSha ? {sha:remoteSha} : {}) });
      if (r.ok){ remoteSha = (await r.json()).content.sha; if (!dirty) localStorage.removeItem(PENDING); setSync('saved'); break; }
      if (r.status === 409 || r.status === 422){   // changed on another computer since we loaded it
        const rem = await pull(); if (rem){ db = merge(db, rem.data); remoteSha = rem.sha; merged = true; } else remoteSha = null;
        continue; }
      throw await ghError(r);
    }
    if (merged && !$('#recform') && !$('#dlg[open]')) route();
  } catch(e){
    dirty = true; await stashPending(); setSync('error', e.message);
    if (/token|permission/.test(e.message)) toast(e.message);
    pushTimer = setTimeout(push, 20000);
  } finally {
    pushing = false;
    if (pushAgain){ pushAgain = false; schedulePush(300); }
  }
}
async function refresh(force){
  if (!sess || pushing || (!force && Date.now() - lastPull < 60000)) return;
  lastPull = Date.now();
  try {
    const rem = await pull(); if (!rem || rem.sha === remoteSha){ if (force) toast('Already up to date'); return; }
    db = dirty ? merge(db, rem.data) : rem.data; remoteSha = rem.sha; save._cfg = cfgSig();
    if (dirty) schedulePush(300); else setSync('saved');
    if (!$('#recform') && !$('#dlg[open]')) route(); else toast('Newer data loaded from GitHub');
  } catch(e){ setSync('error', e.message); if (force) toast(e.message); }
}
const cfgSig = () => JSON.stringify([db.schema, db.settings]);
function save(){
  if (!db || !sess) return false;
  const c = cfgSig(); if (c !== save._cfg){ db.meta.configUpdated = Date.now(); save._cfg = c; }
  db.meta.updated = Date.now(); dirty = true; setSync('pending');
  if (pushing) pushAgain = true; else schedulePush(1200);
  return true;
}
function tombstone(ids){ const now = Date.now(); for (const id of ids) db.deleted[id] = now; }
function replaceDb(next){
  const keep = new Set(ENTS.flatMap(e => next.records[e].map(r => r.id)));
  const gone = ENTS.flatMap(e => db.records[e].map(r => r.id)).filter(id => !keep.has(id));
  const del = db.deleted; db = ensureShape(next); db.deleted = {...del, ...db.deleted}; tombstone(gone);
  const now = new Date().toISOString(); for (const e of ENTS) db.records[e].forEach(r => { r.updated = now; });
  db.meta.configUpdated = Date.now(); save._cfg = cfgSig(); save();
}

async function startSession(secret){
  sess = {...secret, key: await crypto.subtle.importKey('raw', b64d(secret.dataKey), 'AES-GCM', false, ['encrypt','decrypt'])};
  const rem = await pull();
  if (rem){ db = rem.data; remoteSha = rem.sha; } else { db = ensureShape(freshDb()); remoteSha = null; dirty = true; }
  save._cfg = cfgSig();
  try { const p = JSON.parse(localStorage.getItem(PENDING) || 'null');
    if (p && p.u === sess.u && p.repo === sess.owner + '/' + sess.repo){ db = merge(ensureShape(await openData(p.blob)), db); dirty = true; toast('Recovered changes that had not reached GitHub'); }
  } catch(e) {}
  lastPull = Date.now(); lockNote = '';
  if (dirty) schedulePush(200); else setSync('saved');
  armIdle(); if (!location.hash) location.hash = '#/'; route(); setSync(syncState.s, syncState.msg);
}
async function lock(note){
  if (!sess) return;
  if (dirty){ await push(); if (dirty) await stashPending(); }
  clearTimeout(pushTimer); clearTimeout(idleTimer);
  sess = null; db = null; remoteSha = null; dirty = false; lockNote = note || '';
  if ($('#dlg').open) $('#dlg').close();
  $('#print').innerHTML = ''; history.replaceState(null, '', location.pathname); route();
}
function armIdle(){
  clearTimeout(idleTimer); if (!sess || !db) return;
  const min = Math.max(5, +db.settings.autoLock || 30);
  idleTimer = setTimeout(() => lock(`Locked after ${min} minutes without activity.`), min * 60000);
}
['pointerdown','keydown','wheel'].forEach(ev => document.addEventListener(ev, () => { if (sess) armIdle(); }, {passive:true, capture:true}));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); else if (dirty) stashPending(); });
window.addEventListener('focus', () => refresh());
window.addEventListener('beforeunload', e => { if (dirty){ stashPending(); e.preventDefault(); e.returnValue = ''; } });

/* ---------- login and first-time setup ---------- */
function viewLogin(){
  return `<div class="gate"><form class="panel" id="loginform" autocomplete="on">
    <span class="tag big">PTB</span><h1>Bench CRM</h1><p>${lockNote ? h(lockNote) : 'Sign in to open your records.'}</p>
    <label class="f">Username<input name="u" autocomplete="username" required autofocus></label>
    <label class="f">Password<input name="p" type="password" autocomplete="current-password" required></label>
    <p class="err" role="alert"></p>
    <button class="btn primary" type="submit">Sign in</button></form></div>`;
}
function viewSetup(){
  if (pendingSetup) return `<div class="gate"><div class="panel">
    <span class="tag big">PTB</span><h1>Login created</h1>
    <p>Download <b>config.js</b> and commit it to the app repository, replacing the empty one. Until then, this browser tab is the only way in.</p>
    <p class="meta">It holds your GitHub token, encrypted with your username and password. Without both, it's unreadable.</p>
    <div class="row"><button class="btn primary" data-act="dl-config">Download config.js</button><button class="btn" data-act="setup-open">Open Bench CRM</button></div></div></div>`;
  return `<div class="gate wide"><form class="panel" id="setupform" autocomplete="off">
    <span class="tag big">PTB</span><h1>Set up secure storage</h1>
    <p>Your records are encrypted in this browser and saved to a private GitHub repository. You'll only do this once.</p>
    <div class="formgrid" style="padding:0">
      <label class="f">GitHub account<input name="owner" required placeholder="your-username"></label>
      <label class="f">Private data repository<input name="repo" required value="bench-crm-data"></label>
      <label class="f wide">File inside that repository<input name="path" required value="data/crm.enc.json"></label>
      <label class="f wide">Fine-grained access token<input name="token" type="password" required placeholder="github_pat_…"><small>Scoped to the data repository only, with Contents: Read and write.</small></label>
      <label class="f">Choose a username<input name="u" required autocomplete="off"></label>
      <span></span>
      <label class="f">Choose a password<input name="p" type="password" required autocomplete="new-password"><small>At least ${MIN_PW} characters. A few random words works well.</small></label>
      <label class="f">Repeat password<input name="p2" type="password" required autocomplete="new-password"></label>
    </div>
    <p class="err" role="alert"></p>
    <button class="btn primary" type="submit">Test connection and create login</button></form></div>`;
}
function formErr(form, msg){ const el = $('.err', form); el.textContent = msg; }
function busy(btn, on, text){ btn.disabled = on; if (on){ btn.dataset.t = btn.textContent; btn.textContent = text; } else if (btn.dataset.t) btn.textContent = btn.dataset.t; }
async function checkRepo(owner, repo, token){
  const r = await gh('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, null, token);
  if (!r.ok) throw await ghError(r);
  const j = await r.json();
  if (!j.private) throw new Error('That repository is public. Make it private on GitHub (Settings > General > Danger Zone) before storing customer data in it.');
  return j;
}
async function doLogin(form){
  const btn = $('button[type=submit]', form); busy(btn, true, 'Unlocking…'); formErr(form, '');
  let secret;
  try { secret = await openVault(window.PTB_VAULT, form.u.value, form.p.value); }
  catch(e){ busy(btn, false); form.p.value = ''; await new Promise(r => setTimeout(r, 800)); formErr(form, 'Wrong username or password.'); form.p.focus(); return; }
  try { await startSession(secret); }
  catch(e){ sess = null; db = null; busy(btn, false); formErr(form, e.message); }
}
async function doSetup(form){
  const E = form.elements, btn = $('button[type=submit]', form); formErr(form, '');
  const v = k => E[k].value.trim();
  if (v('u').length < 3) return formErr(form, 'Pick a username of at least 3 characters.');
  if (E.p.value.length < MIN_PW) return formErr(form, `Use a password of at least ${MIN_PW} characters.`);
  if (E.p.value !== E.p2.value) return formErr(form, 'The passwords do not match.');
  busy(btn, true, 'Checking GitHub…');
  try {
    await checkRepo(v('owner'), v('repo'), v('token'));
    const probe = await gh('GET', filePath({owner:v('owner'), repo:v('repo'), path:v('path')}), null, v('token'));
    if (probe.ok) throw new Error('A data file already exists at that path. It can only be opened with the config.js that created it. Choose a new file name, or restore your original config.js.');
    const secret = { u:v('u'), owner:v('owner'), repo:v('repo'), path:v('path').replace(/^\/+/,''), token:v('token'),
      dataKey: b64e(crypto.getRandomValues(new Uint8Array(32))) };
    btn.textContent = 'Encrypting…';
    const vault = await sealVault(secret.u, E.p.value, secret);
    pendingSetup = { secret, vault, config: configJs(vault) };
    route();
  } catch(e){ busy(btn, false); formErr(form, e.message); }
}
const configJs = vault => `// Bench CRM login vault. Encrypted with your username and password (PBKDF2-SHA256, ${ITER.toLocaleString()} rounds, AES-256-GCM).\n// Safe to commit; useless without the password. Regenerate it from Settings > Security.\nwindow.PTB_VAULT = ${JSON.stringify(vault)};\n`;
function viewSecurity(){
  const dlg = $('#dlg');
  dlg.innerHTML = `<form id="secform"><h2>Change login or token</h2>
    <p style="padding:0 1.25rem" class="meta">This creates a new config.js. Commit it to the app repository to make the change stick. Old versions stay in git history, so if you think your password leaked, also replace the GitHub token.</p>
    <div class="formgrid">
      <label class="f wide">Current password<input name="cur" type="password" required autocomplete="current-password"></label>
      <label class="f">Username<input name="u" required value="${h(sess.u)}"></label>
      <label class="f">New GitHub token<input name="token" type="password" placeholder="Leave blank to keep"></label>
      <label class="f">New password<input name="p" type="password" autocomplete="new-password" placeholder="Leave blank to keep"></label>
      <label class="f">Repeat new password<input name="p2" type="password" autocomplete="new-password"></label>
    </div><p class="err" role="alert" style="padding:0 1.25rem"></p>
    <div class="formfoot"><button class="btn primary" type="submit">Create new config.js</button><button class="btn" type="button" data-act="dlg-close">Cancel</button></div></form>`;
  dlg.showModal();
}
async function doSecurity(form){
  const E = form.elements, btn = $('button[type=submit]', form); formErr(form, '');
  const newPw = E.p.value || E.cur.value;
  if (E.p.value && E.p.value.length < MIN_PW) return formErr(form, `Use a password of at least ${MIN_PW} characters.`);
  if (E.p.value !== E.p2.value) return formErr(form, 'The new passwords do not match.');
  busy(btn, true, 'Working…');
  try {
    if (window.PTB_VAULT){ try { await openVault(window.PTB_VAULT, sess.u, E.cur.value); } catch(e){ throw new Error('Current password is not right.'); } }
    const token = E.token.value.trim() || sess.token;
    if (token !== sess.token) await checkRepo(sess.owner, sess.repo, token);
    const secret = { u:E.u.value.trim(), owner:sess.owner, repo:sess.repo, path:sess.path, token, dataKey:sess.dataKey };
    download('config.js', configJs(await sealVault(secret.u, newPw, secret)), 'text/javascript');
    sess.token = token; sess.u = secret.u;
    $('#dlg').close(); toast('New config.js downloaded. Commit it to finish.');
  } catch(e){ busy(btn, false); formErr(form, e.message); }
}

/* ---------- navigation ---------- */
function renderRail(active){
  const items = [['bench','#/','Bench'], ...ENTS.map(e => [e, '#/list/'+e, sch(e).label]), ['settings','#/settings','Settings']];
  $('#rail').innerHTML = `<div class="brand"><b>Bench CRM</b><span>${h(db.settings.shopName)}</span></div>` +
    items.map(([k,href,lab]) => `<a href="${href}" ${k===active?'aria-current="page"':''}>${icon(k)}<span>${h(lab)}</span></a>`).join('') +
    `<div class="spacer"></div><div class="syncstat" id="syncstat" aria-live="polite"></div><div class="keys"><kbd>N</kbd>new<br><kbd>/</kbd>search<br><kbd>Ctrl</kbd><kbd>S</kbd>save<br><kbd>Alt</kbd><kbd>1</kbd>–<kbd>9</kbd>sections</div><button data-act="lock">Lock</button>`;
  setSync(syncState.s, syncState.msg);
}
function parseHash(){
  const [path, qs=''] = location.hash.replace(/^#\/?/,'').split('?');
  return { parts: path.split('/').filter(Boolean), q: Object.fromEntries(new URLSearchParams(qs)) };
}
function route(){
  const {parts, q} = parseHash(); const [view, ent, id] = parts;
  const V = $('#view');
  document.body.classList.toggle('locked', !db);
  if (!db){ $('#rail').innerHTML = ''; V.innerHTML = (window.PTB_VAULT && !pendingSetup) ? viewLogin() : viewSetup();
    $('#view input')?.focus(); return; }
  if (view==='list' && ENTS.includes(ent)) { renderRail(ent); V.innerHTML = viewList(ent); fillRows(ent); }
  else if (view==='new' && ENTS.includes(ent)) { renderRail(ent); V.innerHTML = viewRecord(ent, null, q); afterForm(); }
  else if (view==='rec' && ENTS.includes(ent)) { renderRail(ent); V.innerHTML = viewRecord(ent, id); afterForm(); }
  else if (view==='fields') { const e = ENTS.includes(ent) ? ent : 'customers'; renderRail('settings'); V.innerHTML = viewFields(e); }
  else if (view==='settings') { renderRail('settings'); V.innerHTML = viewSettings(); }
  else { renderRail('bench'); V.innerHTML = viewBench(); }
  window.scrollTo(0,0);
}

/* ---------- bench (dashboard) ---------- */
function legacyData(){ try { const s = localStorage.getItem(KEY); return s ? ensureShape(JSON.parse(s)) : null; } catch(e){ return null; } }
function viewBench(){
  const sf = fld('tickets','status');
  const open = db.records.tickets.filter(r => !isClosed('tickets', r));
  const lanes = (sf ? sf.options.filter(o => !db.settings.closed.includes(o)) : []);
  const unset = open.filter(r => !lanes.includes(r.data.status));
  const cardFor = r => {
    const c = find('customers', r.data.customer);
    const bits = [c ? label('customers',c) : '', r.data.due ? 'Due ' + fmt({type:'date'}, r.data.due) : ''].filter(Boolean).join(', ');
    return `<a class="card" href="#/rec/tickets/${r.id}"><span class="tag">${h(tagOf('tickets',r))}</span>${r.data.priority==='Urgent'||r.data.priority==='High' ? ' '+pill(r.data.priority) : ''}
      <span class="t">${h(label('tickets',r))}</span><span class="s">${h(bits)}</span></a>`;
  };
  const laneHtml = (name, rows) => `<div class="lane"><h3>${h(name)} <span>${rows.length}</span></h3>${rows.map(cardFor).join('') || ''}</div>`;
  const t = today();
  const fus = db.records.followups.filter(r => !isClosed('followups', r)).sort((a,b) => String(a.data.due||'9').localeCompare(String(b.data.due||'9')));
  const dueSoon = fus.filter(r => !r.data.due || r.data.due <= t);
  const later = fus.length - dueSoon.length;
  const readyCount = open.filter(r => r.data.status === 'Ready for pickup').length;
  const unpaid = db.records.invoices.filter(r => !isClosed('invoices', r) && +r.data.balance > 0);
  const owed = round2(unpaid.reduce((a,r) => a + (+r.data.balance||0), 0));
  const openEst = db.records.estimates.filter(r => !isClosed('estimates', r)).length;
  return `<div class="head"><div><h1>On the bench</h1><p>${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</p></div>
    <div class="row">${db.settings.leadsUrl ? '<button class="btn" data-act="sync">Sync web leads</button>' : ''}
    <a class="btn" href="#/new/customers">New customer</a><a class="btn primary" href="#/new/tickets">New ticket</a></div></div>
    ${legacyData() ? `<div class="banner" role="status"><span>This browser still has records from the earlier, unsecured version of Bench CRM. Move them into your encrypted GitHub storage?</span><span class="row"><button class="btn primary small" data-act="legacy-import">Move records</button><button class="btn small" data-act="legacy-drop">Discard them</button></span></div>` : ''}
    <div class="stats"><div><b>${open.length}</b>open tickets</div><div><b>${readyCount}</b>ready for pickup</div><div><b>${dueSoon.length}</b>follow-ups due</div><div><a href="#/list/invoices" style="text-decoration:none"><b>${fmt({type:'currency'}, owed) || '$0.00'}</b>unpaid on ${unpaid.length} invoice${unpaid.length===1?'':'s'}</a></div><div><a href="#/list/estimates" style="text-decoration:none"><b>${openEst}</b>open estimates</a></div></div>
    ${open.length ? `<div class="lanes">${lanes.map(s => laneHtml(s, open.filter(r => r.data.status===s))).join('')}${unset.length ? laneHtml('No status', unset) : ''}</div>`
      : `<div class="panel empty" style="margin-bottom:2rem">The bench is clear. Check in a device to start a ticket.<br><a class="btn primary" href="#/new/tickets">New ticket</a></div>`}
    <div class="head" style="margin-bottom:.6rem"><h2>Follow-ups due</h2><a class="btn small" href="#/list/followups">All follow-ups${later ? ` (${later} later)` : ''}</a></div>
    <div class="panel">${dueSoon.length ? dueSoon.map(r => {
      const c = find('customers', r.data.customer); const over = r.data.due && r.data.due < t;
      return `<a class="fu" href="#/rec/followups/${r.id}"><span class="when ${over?'over':''}">${r.data.due ? (r.data.due===t ? 'Today' : fmt({type:'date'}, r.data.due)) : 'No date'}</span>
        <span class="t">${h(label('followups', r))}<small>${h([c?label('customers',c):'', r.data.method, c?fmt({type:'phone'}, c.data.phone):''].filter(Boolean).join(', '))}</small></span>${pill(r.data.status)}</a>`;
    }).join('') : '<div class="empty">Nothing due. Nice work.</div>'}</div>`;
}

/* ---------- lists ---------- */
const ui = { q:{}, sort:{}, filter:{ tickets:'__open', followups:'__open', services:'__open' } };
function viewList(ent){
  const sc = sch(ent); const cols = sc.fields.filter(f => f.list);
  const sf = sc.fields.find(f => f.id==='status' && f.type==='select');
  const s = ui.sort[ent] || {k:'no', dir:-1};
  const fv = ui.filter[ent] || '';
  return `<div class="head"><div><h1>${h(sc.label)}</h1><p>${db.records[ent].length} total</p></div>
    <div class="row">${ent === 'services' ? `<button class="btn small" data-act="csv" data-ent="services">Export CSV</button><button class="btn small" data-act="print-prices">Print price list</button>` : ''}<a class="btn small" href="#/fields/${ent}">Edit fields</a><a class="btn primary" href="#/new/${ent}">New ${h(sc.singular.toLowerCase())}</a></div></div>
    <div class="toolbar"><input type="search" placeholder="Search ${h(sc.label.toLowerCase())}" aria-label="Search" data-in="search" data-ent="${ent}" value="${h(ui.q[ent]||'')}">
    ${sf ? `<select data-in="filter" data-ent="${ent}" aria-label="Filter by status"><option value="">All statuses</option>
      ${DONE_KEY[ent] ? `<option value="__open" ${fv==='__open'?'selected':''}>${ent === 'services' ? 'Active only' : 'Open only'}</option>` : ''}
      ${sf.options.map(o => `<option ${fv===o?'selected':''}>${h(o)}</option>`).join('')}</select>` : ''}</div>
    <div class="tablewrap"><table class="grid"><thead><tr>
      <th data-act="sort" data-ent="${ent}" data-k="no" ${s.k==='no' ? `aria-sort="${s.dir>0?'ascending':'descending'}"` : ''}>No.</th>
      ${cols.map(f => `<th data-act="sort" data-ent="${ent}" data-k="${f.id}" ${s.k===f.id ? `aria-sort="${s.dir>0?'ascending':'descending'}"` : ''}>${h(f.label)}</th>`).join('')}
    </tr></thead><tbody id="rows"></tbody></table></div>`;
}
function fillRows(ent){
  const sc = sch(ent); const cols = sc.fields.filter(f => f.list);
  let rows = db.records[ent].slice();
  const q = (ui.q[ent]||'').toLowerCase().trim();
  if (q) rows = rows.filter(r => (tagOf(ent,r) + ' ' + sc.fields.map(f => fmt(f, r.data[f.id])).join(' ') + ' ' + digits(r.data.phone)).toLowerCase().includes(q));
  const fv = ui.filter[ent];
  if (fv === '__open') rows = rows.filter(r => !isClosed(ent, r)); else if (fv) rows = rows.filter(r => r.data.status === fv);
  const s = ui.sort[ent] || {k:'no', dir:-1};
  const f = fld(ent, s.k);
  rows.sort((a,b) => {
    let x, y;
    if (s.k === 'no') { x = a.no; y = b.no; }
    else if (f && (f.type==='number'||f.type==='currency')) { x = +a.data[s.k]||0; y = +b.data[s.k]||0; }
    else if (f && f.type==='date') { x = a.data[s.k]||''; y = b.data[s.k]||''; }
    else { x = fmt(f||{}, a.data[s.k]).toLowerCase(); y = fmt(f||{}, b.data[s.k]).toLowerCase(); }
    return (x > y ? 1 : x < y ? -1 : 0) * s.dir;
  });
  const tb = $('#rows'); if (!tb) return;
  tb.innerHTML = rows.length ? rows.map(r => `<tr data-href="#/rec/${ent}/${r.id}" tabindex="0">
      <td><span class="tag">${h(tagOf(ent,r))}</span></td>
      ${cols.map(f => `<td data-label="${h(f.label)}">${cell(ent,f,r)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length+1}" class="empty">${db.records[ent].length ? 'No matches. Try a different search or filter.' : `No ${h(sc.label.toLowerCase())} yet.<br><a class="btn primary" href="#/new/${ent}">New ${h(sc.singular.toLowerCase())}</a>`}</td></tr>`;
}

/* ---------- record form ---------- */
function relOptions(f, cur, cons=[]){
  let recs = db.records[f.target] || [];
  if (cons.length) recs = recs.filter(r => r.id === cur || cons.every(([k,v]) => r.data[k] === v));
  recs = recs.slice().sort((a,b) => label(f.target,a).localeCompare(label(f.target,b)));
  return `<option value="">Choose ${h(sch(f.target).singular.toLowerCase())}</option>` +
    recs.map(r => `<option value="${r.id}" ${r.id===cur?'selected':''}>${h(label(f.target,r))} (${h(tagOf(f.target,r))})</option>`).join('');
}
const lineRow = l => `<tr><td><input class="li-d" list="svc-list" value="${h(l.d||'')}" placeholder="Labor, part, or service" aria-label="Description"></td>
  <td class="num"><input class="li-q" type="number" step="any" value="${h(l.q ?? 1)}" aria-label="Quantity"></td>
  <td class="num"><input class="li-p" type="number" step="0.01" value="${h(l.p ?? '')}" aria-label="Price"></td>
  <td class="num"><input class="li-t" type="checkbox" ${l.t === false ? '' : 'checked'} aria-label="Taxable"></td>
  <td class="num li-a">${fmt({type:'currency'}, round2((+l.q||0)*(+l.p||0))) || '$0.00'}</td>
  <td><button type="button" class="btn small danger" data-act="line-del" aria-label="Remove line">✕</button></td></tr>`;
const activeServices = () => (db.records.services || []).filter(r => r.data.item && !isClosed('services', r))
  .sort((a,b) => String(a.data.item).localeCompare(String(b.data.item)));
// Picking a service by name on a line item fills in its price and tax setting.
function applyService(tr){
  const name = $('.li-d', tr).value.trim().toLowerCase(); if (!name) return;
  const s = activeServices().find(r => String(r.data.item).trim().toLowerCase() === name); if (!s) return;
  $('.li-p', tr).value = s.data.price ?? ''; $('.li-t', tr).checked = s.data.taxable !== 'Non-taxable';
}
// Balance due date = Date issued + the Net terms days.
function dueFrom(issued, terms){
  if (!issued) return '';
  if (terms === 'Due on receipt') return issued;
  const n = parseInt(String(terms || '').replace(/\D/g, ''), 10);
  return n ? shiftDate(issued, {days:n}) : '';
}
function setDueFromTerms(form){
  const E = form.elements, d = dueFrom(E.f_date_issued?.value, E.f_terms?.value);
  if (d && E.f_due) E.f_due.value = d;
}
function readLines(form, id){
  return $$(`[data-lines="${id}"] tbody tr`, form).map(tr => ({ d:$('.li-d',tr).value.trim(), q:+$('.li-q',tr).value || 0, p:+$('.li-p',tr).value || 0, t:$('.li-t',tr).checked }))
    .filter(l => l.d || l.p);
}
function recalc(form){
  const ent = form.dataset.ent; const li = sch(ent).fields.find(f => f.type === 'lineitems'); if (!li) return;
  $$(`[data-lines="${li.id}"] tbody tr`, form).forEach(tr => { $('.li-a',tr).textContent = fmt({type:'currency'}, round2((+$('.li-q',tr).value||0) * (+$('.li-p',tr).value||0))) || '$0.00'; });
  const d = { [li.id]: readLines(form, li.id), tax_rate: form.elements.f_tax_rate?.value, amount_paid: form.elements.f_amount_paid?.value };
  computeTotals(ent, d);
  for (const k of ['subtotal','tax','total','balance']) { const el = form.elements['f_'+k]; if (el && d[k] !== undefined) el.value = d[k].toFixed(2); }
}
function inputFor(f, v){
  const n = `name="f_${f.id}" id="f_${f.id}"` + (f.calc ? ' readonly tabindex="-1" class="calc"' : '') + (f.id === 'terms' || f.id === 'date_issued' ? ' data-in="terms"' : ''), req = f.required ? 'required' : '';
  const val = v ?? '';
  switch (f.type){
    case 'textarea': return `<textarea ${n} ${req}>${h(val)}</textarea>`;
    case 'select': { const opts = [...f.options]; if (val && !opts.includes(val)) opts.push(val);
      return `<select ${n} ${req}><option value="">Choose</option>${opts.map(o => `<option ${o===val?'selected':''}>${h(o)}</option>`).join('')}</select>`; }
    case 'checkbox': return `<input type="checkbox" ${n} ${val?'checked':''}>`;
    case 'relation': return `<select ${n} ${req} data-in="rel" data-target="${f.target}">${relOptions(f, val)}</select>`;
    case 'number': return `<input type="number" step="any" inputmode="decimal" ${n} ${req} value="${h(val)}">`;
    case 'currency': return `<input type="number" step="0.01" min="0" inputmode="decimal" ${n} ${req} value="${h(val)}">`;
    case 'date': return `<input type="date" ${n} ${req} value="${h(val)}">`;
    case 'phone': return `<input type="tel" autocomplete="tel" ${n} ${req} value="${h(val)}">`;
    case 'email': return `<input type="email" autocomplete="email" ${n} ${req} value="${h(val)}">`;
    case 'url': return `<input type="url" ${n} ${req} value="${h(val)}" placeholder="https://">`;
    case 'lineitems': { const rows = Array.isArray(val) && val.length ? val : [{q:1, t:true}];
      return `<div class="lines" data-lines="${f.id}"><table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Tax</th><th class="num">Amount</th><th></th></tr></thead>
        <tbody>${rows.map(lineRow).join('')}</tbody></table><button type="button" class="btn small" data-act="line-add">Add line</button>
        <datalist id="svc-list">${activeServices().map(s => `<option value="${h(s.data.item)}">${h(fmt({type:'currency'}, s.data.price))}${s.data.unit && s.data.unit !== 'Each' ? ' / ' + h(s.data.unit.toLowerCase()) : ''}</option>`).join('')}</datalist></div>`; }
    default: return `<input type="text" ${n} ${req} value="${h(val)}">`;
  }
}
function expandPrefill(ent, data){
  const rels = sch(ent).fields.filter(f => f.type==='relation');
  for (const f of rels){
    const r = find(f.target, data[f.id]); if (!r) continue;
    for (const g of rels){
      if (g === f || data[g.id]) continue;
      const tf = sch(f.target).fields.find(x => x.type==='relation' && x.target===g.target);
      if (tf && r.data[tf.id]) data[g.id] = r.data[tf.id];
    }
  }
  return data;
}
function viewRecord(ent, id, prefill={}){
  const sc = sch(ent); const r = id ? find(ent, id) : null;
  if (id && !r) return `<div class="panel empty">That record was removed.<br><a class="btn" href="#/list/${ent}">Back to ${h(sc.label.toLowerCase())}</a></div>`;
  let data;
  if (r) data = r.data;
  else { data = {}; for (const f of sc.fields) if (f.default !== undefined && f.default !== '') data[f.id] = resolveDefault(f);
    for (const [k,v] of Object.entries(prefill)) if (fld(ent,k)) data[k] = v;
    if (ent === 'invoices' && prefill.copy === '1' && copyDraft) Object.assign(data, clone(copyDraft));
    if (ent === 'invoices' && data.terms) data.due = dueFrom(data.date_issued, data.terms) || data.due;
    expandPrefill(ent, data); }
  const fieldsHtml = sc.fields.map(f => {
    if (f.type === 'checkbox') return `<label class="f chk">${inputFor(f, data[f.id])}${h(f.label)}</label>`;
    if (f.type === 'lineitems') return `<div class="f wide"><span>${h(f.label)}</span>${inputFor(f, data[f.id])}</div>`;
    return `<label class="f ${f.type==='textarea'?'wide':''}" for="f_${f.id}"><span>${h(f.label)}${f.required?' <span class="req" aria-label="required">*</span>':''}</span>
      ${inputFor(f, data[f.id])}${f.hint ? `<small>${h(f.hint)}</small>` : ''}</label>`;
  }).join('');
  let related = '';
  if (r){
    const blocks = [];
    for (const e of ENTS){
      for (const f of sch(e).fields.filter(f => f.type==='relation' && f.target===ent)){
        const list = db.records[e].filter(x => x.data[f.id] === r.id).sort((a,b) => b.no - a.no);
        blocks.push(`<section class="panel"><header><h3>${h(sch(e).label)}${sch(e).fields.filter(x=>x.type==='relation'&&x.target===ent).length>1 ? ` (${h(f.label)})` : ''} <span class="meta">${list.length}</span></h3>
          <a class="btn small" href="#/new/${e}?${f.id}=${r.id}">Add</a></header>
          ${list.length ? `<ul>${list.slice(0,12).map(x => `<li><a href="#/rec/${e}/${x.id}"><span class="tag">${h(tagOf(e,x))}</span><span class="t">${h(label(e,x))}</span>${pill(x.data.status)}</a></li>`).join('')}</ul>` : ''}</section>`);
      }
    }
    related = `<aside class="related">${blocks.join('')}<p class="meta">Created ${new Date(r.created).toLocaleString()}<br>Updated ${new Date(r.updated).toLocaleString()}</p></aside>`;
  }
  return `<div class="head"><div class="row" style="gap:.9rem">${r ? `<span class="tag big">${h(tagOf(ent,r))}</span>` : ''}
      <div><h1>${r ? h(label(ent,r)) : 'New ' + h(sc.singular.toLowerCase())}</h1><p><a href="#/list/${ent}">${h(sc.label)}</a></p></div></div>
      <div class="row">${r && ent==='estimates' ? `<button class="btn" data-act="est-to-inv" data-id="${r.id}">Create invoice from this</button>` : ''}
      ${r && ent==='invoices' ? `<button class="btn" data-act="copy-inv" data-id="${r.id}">Copy to new invoice</button>` : ''}
      ${r && ent==='tickets' ? `<button class="btn" data-act="print" data-id="${r.id}">Print work order</button>` : ''}
      ${r && (ent==='invoices'||ent==='estimates') ? `<button class="btn" data-act="print-doc" data-ent="${ent}" data-id="${r.id}">Print ${h(sch(ent).singular.toLowerCase())}</button>
        <button class="btn" data-act="email-doc" data-ent="${ent}" data-id="${r.id}">Email ${h(sch(ent).singular.toLowerCase())}</button>` : ''}</div></div>
    <div class="record" ${r ? '' : 'style="grid-template-columns:1fr"'}>
      <form class="panel" id="recform" data-ent="${ent}" data-id="${r?r.id:''}" novalidate>
        <div class="formgrid">${fieldsHtml}</div>
        <div class="formfoot"><button class="btn primary" type="submit">${r ? 'Save changes' : 'Create ' + h(sc.singular.toLowerCase())}</button>
          <a class="btn" href="#/list/${ent}">Cancel</a><span class="grow"></span>
          ${r ? `<button class="btn danger" type="button" data-act="del-rec" data-ent="${ent}" data-id="${r.id}">Delete</button>` : ''}</div>
      </form>${related}</div>`;
}
function afterForm(){ const form = $('#recform'); if (!form) return; refilter(form); recalc(form); if (!form.dataset.id) form.querySelector('input,select,textarea')?.focus(); }
function refilter(form){
  const ent = form.dataset.ent; const rels = sch(ent).fields.filter(f => f.type==='relation');
  for (const f of rels){
    const cons = [];
    for (const g of rels){
      if (g === f) continue;
      const tf = sch(f.target).fields.find(x => x.type==='relation' && x.target===g.target);
      const v = form.elements['f_'+g.id]?.value;
      if (tf && v) cons.push([tf.id, v]);
    }
    const el = form.elements['f_'+f.id]; if (el) el.innerHTML = relOptions(f, el.value, cons);
  }
}
function autoFillFrom(form, changed){
  const ent = form.dataset.ent; const rels = sch(ent).fields.filter(f => f.type==='relation');
  const f = rels.find(x => 'f_'+x.id === changed.name); if (!f) return;
  const r = find(f.target, changed.value); if (!r) return;
  for (const g of rels){
    if (g === f) continue; const el = form.elements['f_'+g.id]; if (!el || el.value) continue;
    const tf = sch(f.target).fields.find(x => x.type==='relation' && x.target===g.target);
    if (tf && r.data[tf.id]) { el.innerHTML = relOptions(g, r.data[tf.id]); }
  }
}
function saveRecord(form){
  const ent = form.dataset.ent, id = form.dataset.id, sc = sch(ent);
  const data = {};
  for (const f of sc.fields){
    if (f.type === 'lineitems'){ const ls = readLines(form, f.id); if (ls.length) data[f.id] = ls; continue; }
    if (f.calc) continue;
    const el = form.elements['f_'+f.id]; if (!el) continue;
    let v = f.type==='checkbox' ? el.checked : el.value.trim();
    if ((f.type==='number'||f.type==='currency') && v !== '') v = Number(v);
    if (f.required && (v === '' || v === false)) { toast(`${f.label} is required.`); el.focus(); return; }
    if (f.type==='email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast('Check the email address format.'); el.focus(); return; }
    if (v !== '' && v !== false) data[f.id] = v;
  }
  if (ent === 'invoices' && data.terms && !data.due) data.due = dueFrom(data.date_issued, data.terms) || undefined;
  if (ent === 'invoices' && data.status === 'Paid'){
    computeTotals(ent, data);
    if (fld(ent,'amount_paid') && data.amount_paid === undefined && data.total) data.amount_paid = data.total;
    if (fld(ent,'paid_date') && !data.paid_date) data.paid_date = today();
  }
  computeTotals(ent, data);
  let r;
  if (id){ r = find(ent, id);
    for (const f of sc.fields){ if (f.id in data) r.data[f.id] = data[f.id]; else delete r.data[f.id]; }
    r.updated = new Date().toISOString();
  } else r = createRecord(ent, data);
  const auto = ent === 'invoices' ? scheduleInvoiceFollowups(r) : '';
  if (save()) { toast(auto || (id ? 'Changes saved' : `${sc.singular} ${tagOf(ent,r)} created`)); location.hash = `#/rec/${ent}/${r.id}`; if (id) route(); }
}
function scheduleInvoiceFollowups(inv){
  const S = db.settings;
  if (!S.fuEnabled || inv.autoFU || !(S.followTrigger || []).includes(inv.data.status)) return '';
  const c = find('customers', inv.data.customer); if (!c) return '';
  const t = find('tickets', inv.data.ticket), a = t && find('assets', t.data.asset);
  const base = inv.data.service_date || inv.data.date_issued || today();
  const method = c.data.phone_mobile ? 'Text' : c.data.phone ? 'Call' : 'Email';
  const days = Math.max(1, parseInt(S.fuDays,10) || 14), months = Math.max(1, parseInt(S.fuMonths,10) || 2);
  const steps = [
    { due: shiftDate(base, {days}), name: days % 7 === 0 ? `${days/7}-week check-in` : `${days}-day check-in` },
    { due: shiftDate(base, {months}), name: `${months}-month check-in` }];
  const cname = label('customers', c), what = a ? label('assets', a) : 'their device';
  for (const s of steps){
    const d = {};
    setIf('followups', d, 'subject', `${s.name}: ${cname}`);
    setIf('followups', d, 'customer', c.id); if (t) setIf('followups', d, 'ticket', t.id);
    setIf('followups', d, 'invoice', inv.id); setIf('followups', d, 'method', method);
    setIf('followups', d, 'due', s.due); setIf('followups', d, 'status', fld('followups','status')?.options[0]);
    setIf('followups', d, 'notes', `Automatic after ${tagOf('invoices', inv)} (service ${fmt({type:'date'}, base)}). Ask how ${what} is running and whether they need anything else.`);
    createRecord('followups', d);
  }
  inv.autoFU = new Date().toISOString();
  return `Saved. Follow-ups set for ${steps.map(s => fmt({type:'date'}, s.due)).join(' and ')}.`;
}
// Copies an invoice's customer, lines, tax and notes into a new unsaved invoice. Ticket, dates, status and payments start fresh.
let copyDraft = null;
function copyInvoice(id){
  const inv = find('invoices', id); if (!inv) return;
  copyDraft = {};
  for (const k of ['title','customer','items','tax_rate','notes','terms']) if (inv.data[k] !== undefined && fld('invoices', k)) copyDraft[k] = clone(inv.data[k]);
  location.hash = '#/new/invoices?copy=1';
  toast(`Copied from ${tagOf('invoices', inv)}. Choose the new ticket or device, then save.`);
}
function estimateToInvoice(id){
  const e = find('estimates', id); if (!e) return;
  const d = {};
  for (const k of ['title','customer','ticket','items','tax_rate','notes']) if (e.data[k] !== undefined && fld('invoices', k)) d[k] = clone(e.data[k]);
  setIf('invoices', d, 'estimate', e.id);
  for (const f of sch('invoices').fields) if (d[f.id] === undefined && f.default !== undefined && f.default !== '') d[f.id] = resolveDefault(f);
  if (d.terms && !d.due) d.due = dueFrom(d.date_issued, d.terms) || undefined;
  computeTotals('invoices', d);
  const inv = createRecord('invoices', d);
  if (fld('estimates','status')?.options.includes('Converted')){ e.data.status = 'Converted'; e.updated = new Date().toISOString(); }
  save(); toast(`Invoice ${tagOf('invoices', inv)} created`); location.hash = `#/rec/invoices/${inv.id}`;
}

/* ---------- field editor ---------- */
function viewFields(ent){
  const sc = sch(ent);
  return `<div class="head"><div><h1>Fields</h1><p>Change what you track for each record type. Existing data stays attached to its field.</p></div>
      <a class="btn" href="#/settings">Back to settings</a></div>
    <nav class="tabs" aria-label="Record types">${ENTS.map(e => `<a href="#/fields/${e}" ${e===ent?'aria-current="page"':''}>${h(sch(e).label)}</a>`).join('')}</nav>
    <div class="panel entset">
      <label class="f">Plural name<input data-in="entset" data-ent="${ent}" data-k="label" value="${h(sc.label)}"></label>
      <label class="f">Singular name<input data-in="entset" data-ent="${ent}" data-k="singular" value="${h(sc.singular)}"></label>
      <label class="f">Number prefix<input data-in="entset" data-ent="${ent}" data-k="prefix" maxlength="4" value="${h(sc.prefix)}"></label>
      <label class="f">Next number<input type="number" data-in="entset" data-ent="${ent}" data-k="counter" value="${db.counters[ent]+1}"></label>
    </div>
    <div class="head" style="margin-bottom:.6rem"><h2>${h(sc.label)} fields</h2><button class="btn primary" data-act="fld-add" data-ent="${ent}">Add field</button></div>
    <ul class="fields panel">${sc.fields.map((f,i) => `<li>
      <div class="n"><b>${h(f.label)}</b><small>${h(FIELD_TYPES[f.type]||f.type)}${f.type==='relation' ? ' to ' + h(sch(f.target)?.singular||f.target) : ''}${f.type==='select' ? ': ' + h(f.options.join(', ')) : ''}</small></div>
      <div class="flags">${f.required?'<span>Required</span>':''}${f.list?'<span>In list</span>':''}${f.title?'<span>Record name</span>':''}${f.calc?'<span>Automatic</span>':''}${f.locked?'<span>Core</span>':''}</div>
      <button class="btn small" data-act="fld-move" data-ent="${ent}" data-i="${i}" data-d="-1" ${i===0?'disabled':''} aria-label="Move ${h(f.label)} up">▲</button>
      <button class="btn small" data-act="fld-move" data-ent="${ent}" data-i="${i}" data-d="1" ${i===sc.fields.length-1?'disabled':''} aria-label="Move ${h(f.label)} down">▼</button>
      <button class="btn small" data-act="fld-edit" data-ent="${ent}" data-i="${i}">Edit</button>
      <button class="btn small danger" data-act="fld-del" data-ent="${ent}" data-i="${i}" ${f.locked?'disabled title="Core fields power the dashboard and links. Hide them from the list instead."':''}>Delete</button>
    </li>`).join('')}</ul>`;
}
function editField(ent, i){
  const isNew = i === undefined;
  const f = isNew ? {id:'', label:'', type:'text', options:[], list:false, required:false, title:false} : clone(sch(ent).fields[i]);
  const dlg = $('#dlg');
  dlg.innerHTML = `<form id="fldform" data-ent="${ent}" data-i="${isNew?'':i}"><h2>${isNew ? 'Add field' : 'Edit field'}</h2>
    <div class="formgrid">
      <label class="f wide">Label<input name="label" required value="${h(f.label)}"></label>
      <label class="f">Type<select name="type" ${f.locked?'disabled':''} data-in="ftype">${Object.entries(FIELD_TYPES).map(([k,v]) => `<option value="${k}" ${k===f.type?'selected':''}>${v}</option>`).join('')}</select></label>
      <label class="f" data-show="relation">Links to<select name="target">${ENTS.map(e => `<option value="${e}" ${e===f.target?'selected':''}>${h(sch(e).singular)}</option>`).join('')}</select></label>
      <label class="f">Default value<input name="default" value="${h(f.default??'')}" placeholder="Blank, or 'today' for dates"></label>
      <label class="f wide" data-show="select">Choices, one per line<textarea name="options">${h((f.options||[]).join('\n'))}</textarea></label>
      <label class="f wide">Help text<input name="hint" value="${h(f.hint||'')}"></label>
      <label class="f chk"><input type="checkbox" name="required" ${f.required?'checked':''}>Required</label>
      <label class="f chk"><input type="checkbox" name="list" ${f.list?'checked':''}>Show in list</label>
      <label class="f chk wide" style="padding-top:0"><input type="checkbox" name="title" ${f.title?'checked':''}>Use as part of the record name</label>
    </div>
    <div class="formfoot"><button class="btn primary" type="submit">${isNew ? 'Add field' : 'Save field'}</button><button class="btn" type="button" data-act="dlg-close">Cancel</button></div></form>`;
  toggleTypeRows(dlg, f.type); dlg.showModal(); $('input[name=label]', dlg).focus();
}
function toggleTypeRows(dlg, type){ $$('[data-show]', dlg).forEach(el => el.style.display = el.dataset.show === type ? '' : 'none'); }
function saveField(form){
  const ent = form.dataset.ent, iStr = form.dataset.i, sc = sch(ent);
  const E = form.elements;
  const labelV = E.label.value.trim(); if (!labelV) { toast('Give the field a label.'); return; }
  const existing = iStr === '' ? null : sc.fields[+iStr];
  const type = existing?.locked ? existing.type : E.type.value;
  const f = existing ? existing : { id:'' };
  f.label = labelV; f.type = type;
  f.required = E.required.checked; f.list = E.list.checked; f.title = E.title.checked;
  const hint = E.hint.value.trim(); if (hint) f.hint = hint; else delete f.hint;
  const def = E.default.value.trim(); if (def) f.default = def; else delete f.default;
  if (type === 'select'){ f.options = E.options.value.split('\n').map(s => s.trim()).filter(Boolean); if (!f.options.length) { toast('Add at least one choice.'); return; } }
  else delete f.options;
  if (type === 'relation') f.target = E.target.value; else delete f.target;
  if (!existing){
    let base = labelV.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,24) || 'field';
    let id = base; while (sc.fields.some(x => x.id === id)) id = base + '_' + Math.random().toString(36).slice(2,5);
    f.id = id; sc.fields.push(f);
  }
  if (!sc.fields.some(x => x.title)) toast('Tip: mark at least one field as the record name.');
  save(); $('#dlg').close(); route(); toast(existing ? 'Field saved' : 'Field added');
}

/* ---------- settings ---------- */
function viewSettings(){
  const S = db.settings;
  const ts = fld('tickets','status'), fs = fld('followups','status');
  return `<div class="head"><div><h1>Settings</h1><p>Changes save to GitHub automatically.</p></div></div>
  <div class="settings">
    <section class="panel"><h2>Shop</h2><p>Shown on printed work orders, estimates, and invoices.</p>
      <div class="formgrid">
        <label class="f">Shop name<input data-in="setting" data-k="shopName" value="${h(S.shopName)}"></label>
        <label class="f">Address line<input data-in="setting" data-k="shopLine" value="${h(S.shopLine)}"></label>
        <label class="f wide">Work order terms<textarea data-in="setting" data-k="terms">${h(S.terms)}</textarea></label>
      </div></section>
    <section class="panel"><h2>Fields and record types</h2><p>Add, rename, reorder, or remove fields on any record type. Change dropdown choices like ticket statuses.</p>
      <div class="row">${ENTS.map(e => `<a class="btn" href="#/fields/${e}">${h(sch(e).label)}</a>`).join('')}</div></section>
    <section class="panel"><h2>What counts as finished</h2><p>Finished records drop out of the bench, the due list, and "Open only" views.</p>
      <div class="formgrid">
        <fieldset class="f" style="border:0;padding:0;margin:0"><legend>Closed ticket statuses</legend>${ts ? ts.options.map(o => `<label class="f chk" style="padding-top:.3rem"><input type="checkbox" data-in="statusset" data-k="closed" value="${h(o)}" ${S.closed.includes(o)?'checked':''}>${h(o)}</label>`).join('') : ''}</fieldset>
${[['estimates','estDone','Finished estimate statuses'],['invoices','invDone','Finished invoice statuses']].map(([e,k,lab]) => { const sf = fld(e,'status');
          return sf ? `<fieldset class="f" style="border:0;padding:0;margin:0"><legend>${lab}</legend>${sf.options.map(o => `<label class="f chk" style="padding-top:.3rem"><input type="checkbox" data-in="statusset" data-k="${k}" value="${h(o)}" ${(S[k]||[]).includes(o)?'checked':''}>${h(o)}</label>`).join('')}</fieldset>` : ''; }).join('')}
        <fieldset class="f" style="border:0;padding:0;margin:0"><legend>Done follow-up statuses</legend>${fs ? fs.options.map(o => `<label class="f chk" style="padding-top:.3rem"><input type="checkbox" data-in="statusset" data-k="done" value="${h(o)}" ${S.done.includes(o)?'checked':''}>${h(o)}</label>`).join('') : ''}</fieldset>
      </div></section>
    <section class="panel"><h2>Follow-ups after payment</h2><p>When an invoice moves to one of these statuses, two check-in follow-ups are created for that customer, counted from the invoice's service date. This happens once per invoice. Cell numbers get a Text follow-up; others get a Call.</p>
      <div class="formgrid">
        <label class="f chk" style="padding-top:0"><input type="checkbox" data-in="settingchk" data-k="fuEnabled" ${S.fuEnabled?'checked':''}>Create follow-ups automatically</label>
        <label class="f">First check-in (days after service)<input type="number" min="1" data-in="setting" data-k="fuDays" value="${h(S.fuDays)}"></label>
        <label class="f">Second check-in (months after service)<input type="number" min="1" data-in="setting" data-k="fuMonths" value="${h(S.fuMonths)}"></label>
        ${fld('invoices','status') ? `<fieldset class="f wide" style="border:0;padding:0;margin:0"><legend>Invoice statuses that trigger them</legend><div class="row">${fld('invoices','status').options.map(o => `<label class="f chk" style="padding-top:.3rem"><input type="checkbox" data-in="statusset" data-k="followTrigger" value="${h(o)}" ${(S.followTrigger||[]).includes(o)?'checked':''}>${h(o)}</label>`).join('')}</div></fieldset>` : ''}
        <label class="f wide">Note printed on invoices<input data-in="setting" data-k="invoiceNote" value="${h(S.invoiceNote||'')}"></label>
      </div></section>
    <section class="panel"><h2>Website chat leads</h2><p>Pull visitors your Wix chat assistant talked to. Each new lead becomes a customer, a ticket with the AI triage notes, and a follow-up due today.</p>
      <div class="formgrid">
        <label class="f wide">Leads address<input data-in="setting" data-k="leadsUrl" placeholder="https://www.precisiontechbench.com/_functions/leads" value="${h(S.leadsUrl)}"></label>
        <label class="f">Access key<input type="password" data-in="setting" data-k="leadsKey" autocomplete="off" value="${h(S.leadsKey)}"></label>
        <div class="f" style="justify-content:flex-end"><button class="btn primary" data-act="sync" ${S.leadsUrl?'':'disabled'}>Sync web leads</button></div>
      </div><p class="meta" style="margin-top:.8rem">${S.lastSync ? 'Last synced ' + new Date(S.lastSync).toLocaleString() + '. ' : ''}${S.imported.length} leads imported so far.</p></section>
    <section class="panel"><h2>Storage</h2><p>Records are encrypted in this browser before they're saved to <b>${h(sess.owner)}/${h(sess.repo)}</b>. Every save is a commit, so GitHub keeps the full history. ${syncState.msg ? '<br><span style="color:var(--danger)">' + h(syncState.msg) + '</span>' : ''}</p>
      <div class="row"><button class="btn primary" data-act="push-now">Save to GitHub now</button><button class="btn" data-act="pull-now">Load latest from GitHub</button>
      <a class="btn" href="https://github.com/${encodeURIComponent(sess.owner)}/${encodeURIComponent(sess.repo)}/commits" target="_blank" rel="noopener noreferrer">View history on GitHub</a></div></section>
    <section class="panel"><h2>Security</h2><p>Signed in as <b>${h(sess.u)}</b>. The app locks itself after a period without activity, and refreshing the page also locks it.</p>
      <div class="formgrid"><label class="f">Lock after (minutes)<input type="number" min="5" max="480" data-in="setting" data-k="autoLock" value="${h(S.autoLock || 30)}"></label></div>
      <div class="row" style="margin-top:1rem"><button class="btn" data-act="security">Change password, username, or token</button><button class="btn" data-act="lock">Lock now</button></div></section>
    <section class="panel"><h2>Export</h2><p>Download a readable copy of everything, or restore one. Treat an exported file like paper records: it isn't encrypted.</p>
      <div class="row"><button class="btn primary" data-act="export-json">Export backup</button>
        <label class="btn">Restore backup<input type="file" accept="application/json,.json" data-in="import" hidden></label>
        ${ENTS.map(e => `<button class="btn" data-act="csv" data-ent="${e}">${h(sch(e).label)} CSV</button>`).join('')}</div></section>
    <section class="panel"><h2>Start fresh</h2><p>Add a few example records to try things out, or erase everything.</p>
      <div class="row"><button class="btn" data-act="sample">Add sample records</button><button class="btn danger" data-act="wipe">Erase all data</button></div></section>
  </div>`;
}
function csvFor(ent){
  const fs = sch(ent).fields;
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const lines = [['No.', ...fs.map(f => f.label), 'Created'].map(q).join(',')];
  for (const r of db.records[ent]) lines.push([tagOf(ent,r), ...fs.map(f => fmt(f, r.data[f.id])), r.created].map(q).join(','));
  return lines.join('\r\n');
}
function sample(){
  const c1 = createRecord('customers', {name:'Martha Ellis', phone:'5025550142', phone_mobile:true, email:'martha.ellis@example.com', contact_pref:'Call', source:'Walk-in'});
  const c2 = createRecord('customers', {name:'Carroll County Feed & Seed', company:'Carroll County Feed & Seed', phone:'5025550188', email:'office@example.com', contact_pref:'Email', source:'Referral'});
  const a1 = createRecord('assets', {customer:c1.id, type:'Laptop', make:'HP', model:'Pavilion 15', serial:'5CD1234XYZ', os:'Windows 11'});
  const a2 = createRecord('assets', {customer:c2.id, type:'Desktop', make:'Dell', model:'OptiPlex 7090', os:'Windows 10'});
  const t1 = createRecord('tickets', {title:'Slow startup and pop-ups', customer:c1.id, asset:a1.id, status:'Diagnosing', priority:'Normal', category:'Virus / malware', intake:'Walk-in', date_in:today(), problem:'Takes 10 minutes to boot. Browser opens ads on its own.'});
  createRecord('tickets', {title:'Replace failing hard drive', customer:c2.id, asset:a2.id, status:'Waiting on parts', priority:'High', category:'Hardware', intake:'Onsite', date_in:today(), quote:189});
  createRecord('estimates', {title:'Replace hard drive with SSD', customer:c2.id, status:'Sent', date:today(), items:[{d:'1 TB SSD',q:1,p:89.99,t:true},{d:'Drive install and data transfer (labor)',q:1.5,p:65,t:true}], tax_rate:6});
  db.records.estimates.slice(-1).forEach(r => computeTotals('estimates', r.data));
  createRecord('invoices', {title:'Virus removal and tune-up', customer:c1.id, ticket:t1.id, status:'Sent', date_issued:today(), service_date:today(), items:[{d:'Malware removal and cleanup',q:1,p:95,t:true},{d:'Windows tune-up',q:1,p:35,t:true}], tax_rate:6});
  db.records.invoices.slice(-1).forEach(r => computeTotals('invoices', r.data));
  for (const [item, category, price, unit, taxable] of [['Diagnostic fee','Diagnostics',49,'Flat rate','Non-taxable'],['Virus and malware removal','Virus / malware',95,'Flat rate','Taxable'],['Bench labor','Labor',65,'Hour','Taxable'],['Data transfer','Data recovery',75,'Flat rate','Taxable']])
    createRecord('services', {item, category, price, unit, taxable, status:'Active'});
  createRecord('followups', {subject:'Call Martha with diagnosis', customer:c1.id, ticket:t1.id, method:'Call', due:today(), status:'Pending'});
  save(); toast('Sample records added'); location.hash = '#/';
}

/* ---------- web leads ---------- */
async function syncLeads(btn){
  const S = db.settings; if (!S.leadsUrl) { toast('Add the leads address in Settings first.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
  try {
    const u = new URL(S.leadsUrl); if (S.leadsKey) u.searchParams.set('key', S.leadsKey);
    const res = await fetch(u.toString(), {cache:'no-store'});
    if (res.status === 403) throw new Error('The access key was rejected. Check it matches PTB_CRM_KEY in Wix.');
    if (!res.ok) throw new Error('The leads address answered with error ' + res.status + '.');
    const body = await res.json(); const leads = Array.isArray(body) ? body : (body.leads || []);
    let added = 0; const cutoff = Date.now() - 30*60*1000;
    for (const L of leads){
      if (!L || !L._id || S.imported.includes(L._id)) continue;
      const finished = L.status === 'Triaged' || new Date(L._createdDate).getTime() < cutoff;
      if (!finished) continue;   // visitor may still be chatting; pick it up next sync
      importLead(L); S.imported.push(L._id); added++;
    }
    if (S.imported.length > 2000) S.imported = S.imported.slice(-2000);
    S.lastSync = new Date().toISOString(); save();
    toast(added ? `${added} new web lead${added>1?'s':''} imported` : 'No new web leads');
    route();
  } catch(e){
    toast(e.message.includes('Failed to fetch') ? 'Could not reach the leads address. Check the URL and your connection.' : e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Sync web leads'; }
  }
}
function importLead(L){
  const em = String(L.email||'').toLowerCase(), ph = digits(L.phone);
  let c = db.records.customers.find(r => (em && String(r.data.email||'').toLowerCase() === em) || (ph.length===10 && digits(r.data.phone) === ph));
  if (!c){ const d = {}; setIf('customers', d, 'name', L.name || 'Web visitor'); setIf('customers', d, 'phone', L.phone); setIf('customers', d, 'email', L.email); setIf('customers', d, 'source', 'Website');
    c = createRecord('customers', d); }
  let t = null;
  if (L.reason || L.summary){
    const catMap = {'Hardware':'Hardware','Software':'Software','Network':'Network','Data recovery':'Data recovery','Service request':'Setup / install','Malware':'Virus / malware'};
    const intakeMap = {'Bring it in':'Drop-off','Onsite visit':'Onsite','Remote session':'Remote','Callback':'Phone'};
    const d = {};
    setIf('tickets', d, 'title', (L.reason || L.summary).slice(0, 80));
    setIf('tickets', d, 'customer', c.id);
    setIf('tickets', d, 'status', fld('tickets','status')?.options[0]);
    setIf('tickets', d, 'priority', L.urgency || 'Normal');
    setIf('tickets', d, 'category', catMap[L.category] || (fld('tickets','category')?.options.includes('Other') ? 'Other' : undefined));
    setIf('tickets', d, 'intake', 'Website');
    setIf('tickets', d, 'date_in', today());
    const notes = [L.reason && 'Visitor said: ' + L.reason, L.summary && 'AI triage: ' + L.summary, L.device && 'Device: ' + L.device,
      L.category && 'Category: ' + L.category, L.nextStep && 'Suggested next step: ' + (intakeMap[L.nextStep] ? L.nextStep : L.nextStep),
      L.safetyFlags && L.safetyFlags.toLowerCase() !== 'none' && 'Safety flags: ' + L.safetyFlags].filter(Boolean).join('\n');
    setIf('tickets', d, 'problem', notes);
    t = createRecord('tickets', d);
  }
  const f = {};
  setIf('followups', f, 'subject', `Contact web lead: ${L.name || 'visitor'}`);
  setIf('followups', f, 'customer', c.id); if (t) setIf('followups', f, 'ticket', t.id);
  setIf('followups', f, 'method', L.phone ? 'Call' : 'Email');
  setIf('followups', f, 'due', today()); setIf('followups', f, 'status', fld('followups','status')?.options[0]);
  setIf('followups', f, 'notes', L.nextStep ? 'Suggested next step: ' + L.nextStep : '');
  createRecord('followups', f);
}

/* ---------- print ---------- */
function printDoc(ent, id){
  const r = find(ent, id); if (!r) return;
  const S = db.settings, c = find('customers', r.data.customer), sc = sch(ent), D = r.data;
  const items = Array.isArray(D.items) ? D.items : [];
  const money = v => fmt({type:'currency'}, v) || '$0.00';
  const dates = [['date','Date'],['date_issued','Date'],['service_date','Service date'],['due','Balance due date'],['valid_until','Valid until'],['paid_date','Paid']]
    .filter(([k]) => D[k] && fld(ent,k)).map(([k,l]) => `<div><b>${l}:</b> ${h(fmt({type:'date'}, D[k]))}</div>`).join('');
  const totals = [['subtotal','Subtotal'],['tax',`Tax${D.tax_rate ? ' (' + D.tax_rate + '%)' : ''}`],['total','Total'],['amount_paid','Paid'],['balance','Balance due']]
    .filter(([k]) => fld(ent,k) && (k!=='amount_paid' || +D.amount_paid)).map(([k,l]) => `<tr><td colspan="3" style="text-align:right;border:0">${h(l)}</td><td style="text-align:right;${k==='total'||k==='balance'?'font-weight:700':''}">${money(D[k])}</td></tr>`).join('');
  $('#print').innerHTML = `<div style="display:flex;justify-content:space-between;gap:24pt"><div style="display:flex;align-items:center;gap:12pt"><img src="logo.png" alt="" class="logo"><div><h1>${h(S.shopName)}</h1><p>${h(S.shopLine)}</p></div></div>
      <div style="text-align:right"><h2 style="font-size:16pt;margin:0">${h(sc.singular.toUpperCase())}</h2><p style="margin:.2em 0">${h(tagOf(ent,r))}</p>${D.status ? `<p style="margin:0">${h(D.status)}</p>` : ''}</div></div>
    <div style="display:flex;justify-content:space-between;gap:24pt;margin:12pt 0"><div><b>Bill to</b><br>${c ? h(label('customers',c)) : ''}${c && c.data.address ? '<br>' + h(c.data.address).replace(/\n/g,'<br>') : ''}${c ? '<br>' + h([fmt({type:'phone'}, c.data.phone), c.data.email].filter(Boolean).join('  |  ')) : ''}</div><div style="text-align:right">${dates}</div></div>
    ${D.title ? `<p><b>${h(D.title)}</b></p>` : ''}
    <table class="items"><thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${items.map(l => `<tr><td>${h(l.d)}${l.t === false ? ' <small>(non-taxable)</small>' : ''}</td><td style="text-align:right">${h(l.q)}</td><td style="text-align:right">${money(l.p)}</td><td style="text-align:right">${money(round2(l.q*l.p))}</td></tr>`).join('')}${totals}</tbody></table>
    ${D.payment_method && D.status === 'Paid' ? `<p>Paid by ${h(D.payment_method)}.</p>` : ''}
    ${D.notes ? `<p style="white-space:pre-wrap">${h(D.notes)}</p>` : ''}
    ${ent === 'estimates' ? `<p style="font-size:9.5pt">This is an estimate, not a bill. Final cost may change if we find something unexpected; we'll check with you first.</p><div class="sig"><div>Approved by</div><div>Date</div></div>` : `<p style="margin-top:14pt">${h(S.invoiceNote || '')}</p>`}`;
  printWhenReady();
}
function printWhenReady(){
  const logo = $('#print img.logo');
  if (logo && !logo.complete) logo.onload = logo.onerror = () => window.print(); // wait so the logo makes it onto the page
  else window.print();
}
function printPrices(){
  const S = db.settings, list = activeServices();
  if (!list.length){ toast('No active services to print yet'); return; }
  const cats = [...new Set(list.map(r => r.data.category || 'Other'))].sort((a,b) => a.localeCompare(b));
  $('#print').innerHTML = `<div style="display:flex;justify-content:space-between;gap:24pt"><div style="display:flex;align-items:center;gap:12pt"><img src="logo.png" alt="" class="logo"><div><h1>${h(S.shopName)}</h1><p>${h(S.shopLine)}</p></div></div>
      <div style="text-align:right"><h2 style="font-size:16pt;margin:0">PRICE LIST</h2><p style="margin:.2em 0">${h(fmt({type:'date'}, today()))}</p></div></div>
    <table class="items" style="margin-top:12pt"><thead><tr><th>Service</th><th style="text-align:right">Price</th><th>Tax</th></tr></thead><tbody>
    ${cats.map(c => `<tr><td colspan="3" style="background:#eee;font-weight:700">${h(c)}</td></tr>` + list.filter(r => (r.data.category || 'Other') === c).map(r => `<tr><td>${h(r.data.item)}${r.data.description ? `<br><small>${h(r.data.description)}</small>` : ''}</td>
      <td style="text-align:right;white-space:nowrap">${h(fmt({type:'currency'}, r.data.price) || '$0.00')}${r.data.unit && r.data.unit !== 'Each' ? ' / ' + h(r.data.unit.toLowerCase()) : ''}</td><td>${h(r.data.taxable || 'Taxable')}</td></tr>`).join('')).join('')}
    </tbody></table><p style="margin-top:14pt;font-size:9.5pt">Prices subject to change. Parts are quoted separately unless listed.</p>`;
  printWhenReady();
}
// Opens the user's own mail app with a ready-to-send message; they attach the PDF themselves.
function emailDoc(ent, id){
  const r = find(ent, id); if (!r) return;
  const S = db.settings, c = find('customers', r.data.customer), D = r.data, what = sch(ent).singular;
  const to = c && c.data.email ? String(c.data.email).trim() : '';
  if (!to){ toast('This customer has no email address on file'); return; }
  const money = v => fmt({type:'currency'}, v) || '$0.00';
  const items = Array.isArray(D.items) ? D.items : [];
  const lines = [
    `Hi ${String(c.data.name || '').trim().split(/\s+/)[0] || 'there'},`, '',
    ent === 'estimates' ? `Here is your estimate from ${S.shopName}.` : `Here is your invoice from ${S.shopName}.`, '',
    `${what} ${tagOf(ent, r)}${D.title ? ' - ' + D.title : ''}`,
    ...items.map(l => `- ${l.d}: ${l.q} x ${money(l.p)} = ${money(round2(l.q*l.p))}`), '',
    ...[['subtotal','Subtotal'],['tax','Tax'],['total','Total'],['amount_paid','Paid'],['balance','Balance due']]
      .filter(([k]) => fld(ent,k) && (k !== 'amount_paid' || +D.amount_paid)).map(([k,l]) => `${l}: ${money(D[k])}`),
    ...(D.due && ent === 'invoices' ? [`Balance due date: ${fmt({type:'date'}, D.due)}${D.terms ? ' (' + D.terms + ')' : ''}`] : []),
    ...(D.valid_until && ent === 'estimates' ? ['Valid until: ' + fmt({type:'date'}, D.valid_until)] : []),
    '', ent === 'estimates' ? 'Reply to this email to approve, or let us know if you have any questions.' : (S.invoiceNote || ''),
    '', S.shopName, S.shopLine || ''];
  const subject = `${what} ${tagOf(ent, r)} from ${S.shopName}`;
  location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n').trim())}`;
}
function printTicket(id){
  const r = find('tickets', id); if (!r) return;
  const S = db.settings; const c = find('customers', r.data.customer); const a = find('assets', r.data.asset);
  const rows = sch('tickets').fields.filter(f => f.type!=='relation' && r.data[f.id] !== undefined && r.data[f.id] !== '')
    .map(f => `<tr><th>${h(f.label)}</th><td style="white-space:pre-wrap">${h(fmt(f, r.data[f.id]))}</td></tr>`).join('');
  $('#print').innerHTML = `<div style="display:flex;align-items:center;gap:12pt"><img src="logo.png" alt="" class="logo"><div><h1>${h(S.shopName)}</h1><p>${h(S.shopLine)}</p></div></div>
    <h2 style="font-size:14pt">Work order ${h(tagOf('tickets',r))}</h2>
    <table><tr><th>Customer</th><td>${c ? h(label('customers',c)) + '<br>' + h([fmt({type:'phone'}, c.data.phone), c.data.email].filter(Boolean).join('  |  ')) : ''}</td></tr>
    <tr><th>Device</th><td>${a ? h(label('assets',a)) + (a.data.serial ? '<br>S/N ' + h(a.data.serial) : '') : ''}</td></tr>${rows}</table>
    <p style="margin-top:14pt;font-size:9.5pt">${h(S.terms)}</p>
    <div class="sig"><div>Customer signature</div><div>Date</div><div>Technician</div></div>`;
  printWhenReady();
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) { const row = e.target.closest('[data-href]'); if (row && !e.target.closest('a')) location.hash = row.dataset.href; return; }
  const {act, ent} = t.dataset;
  if (act === 'sort'){ const k = t.dataset.k, s = ui.sort[ent] || {k:'no',dir:-1}; ui.sort[ent] = {k, dir: s.k===k ? -s.dir : 1}; route(); }
  else if (act === 'del-rec'){ const r = find(ent, t.dataset.id);
    if (confirm(`Delete ${sch(ent).singular.toLowerCase()} ${tagOf(ent,r)}? Linked records stay but will show as removed.`)){
      tombstone([r.id]); db.records[ent] = db.records[ent].filter(x => x.id !== r.id); save(); toast('Deleted'); location.hash = '#/list/' + ent; } }
  else if (act === 'print') printTicket(t.dataset.id);
  else if (act === 'print-doc') printDoc(ent, t.dataset.id);
  else if (act === 'email-doc') emailDoc(ent, t.dataset.id);
  else if (act === 'print-prices') printPrices();
  else if (act === 'est-to-inv') estimateToInvoice(t.dataset.id);
  else if (act === 'copy-inv') copyInvoice(t.dataset.id);
  else if (act === 'line-add'){ const tb = $('tbody', t.closest('.lines')); tb.insertAdjacentHTML('beforeend', lineRow({q:1, t:true})); $('tr:last-child .li-d', tb).focus(); }
  else if (act === 'line-del'){ const form = t.closest('form'); const tb = t.closest('tbody'); t.closest('tr').remove(); if (!tb.children.length) tb.insertAdjacentHTML('beforeend', lineRow({q:1, t:true})); recalc(form); }
  else if (act === 'fld-add') editField(ent);
  else if (act === 'fld-edit') editField(ent, +t.dataset.i);
  else if (act === 'fld-move'){ const fs = sch(ent).fields, i = +t.dataset.i, j = i + (+t.dataset.d); [fs[i], fs[j]] = [fs[j], fs[i]]; save(); route(); }
  else if (act === 'fld-del'){ const fs = sch(ent).fields, f = fs[+t.dataset.i];
    if (f.locked) return;
    const used = db.records[ent].filter(r => r.data[f.id] !== undefined).length;
    if (confirm(`Delete the "${f.label}" field?${used ? ` ${used} records have a value in it; those values will be removed.` : ''}`)){
      fs.splice(+t.dataset.i, 1); db.records[ent].forEach(r => delete r.data[f.id]); save(); route(); toast('Field deleted'); } }
  else if (act === 'dlg-close') $('#dlg').close();
  else if (act === 'sync') syncLeads(t);
  else if (act === 'export-json'){ db.settings.lastBackup = new Date().toISOString(); save(); download(`bench-crm-backup-${today()}.json`, JSON.stringify(db, null, 1), 'application/json'); toast('Backup exported'); if (!parseHash().parts[0]) route(); }
  else if (act === 'csv') download(`${ent}-${today()}.csv`, csvFor(ent), 'text/csv');
  else if (act === 'sample') sample();
  else if (act === 'wipe'){ if (confirm('Erase every record and reset all fields? This also erases them from GitHub (earlier versions stay in the repository history).') && confirm('Erase everything?')){
      replaceDb(freshDb()); toast('All data erased'); location.hash = '#/'; route(); } }
  else if (act === 'lock') lock('Locked.');
  else if (act === 'push-now'){ if (dirty || !remoteSha) push(); else toast('Everything is already saved'); }
  else if (act === 'pull-now') refresh(true);
  else if (act === 'security') viewSecurity();
  else if (act === 'dl-config') download('config.js', pendingSetup.config, 'text/javascript');
  else if (act === 'setup-open'){ const s = pendingSetup.secret; t.disabled = true; window.PTB_VAULT = pendingSetup.vault; startSession(s).then(() => { pendingSetup = null; }).catch(e => { t.disabled = false; toast(e.message); }); }
  else if (act === 'legacy-import'){ const L = legacyData(); if (L){ const now = new Date().toISOString();
      for (const e of ENTS) L.records[e].forEach(r => { r.updated = now; });
      L.meta.configUpdated = Date.now(); db = merge(db, L); save._cfg = ''; save(); localStorage.removeItem(KEY); toast('Records moved into secure storage'); route(); } }
  else if (act === 'legacy-drop'){ if (confirm('Delete the unsecured copy from this browser?')){ localStorage.removeItem(KEY); route(); } }
});
document.addEventListener('keydown', e => {
  if (!db) return;
  const typingIn = e.target.closest('input,textarea,select,[contenteditable]');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
    const f = $('#dlg[open] form') || $('#recform'); if (f){ e.preventDefault(); f.requestSubmit(); } return; }
  if (e.altKey && /^[1-9]$/.test(e.key)){ e.preventDefault();
    location.hash = ['#/', ...ENTS.map(x => '#/list/' + x), '#/settings'][+e.key-1]; return; }
  if (typingIn || e.ctrlKey || e.metaKey || e.altKey || $('#dlg[open]')) return;
  const {parts} = parseHash();
  if (e.key === '/'){ const s = $('[data-in=search]'); if (s){ e.preventDefault(); s.focus(); s.select(); } }
  else if (e.key.toLowerCase() === 'n'){ e.preventDefault(); location.hash = '#/new/' + (ENTS.includes(parts[1]) && parts[0] !== 'fields' ? parts[1] : 'tickets'); }
  else if ((e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') && $('#rows tr[data-href]')){
    const rows = $$('#rows tr[data-href]'), i = rows.indexOf(document.activeElement);
    const down = e.key === 'j' || e.key === 'ArrowDown'; e.preventDefault();
    rows[Math.max(0, Math.min(rows.length-1, i < 0 ? 0 : i + (down ? 1 : -1)))].focus(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('tr[data-href]')) location.hash = e.target.dataset.href;
  if (e.key === 'Enter' && e.target.matches('[data-in=search]')){ const r = $('#rows tr[data-href]'); if (r) location.hash = r.dataset.href; }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.in === 'search'){ ui.q[t.dataset.ent] = t.value; fillRows(t.dataset.ent); }
  if (t.matches('.lines .li-d')) applyService(t.closest('tr'));
  const form = t.closest('#recform'); if (form && (t.closest('.lines') || t.name === 'f_tax_rate' || t.name === 'f_amount_paid')) recalc(form);
});
document.addEventListener('change', e => {
  const t = e.target, k = t.dataset.k;
  switch (t.dataset.in){
    case 'filter': ui.filter[t.dataset.ent] = t.value; fillRows(t.dataset.ent); break;
    case 'terms': { const form = t.closest('form'); if (form) setDueFromTerms(form); break; }
    case 'rel': { const form = t.closest('form'); autoFillFrom(form, t); refilter(form); break; }
    case 'ftype': toggleTypeRows($('#dlg'), t.value); break;
    case 'setting': db.settings[k] = t.value.trim(); save(); toast('Saved'); if (k==='autoLock') armIdle(); if (k==='shopName') renderRail('settings'); break;
    case 'settingchk': db.settings[k] = t.checked; save(); toast('Saved'); break;
    case 'statusset': { const set = new Set(db.settings[k]); t.checked ? set.add(t.value) : set.delete(t.value); db.settings[k] = [...set]; save(); break; }
    case 'entset': { const ent = t.dataset.ent;
      if (k === 'counter') { const n = parseInt(t.value,10); if (n > 0) db.counters[ent] = n - 1; }
      else if (t.value.trim()) sch(ent)[k] = k==='prefix' ? t.value.trim().toUpperCase() : t.value.trim();
      save(); toast('Saved'); route(); break; }
    case 'import': { const file = t.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => { try { const d = JSON.parse(rd.result);
          if (!d.schema || !d.records) throw new Error();
          if (!confirm('Replace all records and fields with this backup? The current version stays in GitHub history.')) return;
          const f = freshDb(); for (const x of ['schema','records','counters','settings']) d[x] = {...f[x], ...d[x]};
          replaceDb(d); toast('Backup restored'); location.hash = '#/'; route();
        } catch(err){ toast('That file is not a Bench CRM backup.'); } };
      rd.readAsText(file); break; }
  }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'recform'){ e.preventDefault(); saveRecord(e.target); }
  else if (e.target.id === 'fldform'){ e.preventDefault(); saveField(e.target); }
  else if (e.target.id === 'loginform'){ e.preventDefault(); doLogin(e.target); }
  else if (e.target.id === 'setupform'){ e.preventDefault(); doSetup(e.target); }
  else if (e.target.id === 'secform'){ e.preventDefault(); doSecurity(e.target); }
});

window.addEventListener('hashchange', route);
navigator.serviceWorker?.getRegistrations?.().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
route();
})();
