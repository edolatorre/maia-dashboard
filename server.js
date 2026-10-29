'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const createSecrets = require('./lib/secrets');
const meta = require('./lib/meta');
const ai = require('./lib/ai');
const views = require('./lib/views');
const createMedia = require('./lib/media');
const publish = require('./lib/publish');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = (process.env.ADMIN_USER || 'edo').trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(__dirname, 'seed.json');
const SESSION_HOURS = 12;
const COOKIE = 'maia_session';
const SYNC_HOURS = 6;

const SECRET = crypto
  .createHash('sha256')
  .update('maia-dashboard:' + (process.env.SESSION_SECRET || ADMIN_PASSWORD))
  .digest();

const COLLECTIONS = ['posts', 'marcas', 'movimientos', 'tareas', 'metricas', 'recursos', 'ideas'];

// ---------- datos ----------
let db;
function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Migración: agrega colecciones y ajustes nuevos sin tocar lo existente
    for (const [k, v] of Object.entries(seed)) if (db[k] === undefined) db[k] = v;
    db.config = db.config || {};
    for (const [k, v] of Object.entries(seed.config)) if (db.config[k] === undefined) db.config[k] = v;
  } else {
    db = seed;
  }
  for (const c of COLLECTIONS) if (!Array.isArray(db[c])) db[c] = [];
  saveDb();
}
function saveDb() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
loadDb();
const secrets = createSecrets(DATA_DIR);
const media = createMedia(DATA_DIR);

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
function session(req) {
  return readToken(parseCookies(req)[COOKIE]);
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
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
app.use(express.json({ limit: '3mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/auth/status', (req, res) => {
  const s = session(req);
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
  res.cookie(COOKIE, makeToken(ADMIN_USER), { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_HOURS * 3600e3, path: '/' });
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  const s = session(req);
  if (!s) return res.status(401).json({ error: 'No autenticado' });
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'maia') return res.status(403).json({ error: 'Solicitud no permitida' });
  req.user = s.u;
  next();
}
function requireAuthPage(req, res, next) {
  if (!session(req)) return res.redirect('/');
  next();
}

// ---------- integraciones ----------
let syncState = { running: false, last: null, error: null };

function integrationsStatus() {
  return {
    meta: {
      configured: secrets.has('meta_token'),
      hint: secrets.hint('meta_token'),
      last_sync: db.meta?.fecha || null,
      running: syncState.running,
      error: syncState.error,
      avisos: db.meta?.avisos || [],
    },
    anthropic: {
      configured: secrets.has('anthropic_key'),
      hint: secrets.hint('anthropic_key'),
      model: db.config.ai_model || 'claude-sonnet-5-5',
    },
  };
}

async function runSync() {
  if (syncState.running || !secrets.has('meta_token')) return;
  syncState.running = true;
  try {
    await meta.sync({ db, secrets, save: saveDb });
    syncState.error = null;
  } catch (e) {
    syncState.error = e.message;
    console.error('[meta] error:', e.message);
  } finally {
    syncState.running = false;
    syncState.last = new Date().toISOString();
  }
}
setTimeout(runSync, 15000);
setInterval(runSync, SYNC_HOURS * 3600e3);

app.get('/api/integrations', requireAuth, (req, res) => res.json(integrationsStatus()));

app.put('/api/integrations', requireAuth, (req, res) => {
  const b = req.body || {};
  if (typeof b.meta_token === 'string') secrets.set('meta_token', b.meta_token);
  if (typeof b.anthropic_key === 'string') secrets.set('anthropic_key', b.anthropic_key);
  if (typeof b.ai_model === 'string' && b.ai_model.trim()) {
    db.config.ai_model = b.ai_model.trim();
    saveDb();
  }
  if (b.meta_token) runSync();
  res.json(integrationsStatus());
});

app.post('/api/integrations/meta/sync', requireAuth, async (req, res) => {
  if (!secrets.has('meta_token')) return res.status(400).json({ error: 'Primero guarda el token de Meta.' });
  await runSync();
  if (syncState.error) return res.status(502).json({ error: syncState.error, ...integrationsStatus() });
  res.json(integrationsStatus());
});

// ---------- IA ----------
function aiOpts() {
  return { key: secrets.get('anthropic_key'), model: db.config.ai_model || 'claude-sonnet-5-5' };
}
app.post('/api/ai/guion', requireAuth, async (req, res) => {
  try {
    const { titulo, formato, notas, marca } = req.body || {};
    if (!titulo) return res.status(400).json({ error: 'Escribe al menos el título o tema.' });
    res.json(await ai.guion({ ...aiOpts(), titulo, formato, notas, marca }));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.post('/api/ai/ideas', requireAuth, async (req, res) => {
  try {
    const list = await ai.ideas({ ...aiOpts(), cantidad: 10, categoria: req.body?.categoria, existentes: db.ideas.map((i) => i.titulo) });
    const nuevas = list.map((i) => ({ id: crypto.randomUUID(), titulo: String(i.titulo || '').slice(0, 200), categoria: i.categoria || 'Outdoor', formato: i.formato || 'Reel', notas: String(i.notas || '').slice(0, 500), estado: 'Nueva', origen: 'IA', creado: new Date().toISOString() }));
    db.ideas.push(...nuevas);
    saveDb();
    res.json({ nuevas });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.post('/api/ai/pitch/:id', requireAuth, async (req, res) => {
  const marca = db.marcas.find((m) => m.id === req.params.id);
  if (!marca) return res.status(404).json({ error: 'Marca no encontrada' });
  const st = views.stats(db);
  const statsTxt = `${st.seguidores} seguidores en Instagram${st.alcance ? `, alcance de ${st.alcance} cuentas en 7 días` : ''}${st.engagement ? `, engagement ${st.engagement}%` : ''}`;
  const tarifas = (db.config.mediakit?.tarifas || []).map((t) => `${t.nombre}: ${t.precio}`).join('; ');
  try {
    if (!secrets.has('anthropic_key')) return res.json({ ...views.pitchTemplate(marca, db), plantilla: true });
    res.json(await ai.pitch({ ...aiOpts(), marca, stats: statsTxt, tarifas }));
  } catch (e) {
    res.json({ ...views.pitchTemplate(marca, db), plantilla: true, aviso: e.message });
  }
});

// ---------- actualización desde GitHub ----------
function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: __dirname, timeout: 60000 }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout.trim())));
  });
}
app.get('/api/version', requireAuth, async (req, res) => {
  try {
    res.json({ commit: await git(['rev-parse', '--short', 'HEAD']), fecha: await git(['log', '-1', '--format=%ci']) });
  } catch {
    res.json({ commit: 'desconocido' });
  }
});
app.post('/api/admin/update', requireAuth, async (req, res) => {
  try {
    const before = await git(['rev-parse', 'HEAD']);
    await git(['pull', '--ff-only', '-q']);
    const after = await git(['rev-parse', 'HEAD']);
    if (before === after) return res.json({ updated: false, message: 'Ya estás en la última versión.' });
    await new Promise((resolve, reject) => execFile('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: __dirname, timeout: 180000 }, (e) => (e ? reject(e) : resolve())));
    res.json({ updated: true, message: 'Actualizado. El panel se reinicia en unos segundos.' });
    setTimeout(() => process.exit(0), 800); // systemd lo vuelve a levantar
  } catch (e) {
    res.status(500).json({ error: 'No se pudo actualizar: ' + e.message });
  }
});


// ---------- archivos y publicación ----------
const PUBLIC_URL = () => (process.env.PUBLIC_URL || db.config.public_url || 'https://panel.maiacruz.cl').replace(/\/$/, '');

app.get('/m/:nombre', (req, res) => {
  const p = media.filePath(req.params.nombre);
  if (!p) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(p);
});

app.put('/api/upload', requireAuth, async (req, res) => {
  try {
    res.json(await media.fromRequest(req, req.query.name));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/api/upload-url', requireAuth, async (req, res) => {
  try {
    res.json(await media.fromUrl(req.body?.url));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function chileNow() {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  return f.format(new Date()).replace(',', ''); // "YYYY-MM-DD HH:mm"
}
function archivos(post) {
  return String(post.archivos || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [nombre, tipo] = x.split(':');
    return { nombre, tipo: tipo || (/\.(mp4|mov)$/i.test(nombre) ? 'video' : 'imagen'), url: `${PUBLIC_URL()}/m/${nombre}` };
  });
}
// ---------- aprobación de marcas ----------
function contentHash(post) {
  return crypto.createHash('sha256').update(String(post.archivos || '') + '|' + String(post.texto || '')).digest('hex').slice(0, 16);
}
function requiereAprobacion(post) {
  return Boolean((post.marca || '').trim()) && post.requiere_aprobacion !== false;
}
function estaAprobado(post) {
  return post.aprobacion_estado === 'Aprobado' && post.aprobacion_hash === contentHash(post);
}
function estadoAprobacion(post) {
  if (!requiereAprobacion(post)) return 'No requiere';
  if (post.aprobacion_estado === 'Aprobado' && post.aprobacion_hash !== contentHash(post)) return 'Cambió después de aprobar';
  return post.aprobacion_estado || 'Sin enviar';
}

const publishing = new Set();
async function publishPost(post) {
  if (publishing.has(post.id)) return;
  if (requiereAprobacion(post) && !estaAprobado(post)) {
    throw new Error(`Falta la aprobación de ${post.marca} (estado: ${estadoAprobacion(post)}). Envíale el link de aprobación desde la publicación.`);
  }
  const token = secrets.get('meta_token');
  if (!token) throw new Error('Falta el token de Meta.');
  const items = archivos(post);
  if (!items.length) throw new Error('La publicación no tiene archivos adjuntos.');
  for (const it of items) if (!media.filePath(it.nombre)) throw new Error('No encuentro el archivo ' + it.nombre + '. Vuelve a subirlo.');
  const caption = String(post.texto || '').slice(0, 2200);
  const cfg = db.config.meta || {};
  const igId = db.meta?.ig_user_id || cfg.ig_user_id || '17841436248985036';
  const pageId = db.meta?.page_id || cfg.page_id || '1393448887191181';
  publishing.add(post.id);
  const set = (patch) => { Object.assign(post, patch, { actualizado: new Date().toISOString() }); saveDb(); };
  set({ pub_estado: 'Publicando', pub_error: '' });
  const errores = [];
  try {
    if (post.pub_ig !== false && !post.publicado_ig_id) {
      try {
        const r = await publish.instagram({ igId, token, items, caption });
        set({ publicado_ig_id: r.id, link: r.link || post.link });
      } catch (e) { errores.push('Instagram: ' + e.message); }
    }
    if (post.pub_fb && !post.publicado_fb_id) {
      try {
        const r = await publish.facebook({ pageId, token, items, caption });
        set({ publicado_fb_id: r.id, link_fb: r.link });
      } catch (e) { errores.push('Facebook: ' + e.message); }
    }
  } finally {
    publishing.delete(post.id);
  }
  if (errores.length) set({ pub_estado: 'Error', pub_error: errores.join(' · ') });
  else set({ pub_estado: 'Publicado', estado: 'Publicado', publicado_en: new Date().toISOString() });
  console.log(`[publicar] ${post.titulo}: ${errores.length ? errores.join(' | ') : 'ok'}`);
}

app.post('/api/posts/:id/aprobacion-vista', requireAuth, (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (post) { post.aprobacion_nueva = false; saveDb(); }
  res.json({ ok: true });
});

app.post('/api/posts/:id/publicar', requireAuth, (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'No encontrado' });
  if (!secrets.has('meta_token')) return res.status(400).json({ error: 'Primero conecta Meta en Ajustes.' });
  if (!archivos(post).length) return res.status(400).json({ error: 'Adjunta al menos un video o foto.' });
  if (requiereAprobacion(post) && !estaAprobado(post)) return res.status(409).json({ error: `Falta la aprobación de ${post.marca} (${estadoAprobacion(post)}). Envíale el link de aprobación primero.` });
  publishPost(post).catch((e) => { post.pub_estado = 'Error'; post.pub_error = e.message; saveDb(); });
  res.status(202).json({ ok: true, message: 'Publicando… esto puede tardar 1–3 minutos.' });
});


// Generar / renovar el link de aprobación
app.post('/api/posts/:id/aprobacion', requireAuth, (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'No encontrado' });
  if (!archivos(post).length) return res.status(400).json({ error: 'Adjunta el video o las fotos antes de pedir aprobación.' });
  post.aprobacion_token = crypto.randomBytes(18).toString('base64url');
  post.aprobacion_vence = new Date(Date.now() + 30 * 864e5).toISOString();
  post.aprobacion_estado = 'Pendiente';
  post.aprobacion_hash = '';
  post.aprobacion_enviada = new Date().toISOString();
  saveDb();
  res.json({ url: `${PUBLIC_URL()}/aprobar/${post.aprobacion_token}`, vence: post.aprobacion_vence });
});

function postPorToken(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token || '')) return null;
  const p = db.posts.find((x) => x.aprobacion_token && x.aprobacion_token === token);
  if (!p || (p.aprobacion_vence && p.aprobacion_vence < new Date().toISOString())) return null;
  return p;
}
const respuestas = new Map();
app.get('/aprobar/:token', (req, res) => {
  const p = postPorToken(req.params.token);
  if (!p) return res.status(404).send(views.notFound());
  res.setHeader('Cache-Control', 'no-store');
  res.send(views.aprobacion(db, p, archivos(p), { cambiado: p.aprobacion_estado === 'Aprobado' && p.aprobacion_hash !== contentHash(p) }));
});
app.post('/aprobar/:token', express.urlencoded({ extended: false, limit: '20kb' }), (req, res) => {
  const p = postPorToken(req.params.token);
  if (!p) return res.status(404).send(views.notFound());
  const k = req.ip + p.id;
  const list = (respuestas.get(k) || []).filter((t) => Date.now() - t < 3600e3);
  if (list.length >= 10) return res.status(429).send(views.notFound());
  list.push(Date.now()); respuestas.set(k, list);
  const accion = req.body?.accion === 'aprobar' ? 'Aprobado' : 'Cambios pedidos';
  const nombre = String(req.body?.nombre || '').trim().slice(0, 80) || 'Sin nombre';
  const comentario = String(req.body?.comentario || '').trim().slice(0, 2000);
  if (accion === 'Cambios pedidos' && !comentario) return res.redirect(303, `/aprobar/${req.params.token}?falta=1`);
  p.aprobacion_estado = accion;
  p.aprobacion_hash = accion === 'Aprobado' ? contentHash(p) : '';
  p.aprobado_por = nombre;
  p.aprobado_en = new Date().toISOString();
  const linea = `${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })} · ${nombre}: ${accion}${comentario ? ' — ' + comentario : ''}`;
  p.aprobacion_historial = [linea, ...String(p.aprobacion_historial || '').split('\n').filter(Boolean)].slice(0, 30).join('\n');
  p.aprobacion_nueva = true;
  saveDb();
  console.log(`[aprobacion] ${p.titulo}: ${accion} por ${nombre}`);
  res.redirect(303, `/aprobar/${req.params.token}?ok=1`);
});

// Programador: revisa cada minuto las publicaciones marcadas para publicar solas
setInterval(() => {
  if (!secrets.has('meta_token')) return;
  const ahora = chileNow();
  for (const p of db.posts) {
    if (!p.auto_publicar || p.pub_estado === 'Publicado' || p.pub_estado === 'Publicando' || p.pub_estado === 'Error') continue;
    if (!p.fecha || !p.hora) continue;
    if (requiereAprobacion(p) && !estaAprobado(p)) continue; // espera aprobación de la marca (alerta en el Resumen)
    if (`${p.fecha} ${p.hora}` <= ahora) publishPost(p).catch((e) => { p.pub_estado = 'Error'; p.pub_error = e.message; saveDb(); });
  }
}, 60000);

// ---------- datos ----------
app.get('/api/data', requireAuth, (req, res) => res.json({ ...db, posts: db.posts.map((p) => ({ ...p, aprobacion_vista: estadoAprobacion(p) })) }));

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
    if (typeof v === 'string') out[k] = v.slice(0, 8000);
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
  if (!data || typeof data !== 'object' || !['posts', 'marcas', 'tareas'].every((c) => Array.isArray(data[c]))) {
    return res.status(400).json({ error: 'Archivo no válido: debe ser una exportación de este panel.' });
  }
  db = { ...data, config: data.config || {} };
  for (const c of COLLECTIONS) if (!Array.isArray(db[c])) db[c] = [];
  saveDb();
  res.json({ ok: true });
});

// ---------- páginas ----------
// Media kit público (se puede ocultar desde Ajustes). Con sesión siempre se ve, como vista previa.
app.get('/mediakit', (req, res) => {
  const logged = Boolean(session(req));
  if (!db.config.mediakit?.publico && !logged) return res.status(404).send(views.notFound());
  res.send(views.mediakit(db, { preview: !db.config.mediakit?.publico }));
});
app.get('/reporte/:id', requireAuthPage, (req, res) => {
  const marca = db.marcas.find((m) => m.id === req.params.id);
  if (!marca) return res.status(404).send(views.notFound());
  res.send(views.reporte(db, marca));
});
app.get('/propuesta/:id', requireAuthPage, (req, res) => {
  const marca = db.marcas.find((m) => m.id === req.params.id);
  if (!marca) return res.status(404).send(views.notFound());
  res.send(views.propuesta(db, marca, req.query));
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Panel Maia escuchando en :${PORT}`);
  if (!ADMIN_PASSWORD) console.warn('ADVERTENCIA: ADMIN_PASSWORD no está configurada; el login está deshabilitado.');
});
