const $ = id => document.getElementById(id);
const LS = localStorage, KEY = 'vaultnotes.v1', LIMIT = 300;
const S = { key: null, salt: '', notes: [], cur: null, tag: '', last: Date.now() };
let timer, pending = false;
const load = () => JSON.parse(LS.getItem(KEY) || 'null');
const show = (id, on) => { $(id).hidden = !on; };
const err = m => { $('err').textContent = m; };
const cur = () => S.notes.find(n => n.id === S.cur);
const words = t => (t.trim() ? t.trim().split(/\s+/).length : 0) + ' words';

async function persist() {
  const r = await VC.encrypt(S.key, S.notes);
  LS.setItem(KEY, JSON.stringify({ salt: S.salt, ...r }));
  pending = false;
}

/* ---------- theme ---------- */
document.documentElement.dataset.theme = LS.getItem('vaultnotes.theme') ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('theme').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t; LS.setItem('vaultnotes.theme', t);
};

/* ---------- lock screen ---------- */
function initLock() {
  const has = !!load();
  $('lockMsg').textContent = has ? 'Enter your master password to unlock your notes.'
    : 'Create a master password. It cannot be recovered if you forget it.';
  $('lockBtn').textContent = has ? 'Unlock' : 'Create vault';
  show('pw2', !has); show('meter', !has);
  $('pw').value = $('pw2').value = ''; err('');
  show('lock', true); show('app', false);
}
function strength(p) {
  let s = 0;
  if (p.length >= 8) s++; if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}
$('pw').oninput = () => {
  const s = strength($('pw').value), m = $('meter').firstElementChild;
  m.style.width = s * 20 + '%';
  m.style.background = ['#d1453b', '#d1453b', '#d99a1f', '#d99a1f', '#2f9e6b', '#2f9e6b'][s];
};
$('lockForm').onsubmit = async e => {
  e.preventDefault();
  const pw = $('pw').value, v = load();
  try {
    if (!v) {
      if (pw.length < 8) return err('Use at least 8 characters.');
      if (pw !== $('pw2').value) return err('The two passwords do not match.');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      S.salt = VC.b64(salt); S.key = await VC.deriveKey(pw, salt); S.notes = [];
      await persist();
    } else {
      S.salt = v.salt; S.key = await VC.deriveKey(pw, VC.unb64(v.salt));
      S.notes = await VC.decrypt(S.key, v);
    }
  } catch { S.key = null; return err('Wrong password. Try again.'); }
  enter();
};
function enter() {
  show('lock', false); show('app', true);
  $('pw').value = $('pw2').value = '';
  S.last = Date.now(); S.cur = null;
  renderList(); renderEditor(); quote();
  clearInterval(timer); timer = setInterval(tick, 1000); tick();
}
async function lock() {
  clearInterval(timer);
  if (pending && S.key) await persist();
  Object.assign(S, { key: null, notes: [], cur: null, tag: '' });
  $('search').value = ''; initLock();
}
$('lockNow').onclick = lock;

/* ---------- auto-lock ---------- */
['click', 'keydown', 'mousemove', 'touchstart'].forEach(ev =>
  document.addEventListener(ev, () => { S.last = Date.now(); }, { passive: true }));
function tick() {
  const left = Math.max(0, LIMIT - Math.floor((Date.now() - S.last) / 1000));
  $('timer').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  $('ring').style.setProperty('--p', (left / LIMIT * 360) + 'deg');
  if (left === 0) lock();
}

/* ---------- notes list ---------- */
function renderList() {
  const q = $('search').value.toLowerCase(), ul = $('list'), tb = $('tags');
  ul.replaceChildren(); tb.replaceChildren();
  for (const t of [...new Set(S.notes.map(n => n.tag).filter(Boolean))]) {
    const b = document.createElement('button');
    b.textContent = '#' + t; b.className = 'chip' + (S.tag === t ? ' on' : '');
    b.onclick = () => { S.tag = S.tag === t ? '' : t; renderList(); };
    tb.append(b);
  }
  const items = S.notes
    .filter(n => (!S.tag || n.tag === S.tag) && (n.title + ' ' + n.body + ' ' + n.tag).toLowerCase().includes(q))
    .sort((a, b) => (b.pinned - a.pinned) || (b.updated - a.updated));
  for (const n of items) {
    const li = document.createElement('li'), t = document.createElement('b'), p = document.createElement('small');
    li.className = n.id === S.cur ? 'on' : '';
    t.textContent = (n.pinned ? '[Pinned] ' : '') + (n.title || 'Untitled');
    p.textContent = n.body.slice(0, 70) || 'Empty note';
    li.append(t, p); li.onclick = () => open(n.id); ul.append(li);
  }
  if (!items.length) {
    const li = document.createElement('li'); li.className = 'muted';
    li.textContent = S.notes.length ? 'No notes match your search.' : 'No notes yet. Create your first one.';
    ul.append(li);
  }
}
$('search').oninput = renderList;
$('newNote').onclick = async () => {
  const n = { id: crypto.randomUUID(), title: '', body: '', tag: '', pinned: false, updated: Date.now() };
  S.notes.push(n); await persist(); open(n.id); $('title').focus();
};
function open(id) { S.cur = id; renderEditor(); renderList(); }

/* ---------- editor ---------- */
function renderEditor() {
  const n = cur();
  show('empty', !n); show('edit', !!n);
  if (!n) return;
  $('title').value = n.title; $('body').value = n.body; $('tag').value = n.tag;
  $('pin').textContent = n.pinned ? 'Unpin' : 'Pin';
  $('count').textContent = words(n.body); $('saved').textContent = '';
}
let t;
function changed() {
  const n = cur(); if (!n) return;
  n.title = $('title').value; n.body = $('body').value;
  n.tag = $('tag').value.trim().replace(/^#/, '').toLowerCase(); n.updated = Date.now();
  $('count').textContent = words(n.body); $('saved').textContent = 'Saving…';
  pending = true; clearTimeout(t);
  t = setTimeout(async () => { await persist(); $('saved').textContent = 'Saved'; renderList(); }, 600);
}
['title', 'body', 'tag'].forEach(id => $(id).oninput = changed);
$('pin').onclick = async () => { const n = cur(); n.pinned = !n.pinned; await persist(); renderEditor(); renderList(); };
$('del').onclick = async () => {
  if (!confirm('Delete this note permanently?')) return;
  S.notes = S.notes.filter(n => n.id !== S.cur); S.cur = null;
  await persist(); renderEditor(); renderList();
};
$('gen').onclick = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const pw = [...crypto.getRandomValues(new Uint32Array(16))].map(x => c[x % c.length]).join('');
  const b = $('body'); b.setRangeText(pw, b.selectionStart, b.selectionEnd, 'end'); b.focus(); changed();
};

/* ---------- daily quote ---------- */
const FALLBACK = [['The best way out is always through.', 'Robert Frost'],
  ['Well begun is half done.', 'Aristotle'], ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci']];
async function quote() {
  const d = new Date().toDateString();
  let q = JSON.parse(LS.getItem('vaultnotes.quote') || 'null');
  if (!q || q.d !== d) {
    try {
      const j = await (await fetch('https://dummyjson.com/quotes/random')).json();
      if (!j.quote) throw 0;
      q = { d, t: j.quote, a: j.author };
    } catch { const f = FALLBACK[new Date().getDate() % 3]; q = { d, t: f[0], a: f[1] }; }
    LS.setItem('vaultnotes.quote', JSON.stringify(q));
  }
  $('qt').textContent = '“' + q.t + '”'; $('qa').textContent = q.a;
}

/* ---------- backup ---------- */
$('exp').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([LS.getItem(KEY)], { type: 'application/json' }));
  a.download = 'vaultnotes-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
};
$('imp').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j.salt || !j.iv || !j.data) throw 0;
    if (load() && !confirm('This replaces the vault stored on this device. Continue?')) { e.target.value = ''; return; }
    LS.setItem(KEY, JSON.stringify({ salt: j.salt, iv: j.iv, data: j.data }));
    pending = false; await lock(); err('Backup restored. Unlock with that vault\'s password.');
  } catch { alert('That file is not a valid VaultNotes backup.'); }
  e.target.value = '';
};
$('wipe').onclick = async () => {
  if (!confirm('Erase the vault and all notes on this device? Export a backup first if you need one.')) return;
  pending = false; LS.removeItem(KEY); await lock();
};

initLock();
