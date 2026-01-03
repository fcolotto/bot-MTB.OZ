const { detectIntent } = require('./intents');
const { suggestKits } = require('./kitSuggester');
const {
  composeOrderResponse,
  composePriceResponse,
  composeFaqResponse,
  composeErrorResponse
} = require('./composer');
const tiendaApi = require('../services/tiendaApi');
const productResolver = require('../services/productResolver');
const faqData = require('../data/faq.json');
const ozoneData = require('../data/ozone.json');
const { normalize } = require('./normalize');

function extractProductQuery(text, keywords) {
  const normalized = normalize(text);
  let result = normalized;
  keywords.forEach((keyword) => {
    result = result.replace(normalize(keyword), ' ');
  });
  return result.replace(/\s+/g, ' ').trim();
}

async function resolveKitLinks(kits) {
  const links = [];
  const fallbackUrl = process.env.KITS_COLLECTION_URL;
  for (const kit of kits) {
    const resolved = await productResolver.resolveProduct(kit.kit_name);
    if (resolved?.url) {
      links.push({ label: kit.kit_name, url: resolved.url });
    } else if (fallbackUrl) {
      links.push({ label: kit.kit_name, url: fallbackUrl });
    }
  }
  return links;
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
    if (intentData.intent === 'order') {
      if (intentData.orderId) {
        const order = await tiendaApi.getOrder(intentData.orderId);
        return { status: 200, body: composeOrderResponse(order) };
      }
      if (intentData.noOrderNumber) {
        if (process.env.ORDER_LOOKUP_BY_NAME_EMAIL === 'true') {
          return {
            status: 200,
            body: {
              text: 'Puedo buscarlo por nombre y email. ¿Me los compartís, por favor?',
              links: [],
              meta: { intent: 'order', status: 'needs_name_email' }
            }
          };
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
      return {
        status: 200,
        body: {
          text: '¿Me pasás el número de pedido, por favor?',
          links: [],
          meta: { intent: 'order', status: 'needs_order_id' }
        }
      };
    }

    if (intentData.intent === 'price') {
      const productQuery = extractProductQuery(text, ['precio', 'cuesta', 'vale', 'valor', 'cuanto', 'coste']);
      const product = await productResolver.resolveProduct(productQuery || text);
      const kits = suggestKits(product?.name);
      const kitLinks = await resolveKitLinks(kits);
      return { status: 200, body: composePriceResponse(product, kits, kitLinks) };
    }

    if (intentData.intent === 'faq') {
      const productQuery = extractProductQuery(text, faqData.spf_keywords);
      const product = productQuery ? await productResolver.resolveProduct(productQuery) : null;
      const ozoneProduct = await productResolver.resolveProduct(ozoneData.query);
      return { status: 200, body: composeFaqResponse(product, ozoneProduct) };
    }

    return {
      status: 200,
      body: {
        text: '¿Podés contarme si querés precio, estado de pedido o info de un producto?',
        links: [],
        meta: { intent: 'unknown' }
      }
    };
  } catch (error) {
    console.error('[message] error', error.message);
    return { status: 500, body: composeErrorResponse() };
  }
}

module.exports = { handleMessage };
