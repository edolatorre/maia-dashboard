// Revisor de textos de Maia: se usa en el navegador (window.Revisor) y en el servidor (require).
(function (root) {
  'use strict';
  const AVISO_IA = /(personaje digital|cread[oa] con (ia|inteligencia artificial)|generad[oa] con (ia|inteligencia artificial)|hech[oa] con (ia|inteligencia artificial)|#creadoconia|#aigenerated|#hechoconia)/i;
  const PUBLICIDAD = /(#publicidad|#publi\b|#colaboraci[oó]n|#colab\b|#canje|#ad\b|colaboraci[oó]n pagada|en colaboraci[oó]n con|publicidad)/i;
  const TESTIMONIO = /(?<![\p{L}])(lo prob[ée]|la prob[ée]|los prob[ée]|las prob[ée]|prob[ée] (el|la|los|las|este|esta)|lo uso|la uso|los uso|las uso|yo uso|uso (este|esta|estos|estas)|me funcion[oó]|me cambi[oó] la vida|mi favorit[oa]|me encant[oó] usar|lo compr[ée]|la compr[ée]|me lo puse|me la puse)(?![\p{L}])/iu;

  function revisar({ texto = '', marca = '' } = {}) {
    const t = String(texto || '');
    const out = [];
    const add = (nivel, msg) => out.push({ nivel, msg });
    if (!t.trim()) return [{ nivel: 'error', msg: 'El texto está vacío.' }];

    if (AVISO_IA.test(t)) add('ok', 'Incluye el aviso de que Maia es un personaje creado con IA.');
    else add('error', 'Falta el aviso de IA (ej. "✨ Maia es un personaje digital creado con IA."). Sin esto no se publica.');

    const tags = t.match(/#[\p{L}\p{N}_]+/gu) || [];
    if (tags.length > 5) add('aviso', `Tiene ${tags.length} hashtags; el máximo de Maia es 5.`);
    else add('ok', `${tags.length} hashtag(s) (máx. 5).`);
    const dup = tags.map((x) => x.toLowerCase()).filter((x, i, a) => a.indexOf(x) !== i);
    if (dup.length) add('aviso', 'Hashtag repetido: ' + [...new Set(dup)].join(', '));

    if (/(?<![\p{L}])po(?![\p{L}])/iu.test(t)) add('aviso', 'Usa "po". La voz de Maia lo evita.');

    if (t.length > 2200) add('error', `Tiene ${t.length} caracteres; Instagram permite 2.200.`);
    const primera = t.split('\n')[0];
    if (primera.length > 125) add('aviso', `La primera línea tiene ${primera.length} caracteres; Instagram corta en ~125 antes del "más".`);

    if (!/[?¿]/.test(t)) add('tip', 'Sin pregunta al público: una pregunta al final ayuda a los comentarios.');

    if (String(marca || '').trim()) {
      if (PUBLICIDAD.test(t)) add('ok', 'La colaboración con la marca está declarada.');
      else add('aviso', 'Post de marca sin declarar la colaboración: agrega #publicidad o "en colaboración con…" y activa la etiqueta de colaboración pagada.');
    }
    if (TESTIMONIO.test(t)) add('aviso', 'Parece un testimonio de uso ("lo probé", "lo uso"…). Maia no puede decir que usó un producto o servicio.');
    return out;
  }
  function bloqueos(post) {
    return revisar(post).filter((x) => x.nivel === 'error').map((x) => x.msg);
  }
  const api = { revisar, bloqueos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Revisor = api;
})(typeof window !== 'undefined' ? window : this);
