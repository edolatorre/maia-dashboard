'use strict';

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ESTADOS_POST = ['Idea', 'Guion', 'Producido', 'Aprobación', 'Programado', 'Publicado'];
const ESTADOS_MARCA = ['Por contactar', 'Enviado', 'Respondió', 'Negociando', 'Cerrado', 'Descartado'];
const ETAPAS = ['Presencia', 'Prueba social', 'Primera campaña'];
const fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString('es-CL');
const fmtUsd = (n) => 'US$' + (Number(n) || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });
const todayStr = () => { const d = new Date(); return ymd(d); };
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'maia' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401) { showLogin(); throw new Error('No autenticado'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

// ---------- estado ----------
let DB = null;
let view = 'resumen';
let calMonth = null; // 'YYYY-MM'
let budgetMonth = null;

async function reload() {
  DB = await api('/api/data');
  render();
}

// ---------- login ----------
function showLogin(msg) {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
  if (msg) $('#login-msg').textContent = msg;
}
async function boot() {
  const st = await fetch('/api/auth/status').then((r) => r.json());
  if (!st.configured) {
    showLogin('Falta configurar la contraseña: agrega la variable ADMIN_PASSWORD en Render (Environment) y vuelve a cargar.');
    $('#login-form button').disabled = true;
    return;
  }
  if (!st.loggedIn) return showLogin();
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await reload();
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#login-error').textContent = '';
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: f.get('user'), password: f.get('password') }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    e.target.reset();
    boot();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});
$('#btn-logout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  showLogin('Sesión cerrada.');
});
$('#btn-export').addEventListener('click', () => { window.location.href = '/api/export'; });
$('#file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Esto reemplaza todos los datos actuales por los del archivo. ¿Continuar?')) { e.target.value = ''; return; }
  try {
    await api('/api/import', { method: 'POST', body: JSON.parse(await file.text()) });
    toast('Datos importados');
    reload();
  } catch (err) { alert(err.message); }
  e.target.value = '';
});

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  view = b.dataset.view;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
  render();
  window.scrollTo(0, 0);
});

// ---------- modal genérico ----------
let modalHandler = null;
function modalGet(name) {
  const el = $(`#modal-fields [name="${name}"]`);
  return el ? el.value : '';
}
function modalSet(name, value) {
  const el = $(`#modal-fields [name="${name}"]`);
  if (el && value != null) el.value = value;
}
function openModal({ title, fields, values = {}, onSave, onDelete, extra = [] }) {
  const ex = $('#modal-extra');
  ex.innerHTML = '';
  extra.forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small ' + (b.cls || 'ghost');
    btn.textContent = b.label;
    btn.onclick = async () => {
      const old = btn.textContent;
      btn.disabled = true;
      if (b.busy) btn.textContent = b.busy;
      try { await b.onClick({ get: modalGet, set: modalSet }); } catch (err) { alert(err.message); }
      btn.disabled = false;
      btn.textContent = old;
    };
    ex.appendChild(btn);
  });
  $('#modal-title').textContent = title;
  $('#modal-fields').innerHTML = fields.map((f) => {
    const v = values[f.name] ?? f.default ?? '';
    const cls = f.full ? 'full' : '';
    if (f.type === 'select') {
      return `<label class="${cls}">${esc(f.label)}<select name="${f.name}">${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    }
    if (f.type === 'textarea') return `<label class="${cls}">${esc(f.label)}<textarea name="${f.name}">${esc(v)}</textarea></label>`;
    if (f.type === 'checkbox') return `<label class="${cls}" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}>${esc(f.label)}</label>`;
    return `<label class="${cls}">${esc(f.label)}<input name="${f.name}" type="${f.type || 'text'}" ${f.step ? `step="${f.step}"` : ''} value="${esc(v)}" ${f.required ? 'required' : ''}></label>`;
  }).join('');
  $('#modal-delete').classList.toggle('hidden', !onDelete);
  $('#modal-delete').onclick = async () => {
    if (!confirm('¿Eliminar este registro?')) return;
    await onDelete();
    $('#modal').close();
  };
  modalHandler = async () => {
    const out = {};
    fields.forEach((f) => {
      const el = $(`#modal-fields [name="${f.name}"]`);
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
      else out[f.name] = el.value.trim();
    });
    await onSave(out);
  };
  if (!$('#modal').open) $('#modal').showModal();
}
$('#modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await modalHandler(); $('#modal').close(); toast('Guardado'); } catch (err) { alert(err.message); }
});
$('#modal-cancel').addEventListener('click', () => $('#modal').close());

async function saveItem(col, id, data) {
  if (id) await api(`/api/${col}/${id}`, { method: 'PUT', body: data });
  else await api(`/api/${col}`, { method: 'POST', body: data });
  await reload();
}
async function deleteItem(col, id) {
  await api(`/api/${col}/${id}`, { method: 'DELETE' });
  toast('Eliminado');
  await reload();
}

// ---------- formularios ----------
const POST_FIELDS = [
  { name: 'titulo', label: 'Título', full: true, required: true },
  { name: 'fecha', label: 'Fecha', type: 'date' },
  { name: 'hora', label: 'Hora', type: 'time' },
  { name: 'formato', label: 'Formato', type: 'select', options: ['Reel', 'Carrusel', 'Foto', 'Story', 'Live'] },
  { name: 'estado', label: 'Estado', type: 'select', options: ESTADOS_POST },
  { name: 'plataformas', label: 'Plataformas', default: 'FB + IG' },
  { name: 'higgsfield', label: 'ID Higgsfield' },
  { name: 'guion', label: 'Guion (lo que dice Maia)', type: 'textarea', full: true },
  { name: 'escena', label: 'Escena para Higgsfield', type: 'textarea', full: true },
  { name: 'texto', label: 'Texto del post', type: 'textarea', full: true },
  { name: 'link', label: 'Link publicado', full: true },
  { name: 'notas', label: 'Notas', type: 'textarea', full: true },
];
function editPost(p = {}) {
  openModal({
    title: p.id ? 'Editar publicación' : 'Nueva publicación',
    fields: POST_FIELDS, values: p,
    onSave: (d) => saveItem('posts', p.id, d),
    onDelete: p.id ? () => deleteItem('posts', p.id) : null,
    extra: [{
      label: '✨ Generar con IA', busy: 'Escribiendo…', cls: 'ai',
      onClick: async ({ get, set }) => {
        const titulo = get('titulo');
        if (!titulo) throw new Error('Escribe primero el título o tema.');
        const r = await api('/api/ai/guion', { method: 'POST', body: { titulo, formato: get('formato'), notas: get('notas') } });
        set('guion', r.guion); set('escena', r.escena); set('texto', r.texto);
        toast('Listo: revisa y guarda');
      },
    }],
  });
}

function copiar(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copiado'));
}
async function abrirPitch(m) {
  const r = await api(`/api/ai/pitch/${m.id}`, { method: 'POST' });
  openModal({
    title: 'Correo para ' + m.nombre,
    fields: [
      { name: 'asunto', label: 'Asunto', full: true },
      { name: 'cuerpo', label: r.plantilla ? 'Cuerpo (plantilla; con la API key de Anthropic se personaliza con IA)' : 'Cuerpo (redactado con IA)', type: 'textarea', full: true },
    ],
    values: r,
    onSave: async (d) => {
      await saveItem('marcas', m.id, { estado: m.estado === 'Por contactar' ? 'Enviado' : m.estado, seguimiento: addDays(todayStr(), 5), ultimo_pitch: d.asunto });
    },
    extra: [
      { label: 'Copiar texto', onClick: ({ get }) => copiar(get('asunto') + '\n\n' + get('cuerpo')) },
      { label: 'Abrir en correo', onClick: ({ get }) => { window.location.href = `mailto:?subject=${encodeURIComponent(get('asunto'))}&body=${encodeURIComponent(get('cuerpo'))}`; } },
    ],
  });
  const ta = $('#modal-fields [name="cuerpo"]');
  if (ta) ta.style.minHeight = '260px';
  if (r.aviso) toast('Usé la plantilla: ' + r.aviso);
}
function abrirPropuesta(m) {
  const tarifas = DB.config.mediakit?.tarifas || [];
  openModal({
    title: 'Propuesta para ' + m.nombre,
    fields: [
      ...tarifas.map((t, i) => ({ name: 't' + i, label: `${t.nombre} · ${t.precio}`, type: 'checkbox', full: true, default: i === 0 })),
      { name: 'monto', label: 'Total propuesto (opcional, ej. US$250)', full: true },
    ],
    values: { monto: m.monto },
    onSave: async (d) => {
      const sel = tarifas.map((_, i) => (d['t' + i] ? i : null)).filter((x) => x !== null);
      if (d.monto !== (m.monto || '')) await saveItem('marcas', m.id, { monto: d.monto });
      window.open(`/propuesta/${encodeURIComponent(m.id)}?paquetes=${sel.join(',')}`, '_blank');
    },
  });
}
const MARCA_FIELDS = [
  { name: 'nombre', label: 'Marca', required: true },
  { name: 'categoria', label: 'Categoría', type: 'select', options: ['Hotel', 'Surf', 'Outdoor', 'Snacks', 'Bebidas', 'Restaurante', 'Otro'] },
  { name: 'estado', label: 'Estado', type: 'select', options: ESTADOS_MARCA },
  { name: 'prioridad', label: 'Prioridad', type: 'select', options: ['1', '2', '3'] },
  { name: 'contacto', label: 'Contacto (correo, IG, persona)', full: true },
  { name: 'idea', label: 'Idea de colaboración', full: true },
  { name: 'monto', label: 'Monto o canje' },
  { name: 'seguimiento', label: 'Próximo seguimiento', type: 'date' },
  { name: 'notas', label: 'Notas', type: 'textarea', full: true },
];
function editMarca(m = {}) {
  openModal({
    title: m.id ? m.nombre : 'Nueva marca',
    fields: MARCA_FIELDS, values: m,
    onSave: (d) => saveItem('marcas', m.id, d),
    onDelete: m.id ? () => deleteItem('marcas', m.id) : null,
    extra: m.id ? [
      { label: '✉️ Correo de pitch', busy: 'Redactando…', cls: 'ai', onClick: () => abrirPitch(m) },
      { label: '📄 Propuesta PDF', onClick: () => abrirPropuesta(m) },
    ] : [],
  });
}
function categorias() { return (DB.config.presupuesto || []).map((c) => c.categoria).concat(['Colaboración', 'Otro ingreso']); }
function editMov(m = {}) {
  openModal({
    title: m.id ? 'Editar movimiento' : 'Nuevo gasto o ingreso',
    fields: [
      { name: 'tipo', label: 'Tipo', type: 'select', options: ['Gasto', 'Ingreso'] },
      { name: 'fecha', label: 'Fecha', type: 'date', default: todayStr() },
      { name: 'categoria', label: 'Categoría', type: 'select', options: categorias() },
      { name: 'moneda', label: 'Moneda', type: 'select', options: ['USD', 'CLP'] },
      { name: 'monto', label: 'Monto', type: 'number', step: 'any', required: true },
      { name: 'descripcion', label: 'Descripción' },
    ],
    values: m,
    onSave: (d) => saveItem('movimientos', m.id, d),
    onDelete: m.id ? () => deleteItem('movimientos', m.id) : null,
  });
}
function editTarea(t = {}) {
  openModal({
    title: t.id ? 'Editar tarea' : 'Nueva tarea',
    fields: [
      { name: 'titulo', label: 'Tarea', full: true, required: true },
      { name: 'etapa', label: 'Etapa', type: 'select', options: ETAPAS },
      { name: 'fecha', label: 'Fecha límite', type: 'date' },
      { name: 'hecha', label: 'Hecha', type: 'checkbox' },
    ],
    values: t,
    onSave: (d) => saveItem('tareas', t.id, d),
    onDelete: t.id ? () => deleteItem('tareas', t.id) : null,
  });
}
function editRecurso(r = {}) {
  openModal({
    title: r.id ? 'Editar recurso' : 'Nuevo recurso',
    fields: [
      { name: 'nombre', label: 'Nombre', full: true, required: true },
      { name: 'valor', label: 'Valor (link, ID, texto)', type: 'textarea', full: true },
    ],
    values: r,
    onSave: (d) => saveItem('recursos', r.id, d),
    onDelete: r.id ? () => deleteItem('recursos', r.id) : null,
  });
}
function editMetrica(m = {}) {
  openModal({
    title: m.id ? 'Editar registro' : 'Registrar métricas',
    fields: [
      { name: 'fecha', label: 'Fecha', type: 'date', default: todayStr(), required: true },
      { name: 'seguidores', label: 'Seguidores IG', type: 'number', required: true },
      { name: 'alcance', label: 'Alcance 7 días', type: 'number' },
      { name: 'interacciones', label: 'Interacciones 7 días', type: 'number' },
      { name: 'notas', label: 'Notas', full: true },
    ],
    values: m,
    onSave: async (d) => {
      await saveItem('metricas', m.id, d);
      const last = [...DB.metricas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
      if (last) await api('/api/config', { method: 'PUT', body: { seguidores: last.seguidores } });
      await reload();
    },
    onDelete: m.id ? () => deleteItem('metricas', m.id) : null,
  });
}
function editConfig() {
  const c = DB.config;
  openModal({
    title: 'Ajustes generales',
    fields: [
      { name: 'creditos_higgsfield', label: 'Créditos Higgsfield actuales', type: 'number' },
      { name: 'creditos_por_reel', label: 'Créditos por reel (aprox.)', type: 'number' },
      { name: 'presupuesto_mensual_usd', label: 'Presupuesto mensual (US$)', type: 'number' },
      { name: 'tipo_cambio_clp', label: 'Tipo de cambio (CLP por US$)', type: 'number' },
      { name: 'inicio_plan', label: 'Inicio del plan de 90 días', type: 'date' },
    ],
    values: c,
    onSave: async (d) => { await api('/api/config', { method: 'PUT', body: d }); await reload(); },
  });
}
function editPresupuesto() {
  const p = DB.config.presupuesto || [];
  openModal({
    title: 'Presupuesto mensual por categoría (US$)',
    fields: p.map((c, i) => ({ name: 'c' + i, label: c.categoria, type: 'number' })),
    values: Object.fromEntries(p.map((c, i) => ['c' + i, c.usd])),
    onSave: async (d) => {
      const presupuesto = p.map((c, i) => ({ categoria: c.categoria, usd: Number(d['c' + i]) || 0 }));
      await api('/api/config', { method: 'PUT', body: { presupuesto, presupuesto_mensual_usd: presupuesto.reduce((s, c) => s + c.usd, 0) } });
      await reload();
    },
  });
}

// ---------- cálculos ----------
function toUsd(m) { return m.moneda === 'CLP' ? (Number(m.monto) || 0) / (Number(DB.config.tipo_cambio_clp) || 950) : Number(m.monto) || 0; }
function monthKey(s) { return (s || '').slice(0, 7); }
function diaPlan() {
  const ini = DB.config.inicio_plan;
  if (!ini) return null;
  return Math.floor((parseYmd(todayStr()) - parseYmd(ini)) / 864e5) + 1;
}
function metaActual() {
  const d = diaPlan() || 1;
  return (DB.config.metas || []).find((m) => d <= m.dia) || (DB.config.metas || []).slice(-1)[0];
}
function pendientesProduccion() { return DB.posts.filter((p) => ['Idea', 'Guion'].includes(p.estado)); }
function alertas() {
  const out = [];
  const hoy = todayStr();
  const pend = pendientesProduccion().filter((p) => p.formato === 'Reel');
  const necesita = pend.length * (Number(DB.config.creditos_por_reel) || 75);
  if (pend.length && (Number(DB.config.creditos_higgsfield) || 0) < necesita) {
    out.push({ bad: true, t: `Créditos Higgsfield insuficientes: hay ${fmtInt(DB.config.creditos_higgsfield)} y se necesitan ~${fmtInt(necesita)} para ${pend.length} reel(s) pendientes.` });
  }
  const pronto = DB.posts.filter((p) => p.fecha && p.fecha >= hoy && p.fecha <= addDays(hoy, 7) && !['Programado', 'Publicado'].includes(p.estado));
  if (pronto.length) out.push({ t: `${pronto.length} publicación(es) de los próximos 7 días aún no están programadas: ${pronto.map((p) => esc(p.titulo)).join(', ')}.` });
  const seg = DB.marcas.filter((m) => m.seguimiento && m.seguimiento <= hoy && !['Cerrado', 'Descartado'].includes(m.estado));
  if (seg.length) out.push({ t: `Toca hacer seguimiento a: ${seg.map((m) => esc(m.nombre)).join(', ')}.` });
  const venc = DB.tareas.filter((t) => !t.hecha && t.fecha && t.fecha < hoy);
  if (venc.length) out.push({ bad: true, t: `${venc.length} tarea(s) vencida(s).` });
  const libres = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(hoy, i);
    if (!DB.posts.some((p) => p.fecha === d)) libres.push(d);
  }
  if (libres.length > 9) out.push({ t: `En los próximos 14 días hay ${libres.length} días sin contenido.` });
  return out;
}

// ---------- vistas ----------
function render() {
  if (!DB) return;
  const v = $('#view');
  const fn = { resumen: vResumen, grilla: vGrilla, marcas: vMarcas, presupuesto: vPresupuesto, ideas: vIdeas, contenido: vContenido, tareas: vTareas, recursos: vRecursos, ajustes: vAjustes }[view];
  v.innerHTML = fn();
  bind(v);
  if (view === 'ajustes') loadAjustes();
}

function postRow(p) {
  const d = p.fecha ? parseYmd(p.fecha) : null;
  return `<div class="row" data-post="${p.id}">
    <div class="date">${d ? `<b>${d.getDate()}</b><small>${MESES[d.getMonth()]}</small>` : '<small>sin fecha</small>'}</div>
    <div class="main"><b>${esc(p.titulo)}</b><small>${esc(p.formato || '')} · ${esc(p.plataformas || '')}${p.hora ? ' · ' + esc(p.hora) : ''}</small></div>
    <span class="pill ${esc(p.estado)}">${esc(p.estado)}</span>
  </div>`;
}

function vResumen() {
  const c = DB.config;
  const hoy = todayStr();
  const meta = metaActual();
  const seg = Number(c.seguidores) || 0;
  const pctSeg = meta ? Math.min(100, (seg / meta.seguidores) * 100) : 0;
  const mes = monthKey(hoy);
  const gastoMes = DB.movimientos.filter((m) => m.tipo === 'Gasto' && monthKey(m.fecha) === mes).reduce((s, m) => s + toUsd(m), 0);
  const ingresoMes = DB.movimientos.filter((m) => m.tipo === 'Ingreso' && monthKey(m.fecha) === mes).reduce((s, m) => s + toUsd(m), 0);
  const pres = Number(c.presupuesto_mensual_usd) || 400;
  const pctGasto = Math.min(100, (gastoMes / pres) * 100);
  const pend = pendientesProduccion().filter((p) => p.formato === 'Reel');
  const necesita = pend.length * (Number(c.creditos_por_reel) || 75);
  const cred = Number(c.creditos_higgsfield) || 0;
  const prox = DB.posts.filter((p) => p.fecha && p.fecha >= hoy).sort((a, b) => (a.fecha + a.hora > b.fecha + b.hora ? 1 : -1)).slice(0, 7);
  const tareas = DB.tareas.filter((t) => !t.hecha).sort((a, b) => (a.fecha || '9') > (b.fecha || '9') ? 1 : -1).slice(0, 6);
  const marcasAct = DB.marcas.filter((m) => !['Cerrado', 'Descartado'].includes(m.estado));
  const cerradas = DB.marcas.filter((m) => m.estado === 'Cerrado').length;
  const al = alertas();
  const dia = diaPlan();

  return `
  <div class="section-head">
    <div><p class="eyebrow">${dia && dia > 0 ? `Día ${dia} de 90 · ${esc(meta?.etapa || '')}` : 'Plan de 90 días'}</p><h2>Resumen</h2></div>
    <button class="btn ghost small" data-act="config">Ajustes</button>
  </div>
  ${al.length ? `<div class="alerts">${al.map((a) => `<div class="alert ${a.bad ? 'bad' : ''}">${a.t}</div>`).join('')}</div>` : ''}
  <div class="grid kpis">
    <div class="card kpi"><button class="btn ghost small edit" data-act="metrica">Registrar</button><div class="label">Seguidores</div><div class="value">${fmtInt(seg)}</div>
      <div class="sub">Meta día ${meta?.dia}: ${fmtInt(meta?.seguidores)}</div><div class="bar"><span style="width:${pctSeg}%"></span></div></div>
    <div class="card kpi"><button class="btn ghost small edit" data-act="config">Editar</button><div class="label">Créditos Higgsfield</div><div class="value">${fmtInt(cred)}</div>
      <div class="sub">${pend.length ? `Necesitas ~${fmtInt(necesita)} para ${pend.length} reel(s)` : 'Sin reels pendientes'}</div>
      <div class="bar ${cred < necesita ? 'bad' : ''}"><span style="width:${necesita ? Math.min(100, (cred / necesita) * 100) : 100}%"></span></div></div>
    <div class="card kpi"><button class="btn ghost small edit" data-act="mov">+ Gasto</button><div class="label">Gasto ${MESES[new Date().getMonth()]}</div><div class="value">${fmtUsd(gastoMes)}</div>
      <div class="sub">de ${fmtUsd(pres)} · ingresos ${fmtUsd(ingresoMes)}</div><div class="bar ${pctGasto > 90 ? 'bad' : pctGasto > 70 ? 'warn' : ''}"><span style="width:${pctGasto}%"></span></div></div>
    <div class="card kpi"><div class="label">Marcas</div><div class="value">${marcasAct.length}</div>
      <div class="sub">en curso · ${cerradas} cerrada(s) · meta: 1 antes del día 60</div></div>
  </div>
  <div class="grid two">
    <div class="card"><div class="section-head"><h3>Próximas publicaciones</h3><button class="btn ghost small" data-act="post">+ Nueva</button></div>
      <div class="list">${prox.map(postRow).join('') || '<p class="empty">No hay publicaciones con fecha.</p>'}</div></div>
    <div class="card"><div class="section-head"><h3>Tareas pendientes</h3><button class="btn ghost small" data-goto="tareas">Ver todas</button></div>
      ${tareas.map(taskRow).join('') || '<p class="empty">Todo al día.</p>'}</div>
  </div>
  <div class="card"><div class="section-head"><h3>Evolución de seguidores</h3><button class="btn ghost small" data-act="metrica">+ Registro</button></div>
    ${chartSeguidores()}</div>`;
}

function chartSeguidores() {
  const pts = [...DB.metricas].filter((m) => m.fecha && m.seguidores != null).sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
  if (pts.length < 2) return `<p class="empty">Registra los seguidores cada semana (botón "+ Registro") para ver la curva. ${pts.length ? 'Llevas 1 registro.' : ''}</p>`;
  const W = 900, H = 220, P = 36;
  const xs = pts.map((p) => parseYmd(p.fecha).getTime());
  const ys = pts.map((p) => Number(p.seguidores));
  const minX = Math.min(...xs), maxX = Math.max(...xs) || minX + 1;
  const maxY = Math.max(...ys, metaActual()?.seguidores || 0) * 1.1 || 1;
  const sx = (x) => P + ((x - minX) / (maxX - minX || 1)) * (W - 2 * P);
  const sy = (y) => H - P - (y / maxY) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ');
  const meta = metaActual();
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Seguidores en el tiempo">
    ${meta ? `<line x1="${P}" x2="${W - P}" y1="${sy(meta.seguidores)}" y2="${sy(meta.seguidores)}" stroke="var(--coral)" stroke-dasharray="5 5"/><text x="${W - P}" y="${sy(meta.seguidores) - 6}" text-anchor="end" font-size="12" fill="var(--coral)">Meta ${fmtInt(meta.seguidores)}</text>` : ''}
    <line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" stroke="var(--line)"/>
    <path d="${line}" fill="none" stroke="var(--teal)" stroke-width="3" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${sx(xs[i])}" cy="${sy(ys[i])}" r="4" fill="var(--teal)"><title>${esc(p.fecha)}: ${fmtInt(ys[i])}</title></circle>`).join('')}
    <text x="${sx(xs.at(-1))}" y="${sy(ys.at(-1)) - 10}" text-anchor="end" font-size="13" font-weight="700" fill="var(--text)">${fmtInt(ys.at(-1))}</text>
    <text x="${P}" y="${H - 12}" font-size="11" fill="var(--muted)">${esc(pts[0].fecha)}</text>
    <text x="${W - P}" y="${H - 12}" font-size="11" text-anchor="end" fill="var(--muted)">${esc(pts.at(-1).fecha)}</text>
  </svg>`;
}

function vGrilla() {
  if (!calMonth) calMonth = monthKey(todayStr());
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const hoy = todayStr();
  const cells = [];
  const offset = (first.getDay() + 6) % 7;
  const total = Math.ceil((offset + new Date(y, m, 0).getDate()) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const s = ymd(d);
    const evs = DB.posts.filter((p) => p.fecha === s).sort((a, b) => ((a.hora || '') > (b.hora || '') ? 1 : -1));
    const out = d.getMonth() !== m - 1;
    const futuro = s >= hoy && s <= addDays(hoy, 21);
    cells.push(`<div class="day ${out ? 'out' : ''} ${s === hoy ? 'today' : ''} ${!evs.length && futuro && !out ? 'empty-slot' : ''}" data-day="${s}">
      <span class="n">${d.getDate()}</span>
      ${evs.map((p) => `<span class="ev ${esc(p.estado)}" data-post="${p.id}" title="${esc(p.titulo)} · ${esc(p.estado)}">${p.hora ? esc(p.hora) + ' ' : ''}${esc(p.titulo)}</span>`).join('')}
    </div>`);
  }
  const sinFecha = DB.posts.filter((p) => !p.fecha);
  const conteo = ESTADOS_POST.map((e) => `${e}: ${DB.posts.filter((p) => p.estado === e).length}`).join(' · ');
  const lista = DB.posts.filter((p) => monthKey(p.fecha) === calMonth).sort((a, b) => (a.fecha + (a.hora || '') > b.fecha + (b.hora || '') ? 1 : -1));
  return `
  <div class="section-head">
    <div><p class="eyebrow">Calendario de contenido</p><h2>Grilla</h2></div>
    <div class="cal-head">
      <button class="btn ghost small" data-cal="-1" aria-label="Mes anterior">‹</button>
      <b style="min-width:130px;text-align:center">${MESES_L[m - 1]} ${y}</b>
      <button class="btn ghost small" data-cal="1" aria-label="Mes siguiente">›</button>
      <button class="btn primary small" data-act="post">+ Publicación</button>
    </div>
  </div>
  <p class="muted" style="margin:0">${conteo}. Los días con rayas, en las próximas 3 semanas, no tienen contenido. Toca un día para agregar.</p>
  <div class="cal">${DIAS.map((d) => `<div class="dow">${d}</div>`).join('')}${cells.join('')}</div>
  <div class="grid two">
    <div class="card"><h3>Este mes</h3><div class="list">${lista.map(postRow).join('') || '<p class="empty">Sin publicaciones este mes.</p>'}</div></div>
    <div class="card"><h3>Sin fecha (collabs, ideas)</h3><div class="list">${sinFecha.map(postRow).join('') || '<p class="empty">Nada pendiente sin fecha.</p>'}</div></div>
  </div>`;
}

function vMarcas() {
  const hoy = todayStr();
  const cols = ESTADOS_MARCA.filter((e) => e !== 'Descartado');
  const desc = DB.marcas.filter((m) => m.estado === 'Descartado');
  const card = (m) => `<div class="deal" data-marca="${m.id}">
    <b>${esc(m.nombre)}</b>
    <small>${esc(m.categoria || '')} · prioridad ${esc(m.prioridad || '-')}</small>
    ${m.idea ? `<small>${esc(m.idea)}</small>` : ''}
    ${m.monto ? `<small><b>${esc(m.monto)}</b></small>` : ''}
    ${m.seguimiento ? `<span class="${m.seguimiento <= hoy ? 'due' : 'muted'}" style="font-size:12px">Seguimiento: ${esc(m.seguimiento)}</span>` : ''}
    <select data-move="${m.id}" aria-label="Mover ${esc(m.nombre)}">${ESTADOS_MARCA.map((e) => `<option ${e === m.estado ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
  </div>`;
  const byPrio = (a, b) => (a.prioridad || '9').localeCompare(b.prioridad || '9') || a.nombre.localeCompare(b.nombre);
  return `
  <div class="section-head">
    <div><p class="eyebrow">Pipeline comercial</p><h2>Marcas</h2></div>
    <button class="btn primary small" data-act="marca">+ Marca</button>
  </div>
  <p class="muted" style="margin:0">Al pasar una marca a "Enviado" se agenda el seguimiento a 5 días automáticamente.</p>
  <div class="kanban">${cols.map((e) => {
    const items = DB.marcas.filter((m) => m.estado === e).sort(byPrio);
    return `<div class="col"><h3>${esc(e)} <span class="muted">${items.length}</span></h3>${items.map(card).join('')}</div>`;
  }).join('')}</div>
  ${desc.length ? `<div class="card"><h3>Descartadas (${desc.length})</h3><div class="list">${desc.map((m) => `<div class="row" data-marca="${m.id}"><div class="main"><b>${esc(m.nombre)}</b><small>${esc(m.notas || '')}</small></div></div>`).join('')}</div></div>` : ''}`;
}

function vPresupuesto() {
  if (!budgetMonth) budgetMonth = monthKey(todayStr());
  const [y, m] = budgetMonth.split('-').map(Number);
  const movs = DB.movimientos.filter((x) => monthKey(x.fecha) === budgetMonth).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const gastos = movs.filter((x) => x.tipo === 'Gasto');
  const ingresos = movs.filter((x) => x.tipo === 'Ingreso');
  const pres = DB.config.presupuesto || [];
  const totalG = gastos.reduce((s, x) => s + toUsd(x), 0);
  const totalI = ingresos.reduce((s, x) => s + toUsd(x), 0);
  const totalP = pres.reduce((s, c) => s + (Number(c.usd) || 0), 0);
  const rows = pres.map((c) => {
    const g = gastos.filter((x) => x.categoria === c.categoria).reduce((s, x) => s + toUsd(x), 0);
    const pct = c.usd ? (g / c.usd) * 100 : g ? 100 : 0;
    return `<tr><td>${esc(c.categoria)}</td><td class="num">${fmtUsd(c.usd)}</td><td class="num">${fmtUsd(g)}</td>
      <td style="width:30%"><div class="bar ${pct > 100 ? 'bad' : pct > 80 ? 'warn' : ''}"><span style="width:${Math.min(100, pct)}%"></span></div></td></tr>`;
  }).join('');
  const otras = gastos.filter((x) => !pres.some((c) => c.categoria === x.categoria)).reduce((s, x) => s + toUsd(x), 0);
  const neto = totalI - totalG;
  return `
  <div class="section-head">
    <div><p class="eyebrow">Plan: ~US$400 al mes · equilibrio con 2 colabs de US$200</p><h2>Presupuesto</h2></div>
    <div class="cal-head">
      <button class="btn ghost small" data-bm="-1" aria-label="Mes anterior">‹</button>
      <b style="min-width:130px;text-align:center">${MESES_L[m - 1]} ${y}</b>
      <button class="btn ghost small" data-bm="1" aria-label="Mes siguiente">›</button>
      <button class="btn primary small" data-act="mov">+ Movimiento</button>
    </div>
  </div>
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Gastado</div><div class="value">${fmtUsd(totalG)}</div><div class="sub">de ${fmtUsd(totalP)} presupuestados</div></div>
    <div class="card kpi"><div class="label">Ingresos</div><div class="value">${fmtUsd(totalI)}</div><div class="sub">colaboraciones y otros</div></div>
    <div class="card kpi"><div class="label">Resultado del mes</div><div class="value" style="color:${neto >= 0 ? 'var(--teal)' : 'var(--bad)'}">${neto >= 0 ? '+' : '−'}${fmtUsd(Math.abs(neto))}</div><div class="sub">montos en CLP convertidos a ${fmtInt(DB.config.tipo_cambio_clp)} CLP/US$</div></div>
  </div>
  <div class="card"><div class="section-head"><h3>Por categoría</h3><button class="btn ghost small" data-act="presupuesto">Editar presupuesto</button></div>
    <div class="table-wrap"><table><thead><tr><th>Categoría</th><th class="num">Presupuesto</th><th class="num">Gastado</th><th>Avance</th></tr></thead>
    <tbody>${rows}${otras ? `<tr><td>Sin categoría del plan</td><td class="num">—</td><td class="num">${fmtUsd(otras)}</td><td></td></tr>` : ''}</tbody></table></div></div>
  <div class="card"><h3>Movimientos del mes</h3>
    ${movs.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th class="num">Monto</th><th class="num">US$</th></tr></thead><tbody>
    ${movs.map((x) => `<tr class="row" data-mov="${x.id}" style="display:table-row"><td>${esc(x.fecha)}</td><td>${esc(x.tipo)}</td><td>${esc(x.categoria)}</td><td>${esc(x.descripcion || '')}</td>
      <td class="num">${esc(x.moneda)} ${fmtInt(x.monto)}</td><td class="num">${fmtUsd(toUsd(x))}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Aún no hay movimientos este mes. Registra los cobros de Higgsfield, Meta Ads, etc.</p>'}</div>`;
}

function taskRow(t) {
  const venc = !t.hecha && t.fecha && t.fecha < todayStr();
  return `<div class="task ${t.hecha ? 'done' : ''}">
    <input type="checkbox" data-toggle="${t.id}" ${t.hecha ? 'checked' : ''} aria-label="Marcar ${esc(t.titulo)}">
    <span class="t" data-tarea="${t.id}">${esc(t.titulo)}${t.fecha ? ` <small class="${venc ? 'error' : 'muted'}">· ${esc(t.fecha)}</small>` : ''}</span>
  </div>`;
}
function vTareas() {
  const orden = (a, b) => (a.hecha - b.hecha) || ((a.fecha || '9') > (b.fecha || '9') ? 1 : -1);
  return `
  <div class="section-head">
    <div><p class="eyebrow">Plan de 90 días</p><h2>Tareas</h2></div>
    <button class="btn primary small" data-act="tarea">+ Tarea</button>
  </div>
  ${ETAPAS.map((e) => {
    const ts = DB.tareas.filter((t) => (t.etapa || 'Presencia') === e).sort(orden);
    const hechas = ts.filter((t) => t.hecha).length;
    return `<div class="card"><div class="section-head"><h3>${esc(e)}</h3><span class="muted">${hechas}/${ts.length} hechas</span></div>
      ${ts.map(taskRow).join('') || '<p class="empty">Sin tareas en esta etapa.</p>'}</div>`;
  }).join('')}`;
}

function vRecursos() {
  return `
  <div class="section-head">
    <div><p class="eyebrow">Links, IDs y reglas</p><h2>Recursos</h2></div>
    <button class="btn primary small" data-act="recurso">+ Recurso</button>
  </div>
  <div class="card"><div class="list">${DB.recursos.map((r) => {
    const isUrl = /^https?:\/\//.test(r.valor || '');
    return `<div class="row" data-recurso="${r.id}">
      <div class="main"><b>${esc(r.nombre)}</b><small style="word-break:break-all">${isUrl ? `<a href="${esc(r.valor)}" target="_blank" rel="noopener" data-stop>${esc(r.valor)}</a>` : esc(r.valor)}</small></div>
      <button class="btn ghost small" data-copy="${esc(r.valor)}" data-stop>Copiar</button>
    </div>`;
  }).join('') || '<p class="empty">Sin recursos.</p>'}</div></div>`;
}

// ---------- ideas ----------
let ideaFiltro = 'Todas';
const CATS_IDEA = ['Surf', 'Outdoor', 'Comida sana', 'Viajes', 'Detrás de cámara', 'Marca'];
function editIdea(i = {}) {
  openModal({
    title: i.id ? 'Editar idea' : 'Nueva idea',
    fields: [
      { name: 'titulo', label: 'Idea', full: true, required: true },
      { name: 'categoria', label: 'Categoría', type: 'select', options: CATS_IDEA },
      { name: 'formato', label: 'Formato', type: 'select', options: ['Reel', 'Carrusel', 'Foto', 'Story'] },
      { name: 'estado', label: 'Estado', type: 'select', options: ['Nueva', 'Usada', 'Descartada'] },
      { name: 'notas', label: 'Gancho o notas', type: 'textarea', full: true },
    ],
    values: i,
    onSave: (d) => saveItem('ideas', i.id, d),
    onDelete: i.id ? () => deleteItem('ideas', i.id) : null,
  });
}
function proximoDiaLibre() {
  let d = addDays(todayStr(), 1);
  for (let k = 0; k < 60; k++, d = addDays(d, 1)) if (!DB.posts.some((p) => p.fecha === d)) return d;
  return '';
}
async function ideaAGrilla(id) {
  const i = DB.ideas.find((x) => x.id === id);
  const fecha = proximoDiaLibre();
  await api('/api/posts', { method: 'POST', body: { titulo: i.titulo, fecha, hora: '19:30', formato: i.formato || 'Reel', estado: 'Idea', plataformas: 'FB + IG', notas: i.notas || '' } });
  await saveItem('ideas', id, { estado: 'Usada' });
  toast(`Agregada a la grilla el ${fecha}`);
}
function vIdeas() {
  const cats = ['Todas', ...CATS_IDEA];
  const list = DB.ideas.filter((i) => ideaFiltro === 'Todas' || i.categoria === ideaFiltro)
    .sort((a, b) => (a.estado === 'Nueva' ? 0 : 1) - (b.estado === 'Nueva' ? 0 : 1));
  const nuevas = DB.ideas.filter((i) => i.estado === 'Nueva').length;
  return `
  <div class="section-head">
    <div><p class="eyebrow">${nuevas} ideas disponibles</p><h2>Banco de ideas</h2></div>
    <div class="cal-head"><button class="btn ai small" data-act="ideas-ai">✨ Sugerir 10 con IA</button><button class="btn primary small" data-act="idea">+ Idea</button></div>
  </div>
  <div class="chips">${cats.map((c) => `<button class="chip ${c === ideaFiltro ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="ideas">${list.map((i) => `<div class="idea ${esc(i.estado)}">
    <small class="muted">${esc(i.categoria)} · ${esc(i.formato)}${i.origen === 'IA' ? ' · IA' : ''}${i.estado !== 'Nueva' ? ' · ' + esc(i.estado) : ''}</small>
    <b>${esc(i.titulo)}</b>
    ${i.notas ? `<small>${esc(i.notas)}</small>` : ''}
    <div class="acts">${i.estado === 'Nueva' ? `<button class="btn primary small" data-idea-grilla="${i.id}">A la grilla</button>` : ''}<button class="btn ghost small" data-idea="${i.id}">Editar</button></div>
  </div>`).join('') || '<p class="empty">No hay ideas en esta categoría.</p>'}</div>`;
}

// ---------- contenido (métricas de Meta) ----------
function vContenido() {
  const m = DB.meta;
  if (!m) {
    return `<div class="section-head"><div><p class="eyebrow">Instagram y Meta Ads</p><h2>Contenido</h2></div></div>
    <div class="card"><p>Todavía no hay datos de Meta. Pega el token en <b>Ajustes → Integraciones</b> y el panel traerá solo los seguidores, el alcance de cada post y el gasto en anuncios cada 6 horas.</p>
    <button class="btn primary small" data-goto="ajustes">Ir a Ajustes</button></div>`;
  }
  const media = m.media || [];
  const ads = m.ads;
  const fmt = (n) => (n == null ? '—' : fmtInt(n));
  return `
  <div class="section-head">
    <div><p class="eyebrow">Sincronizado ${esc((m.fecha || '').replace('T', ' ').slice(0, 16))}</p><h2>Contenido</h2></div>
    <button class="btn ghost small" data-act="sync">Sincronizar ahora</button>
  </div>
  ${(m.avisos || []).length ? `<div class="alerts">${m.avisos.map((a) => `<div class="alert">${esc(a)}</div>`).join('')}</div>` : ''}
  <div class="grid kpis">
    <div class="card kpi"><div class="label">Seguidores IG</div><div class="value">${fmt(m.instagram?.followers_count)}</div><div class="sub">${fmt(m.instagram?.media_count)} publicaciones</div></div>
    <div class="card kpi"><div class="label">Alcance 7 días</div><div class="value">${fmt(m.semana?.reach)}</div><div class="sub">${fmt(m.semana?.profile_views)} visitas al perfil</div></div>
    <div class="card kpi"><div class="label">Interacciones 7 días</div><div class="value">${fmt(m.semana?.total_interactions)}</div><div class="sub">${fmt(m.semana?.accounts_engaged)} cuentas</div></div>
    <div class="card kpi"><div class="label">Seguidores FB</div><div class="value">${fmt(m.facebook?.seguidores)}</div><div class="sub">${esc(m.facebook?.nombre || '')}</div></div>
  </div>
  <div class="card"><h3>Publicaciones</h3><div class="table-wrap"><table>
    <thead><tr><th></th><th>Fecha</th><th>Tipo</th><th>Texto</th><th class="num">Alcance</th><th class="num">Vistas</th><th class="num">Likes</th><th class="num">Coment.</th><th class="num">Guard.</th><th class="num">Compart.</th></tr></thead>
    <tbody>${media.map((x) => `<tr>
      <td>${/^https:/.test(x.imagen || '') ? `<a href="${esc(x.link)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(x.imagen)}" alt="" loading="lazy"></a>` : ''}</td>
      <td>${esc((x.fecha || '').slice(0, 10))}</td><td>${esc(x.tipo)}</td><td style="max-width:260px"><small>${esc((x.texto || '').slice(0, 90))}</small></td>
      <td class="num"><b>${fmt(x.alcance)}</b></td><td class="num">${fmt(x.vistas)}</td><td class="num">${fmt(x.likes)}</td><td class="num">${fmt(x.comentarios)}</td><td class="num">${fmt(x.guardados)}</td><td class="num">${fmt(x.compartidos)}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">Sin publicaciones.</td></tr>'}</tbody>
  </table></div></div>
  <div class="card"><h3>Meta Ads este mes</h3>
    ${ads ? `<p>Gasto: <b>${esc(ads.moneda)} ${fmtInt(ads.gasto_mes)}</b> · alcance ${fmtInt(ads.alcance)} · ${fmtInt(ads.clics)} clics. Se registra solo en Presupuesto.</p>
    ${ads.campanas.length ? `<div class="table-wrap"><table><thead><tr><th>Campaña</th><th class="num">Gasto</th><th class="num">Alcance</th><th class="num">Clics</th><th class="num">Costo por clic</th></tr></thead><tbody>
    ${ads.campanas.map((c) => `<tr><td>${esc(c.nombre)}</td><td class="num">${fmtInt(c.gasto)}</td><td class="num">${fmtInt(c.alcance)}</td><td class="num">${fmtInt(c.clics)}</td><td class="num">${c.clics ? fmtInt(c.gasto / c.clics) : '—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Sin campañas activas este mes.</p>'}` : '<p class="empty">Sin datos de anuncios.</p>'}
  </div>`;
}

// ---------- ajustes ----------
function vAjustes() {
  const mk = DB.config.mediakit || {};
  const tarifas = (mk.tarifas || []).map((t) => [t.nombre, t.precio, t.detalle].join(' | ')).join('\n');
  return `
  <div class="section-head"><div><p class="eyebrow">Configuración</p><h2>Ajustes</h2></div></div>
  <div class="settings-grid">
    <form class="card stack" id="f-meta" autocomplete="off">
      <h3>Meta (Instagram, Facebook y Ads)</h3>
      <span id="st-meta" class="status">Revisando…</span>
      <p class="muted" style="margin:0">Pega el token del usuario del sistema <b>maia-panel</b>. Queda guardado solo en este servidor y nunca se muestra completo.</p>
      <label>Token de Meta<input type="password" name="meta_token" placeholder="Pega aquí el token" autocomplete="off"></label>
      <div class="cal-head"><button class="btn primary small" type="submit">Guardar token</button><button class="btn ghost small" type="button" data-act="sync">Sincronizar ahora</button><button class="btn ghost small" type="button" data-act="meta-off">Quitar</button></div>
      <small id="meta-info" class="muted"></small>
    </form>
    <form class="card stack" id="f-ai" autocomplete="off">
      <h3>IA para guiones e ideas (Anthropic)</h3>
      <span id="st-ai" class="status">Revisando…</span>
      <p class="muted" style="margin:0">Crea una API key en console.anthropic.com y pégala aquí. Se usa para guiones, ideas y correos de pitch.</p>
      <label>API key de Anthropic<input type="password" name="anthropic_key" placeholder="Pega aquí la API key" autocomplete="off"></label>
      <label>Modelo<input name="ai_model" value="${esc(DB.config.ai_model || 'claude-sonnet-5-5')}"></label>
      <div class="cal-head"><button class="btn primary small" type="submit">Guardar</button><button class="btn ghost small" type="button" data-act="ai-off">Quitar key</button></div>
    </form>
    <form class="card stack" id="f-mk">
      <h3>Media kit</h3>
      <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="publico" ${mk.publico ? 'checked' : ''}> Público en panel.maiacruz.cl/mediakit</label>
      <label>Nicho<input name="nicho" value="${esc(mk.nicho || '')}"></label>
      <label>Bio<textarea name="bio">${esc(mk.bio || '')}</textarea></label>
      <label>Etiquetas (separadas por coma)<input name="etiquetas" value="${esc((mk.etiquetas || []).join(', '))}"></label>
      <label>Por qué Maia (una por línea)<textarea name="ventajas">${esc((mk.ventajas || []).join('\n'))}</textarea></label>
      <label>Tarifas (una por línea: Nombre | Precio | Detalle)<textarea name="tarifas" style="min-height:130px">${esc(tarifas)}</textarea></label>
      <label>Correo de contacto<input name="contacto" value="${esc(mk.contacto || '')}"></label>
      <div class="cal-head"><button class="btn primary small" type="submit">Guardar media kit</button><a class="btn ghost small" href="/mediakit" target="_blank" rel="noopener">Ver media kit</a></div>
    </form>
    <div class="card stack">
      <h3>General</h3>
      <p class="muted" style="margin:0">Créditos de Higgsfield, presupuesto, tipo de cambio e inicio del plan.</p>
      <div><button class="btn ghost small" data-act="config">Editar ajustes generales</button></div>
      <h3 style="margin-top:10px">Actualización</h3>
      <p class="muted" style="margin:0">Versión instalada: <b id="version">…</b></p>
      <div><button class="btn ghost small" data-act="update">Buscar e instalar actualización</button></div>
    </div>
  </div>`;
}
async function loadAjustes() {
  try {
    const st = await api('/api/integrations');
    const sm = $('#st-meta'), sa = $('#st-ai');
    if (sm) {
      sm.className = 'status ' + (st.meta.configured ? 'on' : '');
      sm.textContent = st.meta.configured ? `Conectado (${st.meta.hint})` : 'Sin conectar';
      $('#meta-info').textContent = st.meta.error ? 'Error: ' + st.meta.error : st.meta.last_sync ? 'Última sincronización: ' + st.meta.last_sync.replace('T', ' ').slice(0, 16) : '';
    }
    if (sa) { sa.className = 'status ' + (st.anthropic.configured ? 'on' : ''); sa.textContent = st.anthropic.configured ? `Conectado (${st.anthropic.hint})` : 'Sin conectar'; }
  } catch { /* noop */ }
  api('/api/version').then((v) => { const el = $('#version'); if (el) el.textContent = `${v.commit}${v.fecha ? ' · ' + v.fecha.slice(0, 16) : ''}`; }).catch(() => {});
}
async function submitAjustes(form) {
  const f = new FormData(form);
  if (form.id === 'f-meta') {
    const t = (f.get('meta_token') || '').trim();
    if (!t) throw new Error('Pega el token primero.');
    await api('/api/integrations', { method: 'PUT', body: { meta_token: t } });
    form.reset();
    toast('Token guardado. Sincronizando…');
    setTimeout(async () => { await reload(); }, 8000);
  }
  if (form.id === 'f-ai') {
    const body = { ai_model: f.get('ai_model') };
    const k = (f.get('anthropic_key') || '').trim();
    if (k) body.anthropic_key = k;
    await api('/api/integrations', { method: 'PUT', body });
    form.reset();
    toast('Guardado');
  }
  if (form.id === 'f-mk') {
    const tarifas = String(f.get('tarifas') || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([nombre, precio = '', detalle = '']) => ({ nombre, precio, detalle }));
    const mediakit = {
      ...(DB.config.mediakit || {}),
      publico: f.get('publico') === 'on',
      nicho: f.get('nicho'), bio: f.get('bio'), contacto: f.get('contacto'),
      etiquetas: String(f.get('etiquetas') || '').split(',').map((x) => x.trim()).filter(Boolean),
      ventajas: String(f.get('ventajas') || '').split('\n').map((x) => x.trim()).filter(Boolean),
      tarifas,
    };
    await api('/api/config', { method: 'PUT', body: { mediakit } });
    toast('Media kit guardado');
    await reload();
  }
  loadAjustes();
}

// ---------- eventos ----------
function bind(root) {
  root.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-stop]')) {
      const c = t.closest('[data-copy]');
      if (c) { e.stopPropagation(); navigator.clipboard.writeText(c.dataset.copy).then(() => toast('Copiado')); }
      return;
    }
    if (t.closest('select')) return;
    const act = t.closest('[data-act]')?.dataset.act;
    if (act) {
      const btn = t.closest('[data-act]');
      const run = async (fn, busy) => {
        const old = btn.textContent; btn.disabled = true; if (busy) btn.textContent = busy;
        try { await fn(); } catch (err) { alert(err.message); }
        btn.disabled = false; btn.textContent = old;
      };
      const acts = {
        post: () => editPost(), marca: () => editMarca(), mov: () => editMov(), tarea: () => editTarea({ etapa: 'Presencia' }),
        recurso: () => editRecurso(), metrica: () => editMetrica(), config: editConfig, presupuesto: editPresupuesto, idea: () => editIdea({ estado: 'Nueva', formato: 'Reel', categoria: 'Surf' }),
        'ideas-ai': () => run(async () => { const r = await api('/api/ai/ideas', { method: 'POST', body: { categoria: ideaFiltro === 'Todas' ? '' : ideaFiltro } }); toast(`${r.nuevas.length} ideas nuevas`); await reload(); }, 'Pensando…'),
        sync: () => run(async () => { try { await api('/api/integrations/meta/sync', { method: 'POST' }); toast('Datos de Meta actualizados'); } finally { await reload(); } }, 'Sincronizando…'),
        'meta-off': () => run(async () => { if (!confirm('¿Quitar el token de Meta?')) return; await api('/api/integrations', { method: 'PUT', body: { meta_token: '' } }); loadAjustes(); }),
        'ai-off': () => run(async () => { if (!confirm('¿Quitar la API key?')) return; await api('/api/integrations', { method: 'PUT', body: { anthropic_key: '' } }); loadAjustes(); }),
        update: () => run(async () => { const r = await api('/api/admin/update', { method: 'POST' }); alert(r.message); if (r.updated) setTimeout(() => location.reload(), 6000); }, 'Actualizando…'),
      };
      acts[act]();
      return;
    }
    const go = t.closest('[data-goto]')?.dataset.goto;
    if (go) { document.querySelector(`#tabs [data-view="${go}"]`).click(); return; }
    const cat = t.closest('[data-cat]')?.dataset.cat;
    if (cat) { ideaFiltro = cat; render(); return; }
    const ig = t.closest('[data-idea-grilla]')?.dataset.ideaGrilla;
    if (ig) { try { await ideaAGrilla(ig); } catch (err) { alert(err.message); } return; }
    const iid = t.closest('[data-idea]')?.dataset.idea;
    if (iid) return editIdea(DB.ideas.find((x) => x.id === iid));
    const pid = t.closest('[data-post]')?.dataset.post;
    if (pid) return editPost(DB.posts.find((p) => p.id === pid));
    const day = t.closest('[data-day]')?.dataset.day;
    if (day) return editPost({ fecha: day, hora: '19:30', formato: 'Reel', estado: 'Idea', plataformas: 'FB + IG' });
    const mid = t.closest('[data-marca]')?.dataset.marca;
    if (mid) return editMarca(DB.marcas.find((m) => m.id === mid));
    const mv = t.closest('[data-mov]')?.dataset.mov;
    if (mv) return editMov(DB.movimientos.find((m) => m.id === mv));
    const tid = t.closest('[data-tarea]')?.dataset.tarea;
    if (tid) return editTarea(DB.tareas.find((x) => x.id === tid));
    const rid = t.closest('[data-recurso]')?.dataset.recurso;
    if (rid) return editRecurso(DB.recursos.find((x) => x.id === rid));
    const cal = t.closest('[data-cal]')?.dataset.cal;
    if (cal) { const [y, m] = calMonth.split('-').map(Number); calMonth = ymd(new Date(y, m - 1 + Number(cal), 1)).slice(0, 7); render(); return; }
    const bm = t.closest('[data-bm]')?.dataset.bm;
    if (bm) { const [y, m] = budgetMonth.split('-').map(Number); budgetMonth = ymd(new Date(y, m - 1 + Number(bm), 1)).slice(0, 7); render(); }
  };
  root.onsubmit = async (e) => {
    if (!e.target.id?.startsWith('f-')) return;
    e.preventDefault();
    try { await submitAjustes(e.target); } catch (err) { alert(err.message); }
  };
  root.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.toggle) {
      await saveItem('tareas', t.dataset.toggle, { hecha: t.checked });
      toast(t.checked ? 'Tarea hecha' : 'Tarea reabierta');
    }
    if (t.dataset.move) {
      const body = { estado: t.value };
      if (t.value === 'Enviado') body.seguimiento = addDays(todayStr(), 5);
      await saveItem('marcas', t.dataset.move, body);
      toast('Marca movida a ' + t.value);
    }
  };
}

boot().catch((e) => showLogin(e.message));
