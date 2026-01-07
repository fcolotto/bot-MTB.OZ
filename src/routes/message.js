const express = require('express');
const { handleMessage } = require('../core/messageHandler');

const router = express.Router();

/**
 * =========================
 * Memoria corta en /message
 * =========================
 * - Key: user_id
 * - Guarda lastProductName
 * - TTL: SESSION_TTL_MINUTES (default 30)
 * - Sliding TTL
 */
const sessions = new Map();

const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 30);
const SESSION_TTL_MS = SESSION_TTL_MINUTES * 60 * 1000;

const CLEANUP_MINUTES = Number(process.env.SESSION_CLEANUP_MINUTES || 5);
const CLEANUP_MS = CLEANUP_MINUTES * 60 * 1000;

function getSession(userId) {
  const now = Date.now();
  const s = sessions.get(userId);
  if (!s || now - s.updatedAt > SESSION_TTL_MS) {
    const fresh = { lastProductName: null, updatedAt: now };
    sessions.set(userId, fresh);
    return fresh;
  }
  s.updatedAt = now;
  return s;
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, s] of sessions.entries()) {
    if (!s || now - s.updatedAt > SESSION_TTL_MS) sessions.delete(userId);
  }
}, CLEANUP_MS);

// Normalización simple
function norm(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBarePrice(t) {
  return t === 'precio' || t === 'precios' || t === 'cuanto cuesta' || t === 'cuánto cuesta';
}

function isBareLink(t) {
  return t === 'link' || t === 'pasame el link' || t === 'pasa el link' || t === 'enlace';
}

function isBareHow(t) {
  return t === 'como se usa' || t === 'cómo se usa' || t === 'modo de uso' || t === 'como usar';
}

/**
 * Heurística: si la respuesta fue de intent price ok, o si el texto venía con "cuanto cuesta X",
 * o si el usuario mencionó "precio X", guardamos X como lastProductName.
 *
 * Como no tocamos el core, esto se apoya en:
 * - meta.product_id si viene
 * - el propio texto del usuario
 */
function extractProductNameFromUserText(userText) {
  const t = norm(userText);

  // patrones comunes
  const patterns = [
    /^precio de (.+)$/i,
    /^precio (.+)$/i,
    /^cuanto cuesta (.+)$/i,
    /^cuánto cuesta (.+)$/i,
    /^cuanto sale (.+)$/i,
    /^cuánto sale (.+)$/i,
    /^valor de (.+)$/i
  ];

  for (const re of patterns) {
    const m = String(userText || '').match(re);
    if (m && m[1]) return m[1].trim();
  }

  return null;
}

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const userId = body.user_id || body.userId || body.from || 'unknown';
    const session = getSession(userId);

    const userText = String(body.text || '').trim();
    const t = norm(userText);

    // 1) Autocomplete intents cortos usando lastProductName
    let effectiveText = userText;

    if (session.lastProductName) {
      if (isBarePrice(t)) effectiveText = `cuanto cuesta ${session.lastProductName}`;
      else if (isBareLink(t)) effectiveText = `link de ${session.lastProductName}`;
      else if (isBareHow(t)) effectiveText = `como se usa ${session.lastProductName}`;
    }

    // 2) Llamar al core
    const result = await handleMessage({ ...body, text: effectiveText });

    // 3) Si el usuario preguntó precio de X, guardamos X
    //    Esto arregla tu caso: después "precio" funciona.
    const inferred = extractProductNameFromUserText(userText);
    if (inferred) {
      session.lastProductName = inferred;
    }

    // 4) Si el core devuelve meta.product_id OK y el usuario mencionó algo como "cuanto cuesta X",
    //    mantenemos la inferencia ya guardada arriba.
    //    (Si en el futuro el core te devuelve meta.product_name, acá lo podrías guardar directo.)

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('[message] unhandled error', error.message);
    return res.status(500).json({
      text: 'Ocurrió un error inesperado. Probá de nuevo en unos minutos.',
      links: [],
      meta: { intent: 'error' }
    });
  }
});

module.exports = router;
