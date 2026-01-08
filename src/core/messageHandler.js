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

// ✅ NUEVO: cliente Tiendanube de Ozone (usa token + store_id)
const ozoneTN = require('../services/tiendanubeOzone');

const faqData = require('../data/faq.json');
const ozoneData = require('../data/ozone.json');
const { normalize } = require('./normalize');

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

// ✅ NUEVO: heurística simple para decidir "esto es Ozone"
function looksLikeOzonePrice(text) {
  const t = normalize(text);

  // Si explícitamente mencionan ozone/sunstick/kids
  if (t.includes('ozone') || t.includes('sunstick') || t.includes('kids')) return true;

  // Si en tu ozone.json hay keywords, las usamos
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

// ✅ NUEVO: adapta el formato de Ozone (findBestProduct) a lo que espera el composer
function adaptOzoneProductForComposer(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    url: p.url,
    // algunos composers usan "link" en vez de "url"
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

  try {
    // ---- GREET ----
    if (intentData.intent === 'greet') {
      return { status: 200, body: composeGreetResponse() };
    }

    // ---- PROMOS ----
    if (intentData.intent === 'promos') {
      return { status: 200, body: composePromosResponse() };
    }

    // ---- PAYMENTS ----
    if (intentData.intent === 'payments') {
      return { status: 200, body: composePaymentsResponse() };
    }

    // ---- INSTALLMENTS ----
    if (intentData.intent === 'installments') {
      return { status: 200, body: composeInstallmentsResponse() };
    }

    // ---- SHIPPING ----
    if (intentData.intent === 'shipping') {
      return { status: 200, body: composeShippingResponse() };
    }

    // ---- ORDER ----
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

    // ---- SUN / OZONE / SUNSTICK ----
    if (intentData.intent === 'ozone' || intentData.intent === 'sunstick' || intentData.intent === 'sun') {
      const ozoneProduct = await productResolver.resolveProduct(ozoneData.query);

      // Si viene “piel iluminada + playa/sol” => NO SPF + Ozone
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

      // sun genérico (sin producto claro)
      return { status: 200, body: composeSunResponse({ productName: null, ozoneLink: ozoneProduct }) };
    }

    // ---- PRICE ----
    if (intentData.intent === 'price') {
      const productQuery = extractProductQuery(text, [
        'precio','cuesta','vale','valor','cuanto','cuánto','coste','costo'
      ]);

      // Caso especial: Piel iluminada (Pocket + Corporal) => MTB
      if (looksLikePielIluminada(text)) {
        const wantPocket = wantsPocketOr50(text);
        const wantCorporal = wantsCorporalOr195(text);

        if (wantPocket && !wantCorporal) {
          const pocket = await productResolver.resolveProduct('piel iluminada pocket');
          return { status: 200, body: composePriceResponse(pocket) };
        }

        if (wantCorporal && !wantPocket) {
          const corporal = await productResolver.resolveProduct('piel iluminada corporal');
          return { status: 200, body: composePriceResponse(corporal) };
        }

        // si no especifica => devolvemos ambos
        const pocket = await productResolver.resolveProduct('piel iluminada pocket');
        const corporal = await productResolver.resolveProduct('piel iluminada corporal');
        const list = [pocket, corporal].filter(Boolean);
        return { status: 200, body: composePriceResponse(list) };
      }

      // ✅ NUEVO: Si parece una consulta de precio Ozone, consultamos Tiendanube Ozone real (token)
      if (looksLikeOzonePrice(text)) {
        const q = productQuery || text;
        const oz = await ozoneTN.findBestProduct(q);
        const product = adaptOzoneProductForComposer(oz);

        if (!product) {
          return {
            status: 200,
            body: {
              text: `No encontré "${q}" en Ozone. ¿Podés decirme el nombre exacto o pasarme una palabra clave (ej: Sunstick Kids, Blanco, Medium)?`,
              links: [],
              meta: { intent: 'price', brand: 'ozone', status: 'not_found' }
            }
          };
        }

        return { status: 200, body: composePriceResponse(product) };
      }

      // Default MTB (lo que ya tenías)
      const product = await productResolver.resolveProduct(productQuery || text);
      return { status: 200, body: composePriceResponse(product) };
    }

    // ---- INFO ----
    if (intentData.intent === 'info') {
      const product = await productResolver.resolveProduct(text);
      return { status: 200, body: composeInfoResponse(product) };
    }

    // ---- FAQ (tipo “X tiene SPF?”) ----
    if (intentData.intent === 'faq') {
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
