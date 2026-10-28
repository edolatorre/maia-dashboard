'use strict';
// Archivos para publicar: se guardan en DATA_DIR/uploads con nombre aleatorio y se sirven en /m/<nombre>
// (Meta necesita una URL pública para descargar el video o la foto al publicar).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const MAX_BYTES = 250 * 1024 * 1024;
const VIDEO = ['.mp4', '.mov'];
const IMAGE = ['.jpg', '.jpeg', '.png', '.webp'];

let sharp = null;
try { sharp = require('sharp'); } catch { sharp = null; }

module.exports = function createMedia(dataDir) {
  const dir = path.join(dataDir, 'uploads');
  fs.mkdirSync(dir, { recursive: true });

  function newName(ext) {
    return crypto.randomBytes(12).toString('hex') + ext;
  }

  // Fotos: Instagram exige JPG y proporción entre 4:5 y 1.91:1. Si es más alta (p. ej. 9:16) se recorta al centro a 4:5.
  async function normalizeImage(file) {
    if (!sharp) return file;
    const img = sharp(file);
    const meta = await img.metadata();
    let pipelineImg = sharp(file).rotate();
    const ratio = meta.width / meta.height;
    if (ratio < 0.8) {
      const h = Math.round(meta.width / 0.8);
      pipelineImg = pipelineImg.extract({ left: 0, top: Math.max(0, Math.round((meta.height - h) / 2)), width: meta.width, height: Math.min(h, meta.height) });
    } else if (ratio > 1.91) {
      const w = Math.round(meta.height * 1.91);
      pipelineImg = pipelineImg.extract({ left: Math.round((meta.width - w) / 2), top: 0, width: w, height: meta.height });
    }
    const out = file.replace(/\.[a-z0-9]+$/i, '') + '-ig.jpg';
    await pipelineImg.jpeg({ quality: 90 }).toFile(out);
    if (out !== file) fs.unlink(file, () => {});
    return out;
  }

  async function finalize(tmpPath, ext) {
    if (IMAGE.includes(ext)) {
      const out = await normalizeImage(tmpPath);
      return { nombre: path.basename(out), tipo: 'imagen' };
    }
    return { nombre: path.basename(tmpPath), tipo: 'video' };
  }

  function extOf(name) {
    const ext = path.extname(String(name || '')).toLowerCase();
    if (![...VIDEO, ...IMAGE].includes(ext)) throw new Error('Formato no permitido. Usa MP4/MOV para video o JPG/PNG/WEBP para fotos.');
    return ext;
  }

  // Subida directa (cuerpo binario de la petición)
  async function fromRequest(req, originalName) {
    const ext = extOf(originalName);
    const file = path.join(dir, newName(ext));
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) req.destroy(new Error('Archivo demasiado grande (máx. 250 MB).'));
    });
    await pipeline(req, fs.createWriteStream(file));
    return finalize(file, ext);
  }

  // Importar desde un link (por ejemplo, el resultado de Higgsfield)
  async function fromUrl(url) {
    if (!/^https:\/\//.test(url || '')) throw new Error('El link debe empezar con https://');
    const u = new URL(url);
    const ext = extOf(u.pathname);
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error('No se pudo descargar el archivo (' + res.status + ').');
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('Archivo demasiado grande (máx. 250 MB).');
    const file = path.join(dir, newName(ext));
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
    return finalize(file, ext);
  }

  function filePath(nombre) {
    if (!/^[a-f0-9]{24}(-ig)?\.(mp4|mov|jpg|jpeg|png|webp)$/i.test(nombre || '')) return null;
    const p = path.join(dir, nombre);
    return fs.existsSync(p) ? p : null;
  }

  function remove(nombre) {
    const p = filePath(nombre);
    if (p) fs.unlink(p, () => {});
  }

  return { dir, fromRequest, fromUrl, filePath, remove };
};
