// src/core/messageHandler.js
const { detectIntent } = require('./intents');
const {
  composeGreetResponse,
  composeOrderResponse,
  composePriceResponse,
  composePaymentsResponse,
  composeInstallmentsResponse,
  composeShippingResponse,
  composePromosResponse,
  composeInfoResponse,
  composeSunResponse,
  composeOzoneResponse,
  composeSunstickResponse,
  composeFaqResponse,
  composeErrorResponse
} = require('./composer');

const tiendaApi = require('../services/tiendaApi');
const productResolver = require('../services/productResolver');

// ✅ cliente Tiendanube de Ozone (usa token + store_id)
const ozoneTN = require('../services/tiendanubeOzone');

const faqData = require('../data/faq.json');
const ozoneData = require('../data/ozone.json');
const { normalize } = require('./normalize');

/**
 * =========================
 * Memoria corta (RAM)
 * =========================
 * Sirve para follow-ups tipo:
 * - "hola cuanto sale piel iluminada" -> responde ambos
 * - "y la corporal?" -> responde corporal (sin repetir "precio")
 *
 * Nota: se borra en redeploy, pero está bien para WhatsApp.
 */
const shortMemory = new Map();

function memKey(channel, userId) {
  return `${channel}:${userId}`;
}

function getMem(channel, userId) {
  return shortMemory.get(memKey(channel, userId)) || {};
}

function setMem(channel, userId, patch) {
  const key = memKey(channel, userId);
  const prev = shortMemory.get(key) || {};
  shortMemory.set(key, { ...prev, ...patch, ts: Date.now() });
}

function extractProductQuery(text, keywords) {
  const normalized = normalize(text);
  let result = normalized;

  (keywords || []).forEach((keyword) => {
    result = result.replace(normalize(keyword), ' ');
  });

  return result.replace(/\s+/g, ' ').trim();
}

function looksLikePielIluminada(text) {
  const t = normalize(text);
  return t.includes('piel iluminada');
}

function wantsPocketOr50(text) {
  const t = normalize(text);
  return t.includes('pocket') || t.includes('50 ml') || t.includes('50ml') || t.match(/\b50\b/);
}

function wantsCorporalOr195(text) {
  const t = normalize(text);
  return t.includes('corporal') || t.includes('195 ml') || t.includes('195ml') || t.match(/\b195\b/);
}

// heurística simple para decidir "esto es Ozone"
function looksLikeOzonePrice(text) {
  const t = normalize(text);

  // marca explícita
  if (t.includes('ozone') || t.includes('sunstick') || t.includes('kids')) return true;

  const kws = []
    .concat(ozoneData?.keywords || [])
    .concat(ozoneData?.query ? [ozoneData.query] : [])
    .filter(Boolean)
    .map((k) => normalize(k));

  if (kws.length > 0) {
    return kws.some((k) => k && t.includes(k));
  }

  return false;
}

// adapta el formato Ozone al formato esperado por composer
function adaptOzoneProductForComposer(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    url: p.url,
    link: p.url,
    available: p.available,
    source: 'ozone'
  };
}

async function handleMessage(payload) {
  const { channel, user_id: userId, text } = payload || {};

  if (!channel || !userId || !text) {
    return {
      status: 400,
      body: {
        text: 'Faltan datos del mensaje. Enviá channel, user_id y text.',
        links: [],
        meta: { intent: 'validation_error' }
      }
    };
  }

  console.log(`[message] channel=${channel} user=${userId}`);

  const intentData = detectIntent(text);

  // --- Follow-up resolver ---
  // Si el intent vino como unknown/greet pero el usuario viene de preguntar un precio,
  // interpretamos "y la corporal?" / "y pocket?" como continuación.
  const mem = getMem(channel, userId);
  let resolvedIntent = intentData;

  const n = normalize(text);
  const looksLikeFollowUp =
    n.startsWith('y ') ||
    n.startsWith('y la') ||
    n.startsWith('y el') ||
    n.includes('la corporal') ||
    n.includes('el corporal') ||
    n.includes('corporal') ||
    n.includes('pocket') ||
    n.match(/\b195\b/) ||
    n.match(/\b50\b/);

  if ((intentData.intent === 'unknown' || intentData.intent === 'greet') && mem.lastIntent === 'price' && looksLikeFollowUp) {
    resolvedIntent = { intent: 'price', _followUp: true };
  }

  try {
    // ---- GREET ----
    if (resolvedIntent.intent === 'greet') {
      return { status: 200, body: composeGreetResponse() };
    }

    // ---- PROMOS ----
    if (resolvedIntent.intent === 'promos') {
      return { status: 200, body: composePromosResponse() };
    }

    // ---- PAYMENTS ----
    if (resolvedIntent.intent === 'payments') {
      return { status: 200, body: composePaymentsResponse() };
    }

    // ---- INSTALLMENTS ----
    if (resolvedIntent.intent === 'installments') {
      return { status: 200, body: composeInstallmentsResponse() };
    }

    // ---- SHIPPING ----
    if (resolvedIntent.intent === 'shipping') {
      return { status: 200, body: composeShippingResponse() };
    }

    // ---- ORDER ----
    if (resolvedIntent.intent === 'order') {
      if (resolvedIntent.orderId) {
        const order = await tiendaApi.getOrder(resolvedIntent.orderId);
        return { status: 200, body: composeOrderResponse(order) };
      }

      return {
        status: 200,
        body: {
          text: 'Necesito el número de pedido para ayudarte. ¿Lo tenés a mano?',
          links: [],
          meta: { intent: 'order', status: 'needs_order_id' }
        }
      };
    }

    // ---- SUN / OZONE / SUNSTICK ----
    if (resolvedIntent.intent === 'ozone' || resolvedIntent.intent === 'sunstick' || resolvedIntent.intent === 'sun') {
      const ozoneProduct = await productResolver.resolveProduct(ozoneData.query);

      // “piel iluminada + playa/sol” => NO SPF + Ozone
      if (resolvedIntent.intent === 'sun' && looksLikePielIluminada(text)) {
        const mtb = await productResolver.resolveProduct('piel iluminada');
        return {
          status: 200,
          body: composeSunResponse({ productName: mtb?.name || 'Piel Iluminada', ozoneLink: ozoneProduct })
        };
      }

      if (resolvedIntent.intent === 'sunstick') {
        return { status: 200, body: composeSunstickResponse({ ozoneLink: ozoneProduct }) };
      }

      if (resolvedIntent.intent === 'ozone') {
        return { status: 200, body: composeOzoneResponse({ ozoneLink: ozoneProduct }) };
      }

      // sun genérico
      return { status: 200, body: composeSunResponse({ productName: null, ozoneLink: ozoneProduct }) };
    }

    // ---- PRICE ----
    if (resolvedIntent.intent === 'price') {
      const productQuery = extractProductQuery(text, [
        'precio','cuesta','vale','valor','cuanto','cuánto','coste','costo','sale'
      ]);

      // Follow-up: veníamos de Piel Iluminada y ahora dice "y la corporal?"
      const mem2 = getMem(channel, userId);
      if (!looksLikePielIluminada(text) && mem2.lastProductFamily === 'piel iluminada') {
        if (wantsCorporalOr195(text)) {
          const corporal = await productResolver.resolveProduct('piel iluminada corporal');
          setMem(channel, userId, { lastIntent: 'price', lastProductFamily: 'piel iluminada' });
          return { status: 200, body: composePriceResponse(corporal) };
        }
        if (wantsPocketOr50(text)) {
          const pocket = await productResolver.resolveProduct('piel iluminada pocket');
          setMem(channel, userId, { lastIntent: 'price', lastProductFamily: 'piel iluminada' });
          return { status: 200, body: composePriceResponse(pocket) };
        }
      }

      // Caso especial: Piel iluminada (Pocket + Corporal) => MTB
      if (looksLikePielIluminada(text)) {
        const wantPocket = wantsPocketOr50(text);
        const wantCorporal = wantsCorporalOr195(text);

        if (wantPocket && !wantCorporal) {
          const pocket = await productResolver.resolveProduct('piel iluminada pocket');
          setMem(channel, userId, { lastIntent: 'price', lastProductFamily: 'piel iluminada' });
          return { status: 200, body: composePriceResponse(pocket) };
        }

        if (wantCorporal && !wantPocket) {
          const corporal = await productResolver.resolveProduct('piel iluminada corporal');
          setMem(channel, userId, { lastIntent: 'price', lastProductFamily: 'piel iluminada' });
          return { status: 200, body: composePriceResponse(corporal) };
        }

        // si no especifica => devolvemos ambos
        const pocket = await productResolver.resolveProduct('piel iluminada pocket');
        const corporal = await productResolver.resolveProduct('piel iluminada corporal');
        const list = [pocket, corporal].filter(Boolean);

        setMem(channel, userId, { lastIntent: 'price', lastProductFamily: 'piel iluminada' });
        return { status: 200, body: composePriceResponse(list) };
      }

      // Ozone por token
      if (looksLikeOzonePrice(text)) {
        const q = productQuery || text;
        const oz = await ozoneTN.findBestProduct(q);
        const product = adaptOzoneProductForComposer(oz);

        if (!product) {
          setMem(channel, userId, { lastIntent: 'price', lastBrand: 'ozone', lastQuery: q });
          return {
            status: 200,
            body: {
              text: `No encontré "${q}" en Ozone. ¿Podés decirme el nombre exacto o una palabra clave (ej: Sunstick Kids, Blanco, Medium)?`,
              links: [],
              meta: { intent: 'price', brand: 'ozone', status: 'not_found' }
            }
          };
        }

        setMem(channel, userId, { lastIntent: 'price', lastBrand: 'ozone', lastQuery: q });
        return { status: 200, body: composePriceResponse(product) };
      }

      // Default MTB
      const product = await productResolver.resolveProduct(productQuery || text);
      setMem(channel, userId, { lastIntent: 'price', lastBrand: 'mtb', lastQuery: productQuery || text });
      return { status: 200, body: composePriceResponse(product) };
    }

    // ---- INFO ----
    if (resolvedIntent.intent === 'info') {
      const product = await productResolver.resolveProduct(text);
      return { status: 200, body: composeInfoResponse(product) };
    }

    // ---- FAQ (tipo “X tiene SPF?”) ----
    if (resolvedIntent.intent === 'faq') {
      const productQuery = extractProductQuery(text, faqData.spf_keywords);
      const product = productQuery ? await productResolver.resolveProduct(productQuery) : null;
      const ozoneProduct = await productResolver.resolveProduct(ozoneData.query);
      return { status: 200, body: composeFaqResponse(product, ozoneProduct) };
    }

    // ---- UNKNOWN ----
    return { status: 200, body: composeGreetResponse() };
  } catch (error) {
    console.error('[message] error', error.message);
    return { status: 500, body: composeErrorResponse() };
  }
}

module.exports = { handleMessage };
