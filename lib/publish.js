'use strict';
// Publicación en Instagram y Facebook con la Graph API.
// Requiere en el token: instagram_content_publish y pages_manage_posts (además de los de lectura).

const GRAPH = 'https://graph.facebook.com/v23.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, pathname, params, token) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === 'GET' ? `${GRAPH}${pathname}?${body}` : `${GRAPH}${pathname}`;
  const res = await fetch(url, {
    method,
    body: method === 'GET' ? undefined : body,
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    let msg = e.error_user_msg || e.message || `HTTP ${res.status}`;
    if (e.code === 10 || e.code === 200 || /permission/i.test(msg)) msg += ' → Falta permiso de publicación en el token (instagram_content_publish / pages_manage_posts).';
    throw new Error(msg);
  }
  return data;
}

async function waitContainer(id, token, { maxMs = 8 * 60000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const r = await call('GET', `/${id}`, { fields: 'status_code,status' }, token);
    if (r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') throw new Error('Instagram rechazó el archivo: ' + (r.status || r.status_code));
    await sleep(5000);
  }
  throw new Error('Instagram tardó demasiado en procesar el video. Intenta de nuevo.');
}

async function instagram({ igId, token, items, caption }) {
  // items: [{ url, tipo: 'video' | 'imagen' }]
  let creation;
  if (items.length === 1 && items[0].tipo === 'video') {
    const c = await call('POST', `/${igId}/media`, { media_type: 'REELS', video_url: items[0].url, caption, share_to_feed: 'true' }, token);
    await waitContainer(c.id, token);
    creation = c.id;
  } else if (items.length === 1) {
    const c = await call('POST', `/${igId}/media`, { image_url: items[0].url, caption }, token);
    await waitContainer(c.id, token, { maxMs: 120000 });
    creation = c.id;
  } else {
    if (items.length > 10) throw new Error('Un carrusel admite máximo 10 archivos.');
    const children = [];
    for (const it of items) {
      const p = it.tipo === 'video' ? { media_type: 'VIDEO', video_url: it.url, is_carousel_item: 'true' } : { image_url: it.url, is_carousel_item: 'true' };
      const c = await call('POST', `/${igId}/media`, p, token);
      await waitContainer(c.id, token);
      children.push(c.id);
    }
    const c = await call('POST', `/${igId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }, token);
    await waitContainer(c.id, token, { maxMs: 120000 });
    creation = c.id;
  }
  const pub = await call('POST', `/${igId}/media_publish`, { creation_id: creation }, token);
  let permalink = '';
  try { permalink = (await call('GET', `/${pub.id}`, { fields: 'permalink' }, token)).permalink || ''; } catch { /* noop */ }
  return { id: pub.id, link: permalink };
}

async function pageToken(pageId, token) {
  const r = await call('GET', `/${pageId}`, { fields: 'access_token' }, token);
  if (!r.access_token) throw new Error('No se pudo obtener el token de la página. Revisa que el usuario del sistema tenga la página asignada.');
  return r.access_token;
}

async function facebook({ pageId, token, items, caption }) {
  const pt = await pageToken(pageId, token);
  if (items.length === 1 && items[0].tipo === 'video') {
    const r = await call('POST', `/${pageId}/videos`, { file_url: items[0].url, description: caption }, pt);
    return { id: r.id, link: `https://www.facebook.com/${pageId}/videos/${r.id}` };
  }
  const fotos = items.filter((i) => i.tipo === 'imagen');
  if (!fotos.length) throw new Error('Facebook: para varios archivos usa solo fotos.');
  if (fotos.length === 1) {
    const r = await call('POST', `/${pageId}/photos`, { url: fotos[0].url, message: caption }, pt);
    return { id: r.post_id || r.id, link: `https://www.facebook.com/${r.post_id || r.id}` };
  }
  const ids = [];
  for (const f of fotos) ids.push((await call('POST', `/${pageId}/photos`, { url: f.url, published: 'false' }, pt)).id);
  const params = { message: caption };
  ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  const r = await call('POST', `/${pageId}/feed`, params, pt);
  return { id: r.id, link: `https://www.facebook.com/${r.id}` };
}

module.exports = { instagram, facebook };
