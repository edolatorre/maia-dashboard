'use strict';
// Generador de láminas: arma imágenes 1080x1350 (4:5) para Instagram a partir de fotos ya generadas.
// No usa créditos: todo se dibuja en el navegador con <canvas>.
(function () {
  const W = 1080, H = 1350;
  const C = { navy: '#0F2A33', coral: '#E8613C', teal: '#2E8C8A', cream: '#FBF8F2', sand: '#F4EEE4', muted: '#5B6E76' };
  const PLANTILLAS = {
    portada: 'Portada (foto + título)',
    frase: 'Frase sobre foto',
    tip: 'Tip numerado (fondo crema)',
    texto: 'Texto (fondo crema, sin número)',
    cierre: 'Cierre (llamado a la acción)',
  };
  const imgCache = new Map();

  function loadImg(nombre) {
    if (!nombre) return Promise.resolve(null);
    if (imgCache.has(nombre)) return imgCache.get(nombre);
    const p = new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = '/m/' + nombre;
    });
    imgCache.set(nombre, p);
    return p;
  }
  async function fontsReady() {
    try {
      await Promise.all([
        document.fonts.load('600 80px Oswald'),
        document.fonts.load('400 40px "DM Sans"'),
        document.fonts.load('700 40px "DM Sans"'),
        document.fonts.load('italic 500 60px "Playfair Display"'),
      ]);
    } catch { /* usa fuentes del sistema */ }
  }
  function cover(ctx, im, x, y, w, h, focoY = 0.35) {
    const r = Math.max(w / im.width, h / im.height);
    const sw = w / r, sh = h / r;
    const sx = (im.width - sw) / 2;
    const sy = Math.max(0, Math.min(im.height - sh, (im.height - sh) * focoY));
    ctx.drawImage(im, sx, sy, sw, sh, x, y, w, h);
  }
  function wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); continue; }
      let line = words[0];
      for (const w of words.slice(1)) {
        if (ctx.measureText(line + ' ' + w).width <= maxW) line += ' ' + w;
        else { out.push(line); line = w; }
      }
      out.push(line);
    }
    return out;
  }
  // Escribe un bloque de texto ajustando el tamaño para que quepa en maxH
  function bloque(ctx, text, { x, y, maxW, maxH, size, minSize = 28, font, color, lineH = 1.25, align = 'left', baseline = 'top' }) {
    let s = size, lines;
    for (;;) {
      ctx.font = font.replace('{s}', s);
      lines = wrap(ctx, text, maxW);
      if (lines.length * s * lineH <= maxH || s <= minSize) break;
      s -= 2;
    }
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    const total = lines.length * s * lineH;
    let yy = baseline === 'bottom' ? y - total : baseline === 'middle' ? y - total / 2 : y;
    for (const l of lines) { ctx.fillText(l, x, yy); yy += s * lineH; }
    return { height: total, size: s };
  }
  function pie(ctx, { claro, pagina, total }) {
    ctx.font = '700 30px "DM Sans", sans-serif';
    ctx.fillStyle = claro ? 'rgba(255,255,255,.9)' : C.navy;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('@maiacruz.ia', 80, H - 70);
    if (pagina && total > 1) {
      ctx.textAlign = 'right';
      ctx.font = '400 28px "DM Sans", sans-serif';
      ctx.fillStyle = claro ? 'rgba(255,255,255,.8)' : C.muted;
      ctx.fillText(pagina < total ? `${pagina}/${total}  Desliza →` : `${pagina}/${total}`, W - 80, H - 70);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  async function render(slide, canvas, meta = {}) {
    await fontsReady();
    canvas = canvas || document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const im = await loadImg(slide.foto);
    const t = slide.plantilla || 'tip';
    const foco = slide.foco != null ? Number(slide.foco) : 0.35;

    if (t === 'portada' || t === 'frase') {
      ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, H);
      if (im) cover(ctx, im, 0, 0, W, H, foco);
      if (t === 'portada') {
        const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
        g.addColorStop(0, 'rgba(15,42,51,0)'); g.addColorStop(1, 'rgba(15,42,51,.92)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        let bottom = H - 150;
        if (slide.texto) bottom -= bloque(ctx, slide.texto, { x: 80, y: bottom, maxW: W - 160, maxH: 180, size: 40, font: '400 {s}px "DM Sans", sans-serif', color: 'rgba(255,255,255,.92)', baseline: 'bottom' }).height + 24;
        bottom -= bloque(ctx, (slide.titulo || '').toUpperCase(), { x: 80, y: bottom, maxW: W - 160, maxH: 460, size: 104, minSize: 56, font: '600 {s}px Oswald, sans-serif', color: '#fff', lineH: 1.08, baseline: 'bottom' }).height + 22;
        if (slide.etiqueta) {
          ctx.font = '700 30px "DM Sans", sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          const label = slide.etiqueta.toUpperCase();
          const lw = ctx.measureText(label).width + 44;
          ctx.fillStyle = C.coral; roundRect(ctx, 80, bottom - 56, lw, 56, 28); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillText(label, 102, bottom - 18);
        }
      } else {
        ctx.fillStyle = 'rgba(15,42,51,.42)'; ctx.fillRect(0, 0, W, H);
        bloque(ctx, slide.titulo || '', { x: W / 2, y: H / 2 - 40, maxW: W - 200, maxH: 640, size: 84, minSize: 44, font: 'italic 500 {s}px "Playfair Display", Georgia, serif', color: '#fff', lineH: 1.2, align: 'center', baseline: 'middle' });
        if (slide.texto) bloque(ctx, slide.texto, { x: W / 2, y: H - 230, maxW: W - 200, maxH: 120, size: 34, font: '400 {s}px "DM Sans", sans-serif', color: 'rgba(255,255,255,.9)', align: 'center', baseline: 'bottom' });
      }
      pie(ctx, { claro: true, ...meta });
    } else if (t === 'cierre') {
      ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, H);
      if (im) {
        ctx.save(); ctx.beginPath(); ctx.arc(W / 2, 330, 170, 0, Math.PI * 2); ctx.clip();
        cover(ctx, im, W / 2 - 170, 160, 340, 340, foco); ctx.restore();
        ctx.strokeStyle = C.coral; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(W / 2, 330, 174, 0, Math.PI * 2); ctx.stroke();
      }
      const y0 = im ? 580 : 300;
      const h1 = bloque(ctx, (slide.titulo || '¿Cuál agregarías?').toUpperCase(), { x: W / 2, y: y0, maxW: W - 180, maxH: 300, size: 88, minSize: 50, font: '600 {s}px Oswald, sans-serif', color: '#fff', lineH: 1.1, align: 'center' });
      bloque(ctx, slide.texto || 'Cuéntame en los comentarios 👇\nGuarda este post para tu próximo finde 🔖', { x: W / 2, y: y0 + h1.height + 40, maxW: W - 200, maxH: 300, size: 40, font: '400 {s}px "DM Sans", sans-serif', color: 'rgba(255,255,255,.88)', align: 'center', lineH: 1.4 });
      ctx.font = '400 24px "DM Sans", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('✨ Maia es un personaje digital creado con IA', W / 2, H - 130);
      pie(ctx, { claro: true, ...meta });
    } else {
      // tip / texto: fondo crema
      ctx.fillStyle = C.cream; ctx.fillRect(0, 0, W, H);
      let y = 120;
      const sinFoto = !im;
      if (sinFoto) y = 300;
      if (im) {
        ctx.save(); roundRect(ctx, 80, 100, W - 160, 560, 36); ctx.clip();
        cover(ctx, im, 80, 100, W - 160, 560, foco); ctx.restore();
        y = 720;
      }
      if (t === 'tip' && slide.numero) {
        ctx.font = '600 130px Oswald, sans-serif'; ctx.fillStyle = C.coral; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(String(slide.numero).padStart(2, '0'), 80, y - 10);
        y += 150;
      }
      if (slide.etiqueta) {
        ctx.font = '700 28px "DM Sans", sans-serif'; ctx.fillStyle = C.teal; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(slide.etiqueta.toUpperCase(), 80, y); y += 52;
      }
      const restante = H - 170 - y;
      const ht = bloque(ctx, (slide.titulo || '').toUpperCase(), { x: 80, y, maxW: W - 160, maxH: Math.min(sinFoto ? 340 : 260, restante * 0.45), size: sinFoto ? 96 : 72, minSize: 44, font: '600 {s}px Oswald, sans-serif', color: C.navy, lineH: 1.1 });
      y += ht.height + (sinFoto ? 40 : 26);
      if (sinFoto) { ctx.fillStyle = C.coral; ctx.fillRect(80, y, 120, 8); y += 48; }
      if (slide.texto) bloque(ctx, slide.texto, { x: 80, y, maxW: W - 160, maxH: H - 170 - y, size: sinFoto ? 50 : 40, minSize: 26, font: '400 {s}px "DM Sans", sans-serif', color: '#22404A', lineH: 1.4 });
      pie(ctx, { claro: false, ...meta });
    }
    return canvas;
  }

  async function toBlob(canvas) {
    return new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  }
  async function subirCanvas(canvas, nombre = 'lamina.jpg') {
    const blob = await toBlob(canvas);
    const res = await fetch('/api/upload?name=' + encodeURIComponent(nombre), { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Requested-With': 'maia' }, body: blob });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Error al subir la lámina');
    return d;
  }
  // Renderiza todas las láminas, las sube y crea o actualiza la publicación (queda en "Aprobación", sin publicarse sola)
  async function guardar({ postId, titulo, texto, fecha, hora, slides }) {
    if (!slides?.length) throw new Error('Agrega al menos una lámina.');
    if (slides.length > 10) throw new Error('Instagram permite máximo 10 láminas por carrusel.');
    const archivos = [];
    for (let i = 0; i < slides.length; i++) {
      const cv = await render(slides[i], null, { pagina: i + 1, total: slides.length });
      const r = await subirCanvas(cv, `lamina-${i + 1}.jpg`);
      archivos.push(`${r.nombre}:${r.tipo}`);
    }
    const body = {
      titulo, texto, fecha: fecha || '', hora: hora || '', formato: slides.length > 1 ? 'Carrusel' : 'Foto', plataformas: 'IG', pub_ig: true, pub_fb: false,
      estado: 'Aprobación', auto_publicar: false, archivos: archivos.join(', '), laminas: JSON.stringify(slides), origen: 'laminas',
    };
    const H2 = { 'Content-Type': 'application/json', 'X-Requested-With': 'maia' };
    const res = await fetch(postId ? `/api/posts/${postId}` : '/api/posts', { method: postId ? 'PUT' : 'POST', headers: H2, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'No se pudo guardar');
    return d;
  }

  window.Laminas = { render, guardar, subirCanvas, PLANTILLAS, W, H };
})();
