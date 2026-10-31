'use strict';
// Radar de cuentas (business_discovery) y bandeja de comentarios de Instagram.
const { graph } = require('./meta');

const GRAPH = 'https://graph.facebook.com/v23.0';

function limpiarUsuario(u) {
  return String(u || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#\s]/)[0].toLowerCase();
}

// Estadísticas públicas de una cuenta profesional (empresa o creador) de Instagram.
async function cuenta({ igId, token, usuario }) {
  const u = limpiarUsuario(usuario);
  if (!/^[a-z0-9._]{1,30}$/.test(u)) throw new Error('Usuario de Instagram no válido.');
  const fields = `business_discovery.username(${u}){username,name,followers_count,follows_count,media_count,profile_picture_url,biography,website,media.limit(12){timestamp,like_count,comments_count,media_product_type,media_type,permalink}}`;
  let r;
  try {
    r = await graph(`/${igId}`, { fields }, token);
  } catch (e) {
    if (/business_discovery|cannot be found|Invalid user id|110/i.test(e.message)) throw new Error(`@${u} no se encontró o no es una cuenta profesional (Meta solo muestra cuentas de empresa o creador).`);
    throw e;
  }
  const b = r.business_discovery || {};
  const media = b.media?.data || [];
  const conLikes = media.filter((m) => m.like_count != null);
  const interPromedio = media.length ? media.reduce((s, m) => s + (m.like_count || 0) + (m.comments_count || 0), 0) / media.length : 0;
  let porSemana = null;
  if (media.length >= 2) {
    const t = media.map((m) => new Date(m.timestamp).getTime()).sort((a, b2) => a - b2);
    const semanas = Math.max(1, (t.at(-1) - t[0]) / (7 * 864e5));
    porSemana = Math.round((media.length / semanas) * 10) / 10;
  }
  const reels = media.filter((m) => m.media_product_type === 'REELS').length;
  return {
    usuario: b.username || u,
    nombre: b.name || '',
    seguidores: b.followers_count ?? null,
    siguiendo: b.follows_count ?? null,
    publicaciones: b.media_count ?? null,
    foto: b.profile_picture_url || '',
    bio: (b.biography || '').slice(0, 300),
    web: b.website || '',
    interacciones_promedio: Math.round(interPromedio),
    engagement: b.followers_count ? Math.round((interPromedio / b.followers_count) * 10000) / 100 : null,
    likes_ocultos: media.length > 0 && conLikes.length === 0,
    posts_por_semana: porSemana,
    pct_reels: media.length ? Math.round((reels / media.length) * 100) : null,
    ultimo_post: media[0]?.timestamp || null,
    ultimo_link: media[0]?.permalink || '',
    actualizado: new Date().toISOString(),
  };
}

// Comentarios recientes de las últimas publicaciones.
async function comentarios({ igId, token, usuarioPropio, limite = 10 }) {
  const media = await graph(`/${igId}/media`, { fields: 'id,caption,permalink,timestamp,thumbnail_url,media_url,comments_count', limit: limite }, token);
  const out = [];
  for (const m of media.data || []) {
    if (!m.comments_count) continue;
    const c = await graph(`/${m.id}/comments`, { fields: 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp}', limit: 50 }, token);
    for (const x of c.data || []) {
      if (usuarioPropio && x.username === usuarioPropio) continue;
      const replies = x.replies?.data || [];
      out.push({
        id: x.id,
        media_id: m.id,
        post: (m.caption || '').split('\n')[0].slice(0, 70),
        post_link: m.permalink,
        imagen: m.thumbnail_url || m.media_url || '',
        usuario: x.username,
        texto: x.text,
        fecha: x.timestamp,
        likes: x.like_count || 0,
        respondido: replies.some((r) => r.username === usuarioPropio),
        respuestas: replies.map((r) => ({ usuario: r.username, texto: r.text, fecha: r.timestamp })),
      });
    }
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

async function responder({ token, comentarioId, texto }) {
  const msg = String(texto || '').trim();
  if (!msg) throw new Error('Escribe la respuesta.');
  if (!/^\d+$/.test(String(comentarioId))) throw new Error('Comentario no válido.');
  const res = await fetch(`${GRAPH}/${comentarioId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message: msg.slice(0, 2200), access_token: token }),
    signal: AbortSignal.timeout(20000),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error) {
    const m = d.error?.message || `HTTP ${res.status}`;
    if (/permission|\(#10\)|\(#200\)/i.test(m)) throw new Error('El token no tiene permiso para responder comentarios (falta instagram_manage_comments). ' + m);
    throw new Error(m);
  }
  return d;
}

module.exports = { cuenta, comentarios, responder, limpiarUsuario };
