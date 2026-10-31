'use strict';
// Sincronización con la Graph API de Meta: Instagram, página de Facebook y Meta Ads.
// Todo es de solo lectura.

const GRAPH = 'https://graph.facebook.com/v23.0';

async function graph(pathname, params, token) {
  const url = new URL(GRAPH + pathname);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error ? `${data.error.message} (código ${data.error.code})` : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.meta = data.error;
    throw err;
  }
  return data;
}

// Intenta varias listas de métricas (no todas aplican a todos los tipos de post).
async function mediaInsights(mediaId, token) {
  const sets = ['reach,saved,shares,views,total_interactions', 'reach,saved,shares,total_interactions', 'reach,saved'];
  for (const metric of sets) {
    try {
      const r = await graph(`/${mediaId}/insights`, { metric }, token);
      const out = {};
      for (const m of r.data || []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
      return out;
    } catch {
      /* probar el siguiente set */
    }
  }
  return {};
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function sync({ db, secrets, save, log = console }) {
  const token = secrets.get('meta_token');
  if (!token) throw new Error('Falta el token de Meta (Ajustes → Integraciones).');
  const cfg = db.config.meta || {};
  const result = { fecha: new Date().toISOString(), avisos: [] };

  // 1) IDs: página → cuenta de Instagram
  const pageId = cfg.page_id || '1393448887191181';
  let igId = cfg.ig_user_id || '';
  let pageToken = token;
  try {
    const page = await graph(`/${pageId}`, { fields: 'id,name,followers_count,fan_count,access_token,instagram_business_account' }, token);
    if (page.access_token) pageToken = page.access_token;
    if (page.instagram_business_account?.id) igId = page.instagram_business_account.id;
    result.facebook = { nombre: page.name, seguidores: page.followers_count ?? page.fan_count ?? null };
  } catch (e) {
    result.avisos.push('Página de Facebook: ' + e.message);
  }
  if (!igId) igId = '17841436248985036';

  // 2) Cuenta de Instagram
  const acct = await graph(`/${igId}`, { fields: 'id,username,name,followers_count,follows_count,media_count,profile_picture_url,biography' }, token);
  result.instagram = acct;

  // 3) Alcance e interacciones de los últimos 7 días
  const until = Math.floor(Date.now() / 1000);
  const since = until - 7 * 86400;
  try {
    const ins = await graph(`/${igId}/insights`, {
      metric: 'reach,accounts_engaged,total_interactions,profile_views',
      period: 'day',
      metric_type: 'total_value',
      since,
      until,
    }, token);
    result.semana = {};
    for (const m of ins.data || []) result.semana[m.name] = m.total_value?.value ?? null;
  } catch (e) {
    result.avisos.push('Insights de la cuenta: ' + e.message);
  }

  // 4) Publicaciones recientes con sus métricas
  try {
    const media = await graph(`/${igId}/media`, {
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url',
      limit: 30,
    }, token);
    const list = [];
    for (const m of media.data || []) {
      const ins = await mediaInsights(m.id, token);
      list.push({
        id: m.id,
        fecha: m.timestamp,
        tipo: m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carrusel' : m.media_type === 'VIDEO' ? 'Video' : 'Foto',
        texto: (m.caption || '').slice(0, 300),
        hashtags: ((m.caption || '').match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase()).slice(0, 30),
        link: m.permalink,
        imagen: m.thumbnail_url || m.media_url || '',
        likes: m.like_count ?? 0,
        comentarios: m.comments_count ?? 0,
        alcance: ins.reach ?? null,
        guardados: ins.saved ?? null,
        compartidos: ins.shares ?? null,
        vistas: ins.views ?? null,
        interacciones: ins.total_interactions ?? (m.like_count || 0) + (m.comments_count || 0),
      });
    }
    result.media = list;
  } catch (e) {
    result.avisos.push('Publicaciones: ' + e.message);
  }

  // 5) Audiencia (Meta la entrega solo con 100+ seguidores)
  try {
    const aud = {};
    for (const breakdown of ['age', 'gender', 'city']) {
      const r = await graph(`/${igId}/insights`, { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown }, token);
      const res = r.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
      aud[breakdown] = res.map((x) => ({ clave: x.dimension_values?.[0], valor: x.value })).sort((a, b) => b.valor - a.valor).slice(0, 6);
    }
    result.audiencia = aud;
  } catch {
    result.audiencia = null;
  }

  // 6) Meta Ads: gasto del mes
  const adAccount = cfg.ad_account_id || '1106447822144902';
  try {
    const acc = await graph(`/act_${adAccount}`, { fields: 'currency,amount_spent,name' }, token);
    const ins = await graph(`/act_${adAccount}/insights`, { fields: 'spend,impressions,reach,clicks,cpm,actions', date_preset: 'this_month' }, token);
    const camp = await graph(`/act_${adAccount}/insights`, { fields: 'campaign_name,spend,reach,impressions,clicks,actions', date_preset: 'this_month', level: 'campaign' }, token);
    const row = ins.data?.[0] || {};
    result.ads = {
      moneda: acc.currency || 'CLP',
      gasto_mes: Number(row.spend || 0),
      alcance: Number(row.reach || 0),
      impresiones: Number(row.impressions || 0),
      clics: Number(row.clicks || 0),
      campanas: (camp.data || []).map((c) => ({
        nombre: c.campaign_name,
        gasto: Number(c.spend || 0),
        alcance: Number(c.reach || 0),
        clics: Number(c.clicks || 0),
        seguidores: Number((c.actions || []).find((a) => a.action_type === 'follow' || a.action_type === 'onsite_conversion.follow')?.value || 0) || null,
      })),
    };
  } catch (e) {
    result.avisos.push('Meta Ads: ' + e.message);
  }

  // --- guardar en la base ---
  db.meta = { ...result, ig_user_id: igId, page_id: pageId, ad_account_id: adAccount };
  const hoy = ymd(new Date());
  const reg = {
    fecha: hoy,
    seguidores: acct.followers_count ?? null,
    alcance: result.semana?.reach ?? null,
    interacciones: result.semana?.total_interactions ?? null,
    fb_seguidores: result.facebook?.seguidores ?? null,
    fuente: 'meta',
  };
  const i = db.metricas.findIndex((m) => m.fecha === hoy && m.fuente === 'meta');
  if (i >= 0) db.metricas[i] = { ...db.metricas[i], ...reg };
  else db.metricas.push({ id: 'meta-' + hoy, ...reg });
  if (acct.followers_count != null) db.config.seguidores = acct.followers_count;

  if (result.ads) {
    const mes = hoy.slice(0, 7);
    const movId = 'meta-ads-' + mes;
    const mov = {
      id: movId,
      tipo: 'Gasto',
      fecha: hoy,
      categoria: 'Meta Ads',
      moneda: result.ads.moneda === 'USD' ? 'USD' : 'CLP',
      monto: Math.round(result.ads.gasto_mes),
      descripcion: 'Meta Ads del mes (automático)',
      automatico: true,
    };
    const j = db.movimientos.findIndex((m) => m.id === movId);
    if (j >= 0) db.movimientos[j] = mov;
    else if (mov.monto > 0) db.movimientos.push(mov);
  }

  // Enlazar métricas con la grilla cuando el link coincide
  for (const p of db.posts) {
    const norm = (u) => String(u || '').split('?')[0].replace(/\/$/, '');
    const m = (result.media || []).find((x) => (p.publicado_ig_id && x.id === p.publicado_ig_id) || (p.link && x.link && norm(p.link) === norm(x.link)));
    if (m) {
      p.alcance = m.alcance;
      p.interacciones = m.interacciones;
      p.vistas = m.vistas;
      p.ig_media_id = m.id;
      if (!p.link) p.link = m.link;
      if (p.estado !== 'Publicado') p.estado = 'Publicado';
    }
  }

  save();
  log.log(`[meta] sincronizado: ${acct.followers_count} seguidores, ${(result.media || []).length} posts, avisos: ${result.avisos.length}`);
  return result;
}

module.exports = { sync, graph };
