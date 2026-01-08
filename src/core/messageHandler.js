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
const ozoneTN = require('../services/tiendanubeOzone');

const faqData = require('../data/faq.json');
const ozoneData = require('../data/ozone.json');
const { normalize } = require('./normalize');

// --------------------
// Memoria corta (RAM)
// --------------------
const LAST = new Map(); // userId -> { ts, lastIntent, lastQuery, lastBrand }
const TTL_MS = 10 * 60 * 1000;

function setLast(userId, ctx) {
  LAST.set(userId, { ...ctx, ts: Date.now() });
}
function getLast(userId) {
  const v = LAST.get(userId);
  if (!v) return null;
  if (Date.now() - v.ts > TTL_MS) {
    LAST.delete(userId);
    return null;
  }
  return v;
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

function looksLikeOzonePrice(text) {
  const t = normalize(text);
  if (t.includes('ozone') || t.includes('sunstick') || t.includes('kids')) return true;

  const kws = []
    .concat(ozoneData?.keywords || [])
    .concat(ozoneData?.query ? [ozoneData.query] : [])
    .filter(Boolean)
    .map((k) => normalize(k));

  if (kws.length > 0) return kws.some((k) => k && t.includes(k));
  return false;
}

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

// Follow-up tipo: "y la corporal?" / "la pocket?"
function isFollowUp(text) {
  const t = normalize(text);
  if (t.length > 45) return false;
  return (
    t.startsWith('y ') ||
    t.startsWith('y la') ||
    t.startsWith('y el') ||
    t.startsWith('la ') ||
    t.startsWith('el ') ||
    t.startsWith('esa ') ||
    t.startsWith('ese ') ||
    t.includes('corporal') ||
    t.includes('pocket') ||
    t.includes('kids') ||
    t.includes('sunstick') ||
    t.includes('crema')
  );
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

  let intentData = detectIntent(text);
  const last = getLast(userId);

  // ✅ follow-up: si antes hubo price, tratamos como price
  if (intentData.intent === 'unknown' && last?.lastIntent === 'price' && isFollowUp(text)) {
    intentData = { intent: 'price', _followup: true };
  }

  try {
    if (intentData.intent === 'greet') {
      return { status: 200, body: composeGreetResponse() };
    }

    if (intentData.intent === 'promos') {
      return { status: 200, body: composePromosResponse() };
    }

    if (intentData.intent === 'payments') {
      return { status: 200, body: composePaymentsResponse() };
    }

    if (intentData.intent === 'installments') {
      return { status: 200, body: composeInstallmentsResponse() };
    }

    if (intentData.intent === 'shipping') {
      return { status: 200, body: composeShippingResponse() };
    }

    if (intentData.intent === 'order') {
      if (intentData.orderId) {
        const order = await tiendaApi.getOrder(intentData.orderId);
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

    if (intentData.intent === 'ozone' || intentData.intent === 'sunstick' || intentData.intent === 'sun') {
      const ozoneProduct = await productResolver.resolveProduct(ozoneData.query);

      if (intentData.intent === 'sun' && looksLikePielIluminada(text)) {
        const mtb = await productResolver.resolveProduct('piel iluminada');
        return { status: 200, body: composeSunResponse({ productName: mtb?.name || 'Piel Iluminada', ozoneLink: ozoneProduct }) };
      }

      if (intentData.intent === 'sunstick') {
        return { status: 200, body: composeSunstickResponse({ ozoneLink: ozoneProduct }) };
      }

      if (intentData.intent === 'ozone') {
        return { status: 200, body: composeOzoneResponse({ ozoneLink: ozoneProduct }) };
      }

      return { status: 200, body: composeSunResponse({ productName: null, ozoneLink: ozoneProduct }) };
    }

    if (intentData.intent === 'price') {
      const productQuery = extractProductQuery(text, [
        'precio','cuesta','sale','vale','valor','cuanto','cuánto','coste','costo'
      ]);

      const qBase = (productQuery || '').trim() ? productQuery : (last?.lastQuery || text);

      if (looksLikePielIluminada(qBase)) {
        const wantPocket = wantsPocketOr50(text);
        const wantCorporal = wantsCorporalOr195(text);

        if (wantPocket && !wantCorporal) {
          const pocket = await productResolver.resolveProduct('piel iluminada pocket');
          setLast(userId, { lastIntent: 'price', lastQuery: 'piel iluminada pocket', lastBrand: 'mtb' });
          return { status: 200, body: composePriceResponse(pocket) };
        }

        if (wantCorporal && !wantPocket) {
          const corporal = await productResolver.resolveProduct('piel iluminada corporal');
          setLast(userId, { lastIntent: 'price', lastQuery: 'piel iluminada corporal', lastBrand: 'mtb' });
          return { status: 200, body: composePriceResponse(corporal) };
        }

        const pocket = await productResolver.resolveProduct('piel iluminada pocket');
        const corporal = await productResolver.resolveProduct('piel iluminada corporal');
        const list = [pocket, corporal].filter(Boolean);

        setLast(userId, { lastIntent: 'price', lastQuery: 'piel iluminada', lastBrand: 'mtb' });
        return { status: 200, body: composePriceResponse(list) };
      }

      if (looksLikeOzonePrice(qBase)) {
        const oz = await ozoneTN.findBestProduct(qBase);
        const product = adaptOzoneProductForComposer(oz);

        if (!product) {
          return {
            status: 200,
            body: {
              text: `No encontré "${qBase}" en Ozone. ¿Podés decirme el nombre exacto? (ej: Sunstick Kids, Blanco, Medium)`,
              links: [],
              meta: { intent: 'price', brand: 'ozone', status: 'not_found' }
            }
          };
        }

        setLast(userId, { lastIntent: 'price', lastQuery: qBase, lastBrand: 'ozone' });
        return { status: 200, body: composePriceResponse(product) };
      }

      const product = await productResolver.resolveProduct(qBase);
      setLast(userId, { lastIntent: 'price', lastQuery: qBase, lastBrand: 'mtb' });
      return { status: 200, body: composePriceResponse(product) };
    }

    if (intentData.intent === 'info') {
      const product = await productResolver.resolveProduct(text);
      return { status: 200, body: composeInfoResponse(product) };
    }

    if (intentData.intent === 'faq') {
      const productQuery = extractProductQuery(text, faqData.spf_keywords);
      const product = productQuery ? await productResolver.resolveProduct(productQuery) : null;
      const ozoneProduct = await productResolver.resolveProduct(ozoneData.query);
      return { status: 200, body: composeFaqResponse(product, ozoneProduct) };
    }

    return { status: 200, body: composeGreetResponse() };
  } catch (error) {
    console.error('[message] error', error.message);
    return { status: 500, body: composeErrorResponse() };
  }
}

module.exports = { handleMessage };
