'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = (process.env.ADMIN_USER || 'edo').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(__dirname, 'seed.json');
const SESSION_HOURS = 12;
const COOKIE = 'maia_session';

// El secreto de sesión se deriva de la contraseña (o de SESSION_SECRET si existe),
// así las sesiones sobreviven a reinicios sin guardar secretos en disco.
const SECRET = crypto
  .createHash('sha256')
  .update('maia-dashboard:' + (process.env.SESSION_SECRET || ADMIN_PASSWORD))
  .digest();

const COLLECTIONS = ['posts', 'marcas', 'movimientos', 'tareas', 'metricas', 'recursos'];

// ---------- datos ----------
let db;
function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } else {
    db = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    saveDb();
  }
  for (const c of COLLECTIONS) if (!Array.isArray(db[c])) db[c] = [];
  if (!db.config || typeof db.config !== 'object') db.config = {};
}
function saveDb() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
loadDb();

// ---------- auth ----------
function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}
function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({ u: user, e: Date.now() + SESSION_HOURS * 3600e3 })).toString('base64url');
  return payload + '.' + sign(payload);
}
function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.e < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Límite simple de intentos de login por IP
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  attempts.set(ip, list);
  return list.length >= 8;
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/auth/status', (req, res) => {
  const s = readToken(parseCookies(req)[COOKIE]);
  res.json({ configured: Boolean(ADMIN_PASSWORD), loggedIn: Boolean(s), user: s ? s.u : null });
});

app.post('/api/auth/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Falta configurar ADMIN_PASSWORD en el servidor.' });
  const ip = req.ip;
  if (tooMany(ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  const { user, password } = req.body || {};
  const ok = safeEqual((user || '').trim().toLowerCase(), ADMIN_USER.toLowerCase()) && safeEqual(password || '', ADMIN_PASSWORD);
  if (!ok) {
    attempts.get(ip).push(Date.now());
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  attempts.delete(ip);
  res.cookie(COOKIE, makeToken(ADMIN_USER), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SESSION_HOURS * 3600e3,
    path: '/',
  });
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

// Todo lo de /api (salvo auth) requiere sesión y el header anti-CSRF
function requireAuth(req, res, next) {
  const s = readToken(parseCookies(req)[COOKIE]);
  if (!s) return res.status(401).json({ error: 'No autenticado' });
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'maia') return res.status(403).json({ error: 'Solicitud no permitida' });
  req.user = s.u;
  next();
}

app.get('/api/data', requireAuth, (req, res) => res.json(db));

app.put('/api/config', requireAuth, (req, res) => {
  const body = req.body || {};
  db.config = { ...db.config, ...body, actualizado: new Date().toISOString() };
  saveDb();
  res.json(db.config);
});

function checkCol(req, res) {
  if (!COLLECTIONS.includes(req.params.col)) {
    res.status(404).json({ error: 'Colección desconocida' });
    return false;
  }
  return true;
}
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (k === 'id' || k.startsWith('_')) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 5000);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
  }
  return out;
}

app.post('/api/:col', requireAuth, (req, res) => {
  if (!checkCol(req, res)) return;
  const item = { id: crypto.randomUUID(), ...clean(req.body), creado: new Date().toISOString() };
  db[req.params.col].push(item);
  saveDb();
  res.status(201).json(item);
});

app.put('/api/:col/:id', requireAuth, (req, res) => {
  if (!checkCol(req, res)) return;
  const list = db[req.params.col];
  const i = list.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'No encontrado' });
  list[i] = { ...list[i], ...clean(req.body), actualizado: new Date().toISOString() };
  saveDb();
  res.json(list[i]);
});

app.delete('/api/:col/:id', requireAuth, (req, res) => {
  if (!checkCol(req, res)) return;
  const before = db[req.params.col].length;
  db[req.params.col] = db[req.params.col].filter((x) => x.id !== req.params.id);
  if (db[req.params.col].length === before) return res.status(404).json({ error: 'No encontrado' });
  saveDb();
  res.json({ ok: true });
});

app.get('/api/export', requireAuth, (req, res) => {
  const fecha = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="maia-dashboard-${fecha}.json"`);
  res.json(db);
});

app.post('/api/import', requireAuth, (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object' || !COLLECTIONS.every((c) => Array.isArray(data[c]))) {
    return res.status(400).json({ error: 'Archivo no válido: debe ser una exportación de este panel.' });
  }
  db = { config: data.config || {}, ...Object.fromEntries(COLLECTIONS.map((c) => [c, data[c]])) };
  saveDb();
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Panel Maia escuchando en :${PORT}`);
  if (!ADMIN_PASSWORD) console.warn('ADVERTENCIA: ADMIN_PASSWORD no está configurada; el login está deshabilitado.');
});
