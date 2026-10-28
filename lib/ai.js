'use strict';
// Generación de textos con Claude (API de Anthropic).

const API = 'https://api.anthropic.com/v1/messages';

const MAIA = `Eres el equipo creativo de Maia Cruz (@maiacruz.ia), una creadora de contenido digital hecha con IA.
Perfil de Maia: mujer de 28 años, surfista, viajera relajada, comida sana y outdoor en Chile. Habla en español de Chile, cercana y cálida, de "ustedes".
Reglas de marca obligatorias:
- Español chileno natural, pero NUNCA usar la muletilla "po".
- Nada de groserías ni de prometer cosas falsas.
- En guiones para voz, los nombres de lugares difíciles se escriben con guiones por sílaba la primera vez (ej.: Pi-chi-le-mu), para que la voz los pronuncie bien.
- Cada texto de post termina con la línea "✨ Maia es un personaje digital creado con IA." y luego máximo 5 hashtags, siempre incluyendo #rutasdemaia.
- Reels de 7 a 10 segundos: el guion hablado debe caber en ese tiempo (máximo ~25 palabras), con gancho en los primeros 2 segundos.
- Si hay una marca, se menciona de forma natural, sin sonar a aviso.`;

async function ask({ key, model, system, prompt, maxTokens = 1200 }) {
  if (!key) throw new Error('Falta la API key de Anthropic (Ajustes → Integraciones).');
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-5-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || 'Error de la API de Anthropic ' + res.status);
  return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió un formato válido. Intenta de nuevo.');
  return JSON.parse(m[0]);
}

async function guion({ key, model, titulo, formato, notas, marca }) {
  const prompt = `Crea el contenido para esta pieza de Maia:
- Título / tema: ${titulo}
- Formato: ${formato || 'Reel'}
${marca ? `- Marca: ${marca}\n` : ''}${notas ? `- Notas: ${notas}\n` : ''}
Responde SOLO con un JSON con estas claves:
{"guion": "lo que dice Maia en cámara (para Reel) o el texto de cada foto (para Carrusel, numerado)",
 "escena": "descripción breve en inglés de la escena para generar el video o la imagen (lugar, luz, acción, ropa de Maia)",
 "texto": "texto completo del post para Instagram, con emojis moderados, la línea de aviso de IA y los hashtags al final",
 "hashtags": ["#..."]}`;
  return parseJson(await ask({ key, model, system: MAIA, prompt }));
}

async function ideas({ key, model, cantidad = 10, categoria, existentes = [] }) {
  const prompt = `Propón ${cantidad} ideas nuevas de contenido para Maia${categoria ? ` en la categoría "${categoria}"` : ''}.
Mezcla surf, cerro/outdoor, comida sana, viajes por Chile y detrás de cámara. Que sean concretas (lugar o situación real de Chile) y fáciles de producir con IA.
No repitas estas ideas ya existentes: ${existentes.slice(0, 60).join(' | ') || 'ninguna'}.
Responde SOLO con un JSON: {"ideas": [{"titulo": "...", "categoria": "Surf|Outdoor|Comida sana|Viajes|Detrás de cámara|Marca", "formato": "Reel|Carrusel|Foto|Story", "notas": "gancho o ángulo en una frase"}]}`;
  return parseJson(await ask({ key, model, system: MAIA, prompt, maxTokens: 2000 })).ideas || [];
}

async function pitch({ key, model, marca, stats, tarifas }) {
  const prompt = `Escribe un correo de propuesta de colaboración de Maia Cruz para la marca "${marca.nombre}" (${marca.categoria || ''}).
Idea de colaboración: ${marca.idea || 'a definir'}.
Notas: ${marca.notas || '-'}.
Datos actuales de Maia: ${stats}.
Paquetes disponibles: ${tarifas}.
Tono: cercano, profesional y corto (máximo 170 palabras). Debe decir claramente que Maia es un personaje digital creado con IA. Firma: Maia Cruz · hola@maiacruz.cl · maiacruz.cl
Responde SOLO con un JSON: {"asunto": "...", "cuerpo": "..."}`;
  return parseJson(await ask({ key, model, system: MAIA, prompt }));
}

module.exports = { guion, ideas, pitch };
