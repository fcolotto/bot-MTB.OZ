console.log('[message] wrapper v2 loaded');
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

// =========================
// Helpers
// =========================
function norm(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')            // saca acentos
    .replace(/[¿?¡!.,;:()[\]{}"']/g, ' ')      // saca puntuación
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

function formatArs(n) {
  if (typeof n !== 'number') return '';
  return `$ ${n.toLocaleString('es-AR')}`;
}

function extractProductNameFromUserText(userText) {
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

// =========================
// Ozone SunStick
// =========================
const SUNSTICKS = [
  {
    name: 'SunStick FPS 45+ Light',
    price: 28600,
    transfer: 25740,
    url: 'https://www.ozonelifestyle.com/productos/sunstick-fps-45-light/'
  },
  {
    name: 'SunStick FPS 45+ Medium',
    price: 28600,
    transfer: 25740,
    url: 'https://www.ozonelifestyle.com/productos/sunstick-fps-45-medium/'
  },
  {
    name: 'SunStick FPS 45+ Dark',
    price: 28600,
    transfer: 25740,
    url: 'https://www.ozonelifestyle.com/productos/sunstick-fps-45-dark/'
  }
];

const OZONE_TONES_URL = 'https://www.ozonelifestyle.com/tonos/';
const OZONE_KIDS_URL = 'https://www.ozonelifestyle.com/kids/';

function isAskSunProtection(t) {
  return (
    t.includes('proteccion solar') ||
    t.includes('protector solar') ||
    t.includes('fps')
  );
}

function mentionsSunstick(t) {
  return /\bsun\s*-?\s*stick\b/.test(t);
}

function mentionsKids(t) {
  return (
    /\bkids?\b/.test(t) ||
    /\bni(n|ñ)os?\b/.test(t) ||
    t.includes('infantil') ||
    t.includes('bebe') ||
    t.includes('bebé')
  );
}

function isAskPrice(t) {
  return (
    /\bprecio(s)?\b/.test(t) ||
    /\bcuanto cuesta\b/.test(t) ||
    /\bcuanto sale\b/.test(t) ||
    /\bvalor\b/.test(t)
  );
}

function isAskColorsOrTones(t) {
  return /\bcolor(es)?\b/.test(t) || /\btono(s)?\b/.test(t);
}

// “y el kids?” / “y el de chicos?” etc.
function isJustKidsReference(t) {
  return (
    t === 'kids' ||
    t === 'el kids' ||
    t === 'y el kids' ||
    t.includes('y el kids') ||
    t.includes('el kids') ||
    t.includes('de chicos') ||
    t.includes('para chicos') ||
    t.includes('para ninos') ||
    t.includes('para niños') ||
    t.includes('infantil')
  );
}

// “y el normal?” / “y el comun?” / “adulto?”
function isJustAdultReference(t) {
  return (
    t.includes('normal') ||
    t.includes('comun') ||
    t.includes('común') ||
    t.includes('adulto') ||
    t.includes('de adultos')
  );
}

function replyKidsPrice(res) {
  return res.status(200).json({
    text:
      `Para **SunStick Kids**, el precio y los colores están siempre actualizados en la tienda 👇\n\n` +
      `Dato importante: es un protector pensado para chicos y se puede usar desde bebés.\n` +
      `Colores: **Azul / Verde / Amarillo**.`,
    links: [{ label: 'SunStick Kids (colores y precio)', url: OZONE_KIDS_URL }],
    meta: { intent: 'price', status: 'ok', product: 'sunstick_kids' }
  });
}

function replyAdultPrice(res) {
  const lines = SUNSTICKS.map(
    (x) =>
      `• ${x.name}: ${formatArs(x.price)}. ` +
      `Pagando por transferencia: ${formatArs(x.transfer)}.`
  ).join('\n');

  return res.status(200).json({
    text:
      `${lines}\n\n` +
      `Los tonos son **Light / Medium / Dark** (y también **Blanco** en la guía de tonos).\n` +
      `Guía de tonos 👇`,
    links: [
      { label: 'SunStick Light', url: SUNSTICKS[0].url },
      { label: 'SunStick Medium', url: SUNSTICKS[1].url },
      { label: 'SunStick Dark', url: SUNSTICKS[2].url },
      { label: 'Ver todos los tonos', url: OZONE_TONES_URL },
      { label: 'SunStick Kids', url: OZONE_KIDS_URL }
    ],
    meta: { intent: 'price', status: 'ok', product: 'sunstick' }
  });
}

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const userId = body.user_id || body.userId || body.from || 'unknown';
    const session = getSession(userId);

    const userText = String(body.text || '').trim();
    const t = norm(userText);

    // ======================================================
    // 0) Atajos conversacionales anclados a memoria (UX)
    // ======================================================

    // A) Pregunta por protección solar + venía hablando de un producto
    if (isAskSunProtection(t) && session.lastProductName && !mentionsSunstick(t)) {
      return res.status(200).json({
        text:
          `**${session.lastProductName}** no tiene protección solar.\n\n` +
          `Si buscás protección, en **Ozone Lifestyle** tenemos los **SunStick FPS 45+** (formato barra, sustentables).\n` +
          `¿Querés que te pase el **precio** y los links a los tonos?`,
        links: [
          { label: 'Ver tonos SunStick (Ozone)', url: OZONE_TONES_URL },
          { label: 'SunStick Kids (Ozone)', url: OZONE_KIDS_URL }
        ],
        meta: { intent: 'sun', status: 'ok' }
      });
    }

    // A1) “y el kids?” aunque no diga "sunstick" (usa memoria si venía de SunStick)
    if (isJustKidsReference(t) && (session.lastProductName === 'SunStick' || session.lastProductName === 'SunStick Kids')) {
      session.lastProductName = 'SunStick Kids';
      return replyKidsPrice(res);
    }

    // A2) “y el normal/adulto?” desde Kids
    if (isJustAdultReference(t) && (session.lastProductName === 'SunStick Kids' || session.lastProductName === 'SunStick')) {
      session.lastProductName = 'SunStick';
      return replyAdultPrice(res);
    }

    // A3) Si quedaron hablando de SunStick Kids y preguntan colores/tonos
    if (session.lastProductName === 'SunStick Kids' && isAskColorsOrTones(t)) {
      return res.status(200).json({
        text:
          `Los colores de **SunStick Kids** son: **Azul / Verde / Amarillo**.\n` +
          `Acá podés verlos (con precio actualizado) 👇`,
        links: [{ label: 'SunStick Kids (colores y precio)', url: OZONE_KIDS_URL }],
        meta: { intent: 'kids_colors', status: 'ok', product: 'sunstick_kids' }
      });
    }

    // A4) Si quedaron hablando de SunStick y preguntan tonos/colores
    if (session.lastProductName === 'SunStick' && isAskColorsOrTones(t)) {
      return res.status(200).json({
        text:
          `Los tonos de **SunStick** son: **Blanco / Light / Medium / Dark**.\n` +
          `Acá podés verlos (y elegir) 👇`,
        links: [{ label: 'Ver tonos SunStick (Ozone)', url: OZONE_TONES_URL }],
        meta: { intent: 'tones', status: 'ok', product: 'sunstick' }
      });
    }

    // B) Precio SunStick Kids (aunque diga "sunstick kids")
    if (mentionsSunstick(t) && mentionsKids(t) && isAskPrice(t)) {
      session.lastProductName = 'SunStick Kids';
      return replyKidsPrice(res);
    }

    // C) Precio SunStick (adulto)
    if (mentionsSunstick(t) && isAskPrice(t)) {
      session.lastProductName = 'SunStick';
      return replyAdultPrice(res);
    }

    // EXTRA: si dice “kids” sin “sunstick” (primera mención), igual lo atendemos
    if (mentionsKids(t) && isAskPrice(t)) {
      session.lastProductName = 'SunStick Kids';
      return replyKidsPrice(res);
    }

    // ======================================================
    // 1) Autocomplete intents cortos usando lastProductName
    // ======================================================
    let effectiveText = userText;

    if (session.lastProductName) {
      // Para SunStick / Kids: resolvemos acá "precio" y "link"
      if (isBarePrice(t) && (session.lastProductName === 'SunStick' || session.lastProductName === 'SunStick Kids')) {
        if (session.lastProductName === 'SunStick Kids') return replyKidsPrice(res);
        return replyAdultPrice(res);
      }

      if (isBareLink(t) && (session.lastProductName === 'SunStick' || session.lastProductName === 'SunStick Kids')) {
        if (session.lastProductName === 'SunStick Kids') {
          return res.status(200).json({
            text: `Acá tenés el link de **SunStick Kids** 👇`,
            links: [{ label: 'SunStick Kids', url: OZONE_KIDS_URL }],
            meta: { intent: 'link', status: 'ok', product: 'sunstick_kids' }
          });
        }
        return res.status(200).json({
          text: `Acá tenés la guía de tonos de **SunStick** 👇`,
          links: [{ label: 'Ver tonos SunStick', url: OZONE_TONES_URL }],
          meta: { intent: 'link', status: 'ok', product: 'sunstick' }
        });
      }

      // Default: autocomplete hacia el core para productos de Maria T
      if (isBarePrice(t)) effectiveText = `cuanto cuesta ${session.lastProductName}`;
      else if (isBareLink(t)) effectiveText = `link de ${session.lastProductName}`;
      else if (isBareHow(t)) effectiveText = `como se usa ${session.lastProductName}`;
    }

    // ======================================================
    // 2) Llamar al core
    // ======================================================
    const result = await handleMessage({ ...body, text: effectiveText });

    // ======================================================
    // 3) Guardar lastProductName desde el texto del usuario
    // ======================================================
    const inferred = extractProductNameFromUserText(userText);
    if (inferred) {
      session.lastProductName = inferred;
    }

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
