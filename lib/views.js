'use strict';
// Páginas generadas en el servidor: media kit público y propuesta imprimible.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n == null || n === '' ? '—' : Math.round(Number(n)).toLocaleString('es-CL'));
const safeUrl = (u) => (/^https:\/\//.test(u || '') ? u : '');

function stats(db) {
  const m = db.meta || {};
  const seguidores = m.instagram?.followers_count ?? db.config.seguidores ?? 0;
  const media = (m.media || []).filter((x) => x.alcance != null);
  const alcance = m.semana?.reach ?? null;
  const promAlcance = media.length ? Math.round(media.reduce((s, x) => s + (x.alcance || 0), 0) / media.length) : null;
  const inter = media.length ? media.reduce((s, x) => s + (x.interacciones || 0), 0) / media.length : null;
  const engagement = inter != null && seguidores ? ((inter / seguidores) * 100).toFixed(1) : null;
  const top = [...(m.media || [])].sort((a, b) => (b.alcance || b.interacciones || 0) - (a.alcance || a.interacciones || 0)).slice(0, 6);
  return { seguidores, alcance, promAlcance, engagement, posts: m.instagram?.media_count ?? db.posts.filter((p) => p.estado === 'Publicado').length, top, fb: m.facebook?.seguidores ?? null, audiencia: m.audiencia || null };
}

const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Oswald:wght@500;600&display=swap');
:root{--navy:#0F2A33;--coral:#E8613C;--teal:#2E8C8A;--cream:#FBF8F2;--sand:#F4EEE4;--muted:#5B6E76;--line:#ECE8E1}
*{box-sizing:border-box}body{margin:0;font-family:'DM Sans',system-ui,sans-serif;color:var(--navy);background:var(--cream);line-height:1.5}
h1,h2,h3{font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:.5px;margin:0;font-weight:600}
.eyebrow{color:var(--coral);letter-spacing:3px;text-transform:uppercase;font-weight:700;font-size:12px;margin:0}
.wrap{max-width:980px;margin:0 auto;padding:32px 20px 60px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px}
.grid{display:grid;gap:16px}.kpis{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.kpi b{font-family:'Oswald';font-size:36px;display:block}.kpi span{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:700}
.muted{color:var(--muted)}a{color:var(--teal)}
.banner{background:#FFF1D6;color:#8A5A00;padding:10px 16px;border-radius:12px;font-size:14px;margin-bottom:16px}
`;

function audienciaHtml(aud) {
  if (!aud) return '';
  const block = (title, list, fmt = (x) => x) => list && list.length
    ? `<div><h3 style="font-size:14px;margin-bottom:8px">${title}</h3>${list.map((x) => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:4px 0"><span>${esc(fmt(x.clave))}</span><b>${num(x.valor)}</b></div>`).join('')}</div>`
    : '';
  const g = { F: 'Mujeres', M: 'Hombres', U: 'Otro' };
  return `<div class="card"><p class="eyebrow">Audiencia</p><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-top:12px">
    ${block('Edad', aud.age)}${block('Género', aud.gender, (k) => g[k] || k)}${block('Ciudades', aud.city)}</div></div>`;
}

function mediakit(db, { preview } = {}) {
  const mk = db.config.mediakit || {};
  const st = stats(db);
  const tarifas = mk.tarifas || [];
  const ig = db.meta?.instagram || {};
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Media kit · Maia Cruz</title><meta name="description" content="${esc(mk.bio || '')}"><style>${BASE_CSS}
.hero{background:linear-gradient(160deg,#0F2A33,#1F6E6C);color:#FBF8F2;border-radius:24px;padding:36px;display:flex;gap:24px;align-items:center;flex-wrap:wrap}
.hero img{width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid #fff}
.hero h1{font-size:46px}.tag{display:inline-block;background:rgba(255,255,255,.14);padding:4px 12px;border-radius:999px;font-size:13px;margin:4px 4px 0 0}
.tops{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.tops a{display:block;border-radius:14px;overflow:hidden;background:var(--sand);text-decoration:none;color:inherit}
.tops img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}.tops small{display:block;padding:6px 8px;font-size:12px}
.tarifa{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:12px 0}.tarifa:last-child{border:0}
.cta{display:inline-block;background:var(--coral);color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700}
@media print{.noprint{display:none}body{background:#fff}}
</style></head><body><div class="wrap">
${preview ? '<div class="banner noprint">Vista previa privada: el media kit aún no es público. Actívalo en el panel → Ajustes → Media kit.</div>' : ''}
<section class="hero">
  ${safeUrl(ig.profile_picture_url) ? `<img src="${esc(ig.profile_picture_url)}" alt="Maia Cruz">` : ''}
  <div style="flex:1;min-width:240px"><p class="eyebrow" style="color:#F28B6B">Media kit ${new Date().getFullYear()}</p><h1>Maia Cruz</h1>
  <p style="margin:6px 0 10px;color:#BFD8D5">@maiacruz.ia · ${esc(mk.nicho || 'Surf, outdoor, comida sana y viajes por Chile')}</p>
  <p style="margin:0 0 8px">${esc(mk.bio || '')}</p>
  ${(mk.etiquetas || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
</section>
<div class="grid kpis" style="margin-top:18px">
  <div class="card kpi"><span>Seguidores IG</span><b>${num(st.seguidores)}</b></div>
  ${st.alcance != null ? `<div class="card kpi"><span>Alcance 7 días</span><b>${num(st.alcance)}</b></div>` : ''}
  ${st.promAlcance != null ? `<div class="card kpi"><span>Alcance prom. por post</span><b>${num(st.promAlcance)}</b></div>` : ''}
  ${st.engagement != null ? `<div class="card kpi"><span>Engagement</span><b>${st.engagement}%</b></div>` : ''}
  ${st.fb != null ? `<div class="card kpi"><span>Seguidores FB</span><b>${num(st.fb)}</b></div>` : ''}
</div>
${st.top.length ? `<div class="card" style="margin-top:18px"><p class="eyebrow">Mejores publicaciones</p><div class="grid tops" style="margin-top:12px">
  ${st.top.map((p) => `<a href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener">${safeUrl(p.imagen) ? `<img src="${esc(p.imagen)}" alt="" loading="lazy">` : ''}<small>${esc(p.tipo)} · ${num(p.alcance ?? p.interacciones)} ${p.alcance != null ? 'de alcance' : 'interacciones'}</small></a>`).join('')}
</div></div>` : ''}
<div style="margin-top:18px">${audienciaHtml(st.audiencia)}</div>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:18px">
  <div class="card"><p class="eyebrow">Formatos y tarifas</p>
    ${tarifas.map((t) => `<div class="tarifa"><div><b>${esc(t.nombre)}</b><div class="muted" style="font-size:14px">${esc(t.detalle || '')}</div></div><b style="white-space:nowrap">${esc(t.precio)}</b></div>`).join('') || '<p class="muted">Consultar.</p>'}
  </div>
  <div class="card"><p class="eyebrow">Por qué Maia</p>
    <ul style="padding-left:18px;margin:10px 0">${(mk.ventajas || []).map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
    <p class="muted" style="font-size:13px">Maia es un personaje digital creado con IA. Todo el contenido se publica con aviso de IA.</p>
  </div>
</div>
<div class="card" style="margin-top:18px;text-align:center"><h2>¿Hacemos algo juntos?</h2>
  <p class="muted">${esc(mk.contacto || 'hola@maiacruz.cl')}</p>
  <a class="cta" href="mailto:${esc(mk.contacto || 'hola@maiacruz.cl')}?subject=Colaboraci%C3%B3n%20con%20Maia%20Cruz">Escribir a Maia</a>
  <p class="muted" style="font-size:12px;margin-top:14px">Datos actualizados ${db.meta?.fecha ? 'el ' + esc(db.meta.fecha.slice(0, 10)) + ' desde Instagram' : 'manualmente'}.</p>
</div></div></body></html>`;
}

function propuesta(db, marca, q = {}) {
  const mk = db.config.mediakit || {};
  const st = stats(db);
  const tarifas = mk.tarifas || [];
  const idx = String(q.paquetes || '').split(',').filter(Boolean).map(Number);
  const elegidos = idx.length ? tarifas.filter((_, i) => idx.includes(i)) : tarifas.slice(0, 1);
  const hoy = new Date();
  const vence = new Date(hoy.getTime() + 15 * 864e5);
  const f = (d) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Propuesta · ${esc(marca.nombre)} × Maia Cruz</title><style>${BASE_CSS}
body{background:#fff}.page{max-width:820px;margin:0 auto;padding:40px 28px}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid var(--coral);padding-bottom:16px;margin-bottom:24px}
h1{font-size:40px}table{width:100%;border-collapse:collapse}td,th{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}.right{text-align:right}
.toolbar{position:sticky;top:0;background:var(--navy);color:#fff;padding:10px 16px;display:flex;gap:10px;justify-content:center}
.toolbar button,.toolbar a{font:inherit;background:var(--coral);color:#fff;border:0;border-radius:999px;padding:8px 16px;cursor:pointer;text-decoration:none}
@media print{.toolbar{display:none}.page{padding:0}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Descargar PDF / Imprimir</button><a href="/" style="background:transparent;border:1px solid #fff">Volver al panel</a></div>
<div class="page">
<div class="head"><div><p class="eyebrow">Propuesta de colaboración</p><h1>${esc(marca.nombre)} × Maia Cruz</h1></div>
<div class="muted" style="text-align:right;font-size:14px">${f(hoy)}<br>Válida hasta el ${f(vence)}</div></div>
<h3>La idea</h3><p>${esc(marca.idea || 'Contenido a medida para la marca, con el estilo de vida de Maia: surf, outdoor, comida sana y viajes por Chile.')}</p>
<h3 style="margin-top:22px">Quién es Maia</h3>
<p>${esc(mk.bio || '')} Hoy tiene <b>${num(st.seguidores)}</b> seguidores en Instagram${st.promAlcance != null ? ` y un alcance promedio de <b>${num(st.promAlcance)}</b> cuentas por publicación` : ''}${st.engagement != null ? `, con un engagement de <b>${st.engagement}%</b>` : ''}. Maia es un personaje digital creado con IA: siempre disponible, sin viajes ni agenda, y todo se publica con aviso de IA.</p>
<h3 style="margin-top:22px">Qué incluye</h3>
<table><thead><tr><th>Formato</th><th>Detalle</th><th class="right">Valor</th></tr></thead><tbody>
${elegidos.map((t) => `<tr><td><b>${esc(t.nombre)}</b></td><td>${esc(t.detalle || '')}</td><td class="right">${esc(t.precio)}</td></tr>`).join('')}
${marca.monto ? `<tr><td colspan="2"><b>Total propuesto</b></td><td class="right"><b>${esc(marca.monto)}</b></td></tr>` : ''}
</tbody></table>
<h3 style="margin-top:22px">Cómo trabajamos</h3>
<ol><li>Brief de 15 minutos con la marca (producto, mensaje, fechas).</li><li>Guion y propuesta visual en 48 horas, con una ronda de cambios.</li><li>Publicación en el feed de Maia (Instagram y Facebook), como colaboración si la marca quiere.</li><li>Reporte de alcance, interacciones y visitas al perfil a los 7 días.</li></ol>
<h3 style="margin-top:22px">Condiciones</h3>
<ul><li>50% al aprobar la propuesta y 50% al publicar, o canje acordado.</li><li>La marca puede reutilizar el contenido en sus redes durante 3 meses.</li><li>Todo el contenido lleva el aviso "Maia es un personaje digital creado con IA" y no incluye testimonios de uso real.</li></ul>
<div class="card" style="margin-top:26px;background:var(--sand);border:0"><b>Maia Cruz</b> · ${esc(mk.contacto || 'hola@maiacruz.cl')} · maiacruz.cl · @maiacruz.ia</div>
</div></body></html>`;
}


function postsDeMarca(db, marca) {
  const media = db.meta?.media || [];
  const norm = (u) => String(u || '').split('?')[0].replace(/\/$/, '');
  return db.posts.filter((p) => (p.marca || '').trim().toLowerCase() === (marca.nombre || '').trim().toLowerCase()).map((p) => {
    const m = media.find((x) => (p.publicado_ig_id && x.id === p.publicado_ig_id) || (p.ig_media_id && x.id === p.ig_media_id) || (p.link && norm(x.link) === norm(p.link)));
    return { post: p, m };
  });
}

function reporte(db, marca) {
  const rows = postsDeMarca(db, marca);
  const st = stats(db);
  const pubs = rows.filter((r) => r.m);
  const sum = (k) => pubs.reduce((s, r) => s + (Number(r.m[k]) || 0), 0);
  const tot = { alcance: sum('alcance'), vistas: sum('vistas'), likes: sum('likes'), comentarios: sum('comentarios'), guardados: sum('guardados'), compartidos: sum('compartidos'), interacciones: sum('interacciones') };
  const er = tot.alcance ? ((tot.interacciones / tot.alcance) * 100).toFixed(1) : null;
  const prom = st.promAlcance;
  const vsProm = prom && pubs.length ? Math.round(((tot.alcance / pubs.length) / prom - 1) * 100) : null;
  const fechas = pubs.map((r) => (r.m.fecha || '').slice(0, 10)).sort();
  const f = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const kpi = (label, v, sub = '') => `<div class="card kpi"><span>${label}</span><b>${v}</b>${sub ? `<small class="muted">${sub}</small>` : ''}</div>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte · ${esc(marca.nombre)} × Maia Cruz</title><style>${BASE_CSS}
body{background:#fff}.page{max-width:860px;margin:0 auto;padding:40px 28px}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid var(--coral);padding-bottom:16px;margin-bottom:24px;gap:16px}
h1{font-size:38px}.kpi small{display:block;font-size:12px}
table{width:100%;border-collapse:collapse}td,th{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:14px}
th{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}.r{text-align:right}
.thumb{width:56px;height:70px;object-fit:cover;border-radius:8px;background:var(--sand)}
.toolbar{position:sticky;top:0;background:var(--navy);color:#fff;padding:10px 16px;display:flex;gap:10px;justify-content:center}
.toolbar button,.toolbar a{font:inherit;background:var(--coral);color:#fff;border:0;border-radius:999px;padding:8px 16px;cursor:pointer;text-decoration:none}
@media print{.toolbar{display:none}.page{padding:0}.card{break-inside:avoid}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Descargar PDF / Imprimir</button><a href="/" style="background:transparent;border:1px solid #fff">Volver al panel</a></div>
<div class="page">
<div class="head"><div><p class="eyebrow">Reporte de resultados</p><h1>${esc(marca.nombre)} × Maia Cruz</h1></div>
<div class="muted" style="text-align:right;font-size:14px">${fechas.length ? `Publicaciones del ${f(fechas[0])}${fechas.length > 1 ? ' al ' + f(fechas.at(-1)) : ''}` : ''}<br>Datos al ${f((db.meta?.fecha || new Date().toISOString()).slice(0, 10))}, desde Instagram</div></div>
${!rows.length ? '<p class="banner">Todavía no hay publicaciones vinculadas a esta marca. En la grilla, abre la publicación y elige la marca en el campo "Marca".</p>' : ''}
${rows.length && !pubs.length ? '<p class="banner">Las publicaciones de esta marca aún no tienen métricas. Se completan solas cuando se publican y el panel sincroniza con Meta (cada 6 horas).</p>' : ''}
${pubs.length ? `<div class="grid kpis">
  ${kpi('Cuentas alcanzadas', num(tot.alcance), vsProm != null ? `${vsProm >= 0 ? '+' : ''}${vsProm}% vs. promedio de Maia` : '')}
  ${tot.vistas ? kpi('Reproducciones', num(tot.vistas)) : ''}
  ${kpi('Interacciones', num(tot.interacciones), er ? `${er}% del alcance` : '')}
  ${kpi('Guardados y compartidos', num(tot.guardados + tot.compartidos))}
</div>
<div class="card" style="margin-top:18px"><p class="eyebrow">Detalle por publicación</p><div style="overflow-x:auto"><table style="margin-top:10px">
<thead><tr><th></th><th>Fecha</th><th>Publicación</th><th class="r">Alcance</th><th class="r">Vistas</th><th class="r">Likes</th><th class="r">Coment.</th><th class="r">Guard.</th><th class="r">Compart.</th></tr></thead><tbody>
${rows.map(({ post, m }) => `<tr><td>${m && safeUrl(m.imagen) ? `<img class="thumb" src="${esc(m.imagen)}" alt="">` : ''}</td>
<td>${esc((m?.fecha || post.fecha || '').slice(0, 10))}</td>
<td><b>${esc(post.titulo)}</b><br><small class="muted">${esc(post.formato || '')}${m?.link || post.link ? ` · <a href="${esc(safeUrl(m?.link || post.link))}">ver</a>` : ''}</small></td>
<td class="r"><b>${m ? num(m.alcance) : '—'}</b></td><td class="r">${m ? num(m.vistas) : '—'}</td><td class="r">${m ? num(m.likes) : '—'}</td><td class="r">${m ? num(m.comentarios) : '—'}</td><td class="r">${m ? num(m.guardados) : '—'}</td><td class="r">${m ? num(m.compartidos) : '—'}</td></tr>`).join('')}
</tbody></table></div></div>` : ''}
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:18px">
  <div class="card"><p class="eyebrow">Contexto</p><p style="margin:8px 0 0">Maia tiene hoy <b>${num(st.seguidores)}</b> seguidores${st.promAlcance != null ? ` y un alcance promedio de <b>${num(st.promAlcance)}</b> cuentas por publicación` : ''}. Todo el contenido se publicó con el aviso "Maia es un personaje digital creado con IA".</p></div>
  <div class="card"><p class="eyebrow">Próximo paso</p><p style="margin:8px 0 0">${esc(marca.siguiente_paso || 'Repetir el formato con mejor resultado y sumar stories con link para llevar tráfico directo a la marca.')}</p></div>
</div>
<div class="card" style="margin-top:22px;background:var(--sand);border:0"><b>Maia Cruz</b> · ${esc(db.config.mediakit?.contacto || 'hola@maiacruz.cl')} · maiacruz.cl · @maiacruz.ia</div>
</div></body></html>`;
}

function pitchTemplate(marca, db) {
  const st = stats(db);
  const t = (db.config.mediakit?.tarifas || [])[0];
  return {
    asunto: `Colaboración con Maia Cruz, creadora digital de surf y outdoor en Chile`,
    cuerpo: `Hola, equipo de ${marca.nombre}:

Soy Maia Cruz (@maiacruz.ia), una creadora de contenido digital hecha con inteligencia artificial. Comparto rutas de surf, cerro y comida sana por Chile, y siempre aviso que soy un personaje de IA.

Me encantaría hacer una colaboración piloto con ustedes: ${marca.idea || 'contenido a medida con el estilo de vida de Maia'}.

${st.seguidores >= 100 ? `Hoy tengo ${num(st.seguidores)} seguidores y entrego` : 'Entrego'} el contenido en 48 horas, con una ronda de cambios y un reporte de resultados a los 7 días.${t ? ` El ${t.nombre.toLowerCase()} (${t.detalle || t.nombre}) va ${t.precio}.` : ''}

Pueden ver mi media kit aquí: https://panel.maiacruz.cl/mediakit

¿Les interesa conversarlo?

Un abrazo,
Maia Cruz
hola@maiacruz.cl · maiacruz.cl`,
  };
}

function notFound() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>No encontrado</title><style>${BASE_CSS}</style></head><body><div class="wrap"><h1>No encontrado</h1><p class="muted">Esta página no está disponible.</p></div></body></html>`;
}

module.exports = { mediakit, propuesta, reporte, postsDeMarca, pitchTemplate, stats, notFound };
