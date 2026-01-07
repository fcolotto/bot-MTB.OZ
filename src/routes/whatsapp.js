const express = require('express');
const axios = require('axios');

const router = express.Router();

/**
 * =========================
 * Memoria corta por usuario
 * =========================
 * - Guarda el último producto detectado por número (wa_id)
 * - TTL configurable por env (minutos)
 * - Limpieza periódica para que el Map no crezca infinito
 */
const sessions = new Map();

const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 60); // 30 o 60
const SESSION_TTL_MS = SESSION_TTL_MINUTES * 60 * 1000;

const SESSION_CLEANUP_MINUTES = Number(process.env.SESSION_CLEANUP_MINUTES || 5);
const SESSION_CLEANUP_MS = SESSION_CLEANUP_MINUTES * 60 * 1000;

function getSession(userId) {
  const now = Date.now();
  const s = sessions.get(userId);

  if (!s || now - s.updatedAt > SESSION_TTL_MS) {
    const fresh = { lastProduct: null, lastProductAt: 0, updatedAt: now };
    sessions.set(userId, fresh);
    return fresh;
  }

  // sliding TTL: cada mensaje renueva updatedAt
  s.updatedAt = now;
  return s;
}

// Limpieza automática de sesiones expiradas
setInterval(() => {
  const now = Date.now();
  for (const [userId, s] of sessions.entries()) {
    if (!s || now - s.updatedAt > SESSION_TTL_MS) {
      sessions.delete(userId);
    }
  }
}, SESSION_CLEANUP_MS);

/**
 * =========================
 * Helpers WhatsApp payload
 * =========================
 */
function extractWaMessage(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const message = change?.messages?.[0];
  return message || null;
}

function isTextMessage(message) {
  return message?.type === 'text' && message?.text?.body;
}

/**
 * =========================
 * Normalización simple
 * =========================
 */
function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[‐-‒–—−]/g, '-') // unifica guiones raros
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * =========================
 * Intent detection (simple)
 * =========================
 * No queremos “flujos”; queremos entender intención.
 */
function detectIntent(text) {
  const t = normalize(text);

  // precio
  if (
    t === 'precio' ||
    t === 'precios' ||
    t.startsWith('precio ') ||
    t.includes('cuanto cuesta') ||
    t.includes('cuanto sale') ||
    t.includes('valor') ||
    t.includes('sale ')
  )
    return 'price';

  // link / donde comprar
  if (
    t === 'link' ||
    t.includes('link') ||
    t.includes('donde compro') ||
    t.includes('donde comprar') ||
    t.includes('comprar') ||
    t.includes('carrito') ||
    t.includes('web')
  )
    return 'link';

  // para qué sirve / beneficios / qué hace
  if (
    t.includes('para que sirve') ||
    t.includes('beneficios') ||
    t.includes('que hace') ||
    t.includes('que es') ||
    t.includes('sirve para') ||
    t.includes('funciona para')
  )
    return 'benefits';

  // modo de uso / como se usa
  if (
    t.includes('como se usa') ||
    t.includes('modo de uso') ||
    t.includes('como usar') ||
    t.includes('aplicar') ||
    t.includes('rutina')
  )
    return 'how_to_use';

  // estado pedido (muy básico)
  if (t.includes('pedido') || t.includes('seguimiento') || t.includes('envio') || t.includes('estado'))
    return 'order';

  return 'other';
}

/**
 * Consideramos “mensaje intent-only” cuando:
 * - Es muy corto
 * - O es literal “precio / link / info / para que sirve”
 * => en esos casos normalmente falta el producto
 */
function isIntentOnly(text) {
  const t = normalize(text);
  const intentsOnly = new Set([
    'precio',
    'precios',
    'link',
    'info',
    'informacion',
    'información',
    'para que sirve',
    'beneficios',
    'modo de uso',
    'como se usa',
    'cómo se usa',
    'rutina'
  ]);

  if (intentsOnly.has(t)) return true;
  if (t.length <= 6 && (t === 'precio' || t === 'link' || t === 'info')) return true;
  return false;
}

/**
 * =========================
 * Resolver producto (rápido)
 * =========================
 * Llama a tu tienda-api para intentar mapear el texto a un producto real.
 * Guarda lastProduct si hay match.
 */
async function resolveProductByQuery(query) {
  const base = process.env.TIENDA_API_BASE_URL;
  const apiKey = process.env.X_API_KEY;

  if (!base || !apiKey) return null;

  try {
    const resp = await axios.get(`${base}/product`, {
      params: { q: query },
      headers: { 'x-api-key': apiKey },
      timeout: 8000
    });

    // Esperamos algo como { ok:true, product:{ name, price, url, ... } } o similar.
    // No conozco tu schema exacto, así que lo hago tolerante:
    const data = resp?.data || {};
    const product = data.product || data.data?.product || data.result?.product || data;

    const name = product?.name || product?.title || product?.product?.name || null;

    // Si no hay nombre, no lo consideramos válido
    if (!name) return null;

    return {
      name: String(name),
      raw: product
    };
  } catch (e) {
    // Silencioso: si falla resolver, no rompemos el chat
    return null;
  }
}

/**
 * =========================
 * Enviar WhatsApp
 * =========================
 */
async function sendWhatsAppText(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION || 'v24.0';

  if (!token || !phoneId) {
    throw new Error('Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en env');
  }

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

  const resp = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return resp.data;
}

/**
 * =========================
 * GET webhook verification (Meta)
 * =========================
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/**
 * =========================
 * POST webhook (incoming messages)
 * =========================
 * Importante: responder 200 rápido para que Meta no reintente.
 */
router.post('/', async (req, res) => {
  console.log('[wa] webhook hit', JSON.stringify(req.body));

  // responder rápido
  res.sendStatus(200);

  try {
    const message = extractWaMessage(req.body || {});
    if (!message) {
      console.log('[wa] ignored: no message');
      return;
    }

    const from = message.from;

    if (!isTextMessage(message)) {
      console.log('[wa] non-text from=', from);
      await sendWhatsAppText(from, 'Por ahora solo puedo leer mensajes de texto 🙂');
      return;
    }

    const incomingText = message.text.body;
    console.log('[wa] received from=', from, 'text=', incomingText);

    const baseUrl = process.env.PUBLIC_BASE_URL;
    if (!baseUrl) {
      throw new Error('Falta PUBLIC_BASE_URL en env (URL pública del servicio)');
    }

    // =========================
    // Memoria + “fluidez”
    // =========================
    const session = getSession(from);
    const intent = detectIntent(incomingText);

    // 1) Si el usuario no menciona producto y el mensaje es intent-only,
    //    intentamos usar lastProduct (si existe).
    let textForBot = incomingText;

    if (isIntentOnly(incomingText) && session.lastProduct?.name) {
      // En vez de obligar a un flujo, completamos el contexto
      // para que el bot responda “como ChatGPT” sin repreguntar.
      if (intent === 'price') textForBot = `precio de ${session.lastProduct.name}`;
      else if (intent === 'link') textForBot = `link de compra de ${session.lastProduct.name}`;
      else if (intent === 'benefits') textForBot = `para que sirve ${session.lastProduct.name}`;
      else if (intent === 'how_to_use') textForBot = `como se usa ${session.lastProduct.name}`;
    }

    // 2) Si no hay lastProduct y el usuario tiró solo “precio/link/etc”,
    //    hacemos una pregunta mínima (natural), NO un flujo.
    if (isIntentOnly(incomingText) && !session.lastProduct?.name) {
      const ask =
        intent === 'price'
          ? 'Dale 😊 ¿de qué producto querés saber el precio? (por ejemplo: Iuven, Juvenus, Piel Iluminada)'
          : intent === 'link'
          ? 'Dale 😊 ¿de qué producto querés el link para comprar?'
          : intent === 'benefits'
          ? '¿De qué producto querés saber para qué sirve?'
          : intent === 'how_to_use'
          ? '¿De qué producto querés el modo de uso?'
          : '¿Me decís el nombre del producto así te ayudo mejor?';

      await sendWhatsAppText(from, ask);
      console.log('[wa] replied ok (asked for product)');
      return;
    }

    // 3) Intentamos actualizar lastProduct cuando el texto parece un producto.
    //    (No lo hacemos si es claramente una pregunta de pedido, o intent-only)
    //    Para no pegarle a la API todo el tiempo: solo si no actualizamos en los últimos 30s.
    const now = Date.now();
    const shouldTryResolveProduct =
      intent !== 'order' &&
      !isIntentOnly(incomingText) &&
      normalize(incomingText).length >= 3 &&
      now - (session.lastProductAt || 0) > 30 * 1000;

    if (shouldTryResolveProduct) {
      const resolved = await resolveProductByQuery(incomingText);
      if (resolved?.name) {
        session.lastProduct = { name: resolved.name };
        session.lastProductAt = now;
        console.log('[session] lastProduct set to=', resolved.name);
      }
    }

    // Llamamos a TU bot (endpoint /message)
    const botResp = await axios.post(`${baseUrl}/message`, {
      channel: 'whatsapp',
      user_id: from,
      text: textForBot
    });

    const replyText = botResp?.data?.text || 'Perdón, tuve un problema. ¿Querés que te derive con un asesor?';

    await sendWhatsAppText(from, replyText);
    console.log('[wa] replied ok');
  } catch (err) {
    console.error('[wa] error', err?.response?.data || err.message);

    // fallback: intentamos responder algo si podemos obtener el from
    try {
      const message = extractWaMessage(req.body || {});
      const from = message?.from;
      if (from) {
        await sendWhatsAppText(from, 'Perdón, tuve un problema técnico. ¿Querés que te derive con un asesor?');
      }
    } catch (e) {
      console.error('[wa] fallback reply error', e.message);
    }
  }
});

module.exports = router;
