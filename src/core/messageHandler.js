// src/core/messageHandler.js
const { detectIntent } = require('./intents');
const { suggestKits } = require('./kitSuggester');
const {
  composeOrderResponse,
  composePriceResponse,
  composePaymentsResponse,
  composeShippingResponse,
  composePromosResponse,
  composeInfoResponse,
  composeFaqResponse,
  composeErrorResponse
} = require('./composer');

const tiendaApi = require('../services/tiendaApi');
const productResolver = require('../services/productResolver');
const { rewrite } = require('../services/llm');

const faqData = require('../data/faq.json');
const ozoneData = require('../data/ozone.json');
const { normalize } = require('./normalize');

// Keywords para limpiar query de producto cuando el intent es "info"
const INFO_KEYWORDS = [
  'para que sirve',
  'para qué sirve',
  'sirve para',
  'beneficios',
  'beneficio',
  'funciona para',
  'que hace',
  'qué hace',
  'que es',
  'qué es',
  'como se usa',
  'cómo se usa',
  'modo de uso',
  'como usar',
  'cómo usar',
  'ingredientes',
  'ingrediente',
  'rutina',
  'se aplica',
  'se usa',
  'uso recomendado',
  'info',
  'informacion',
  'información'
];

function extractProductQuery(text, keywords) {
  const normalized = normalize(text);
  let result = normalized;

  (keywords || []).forEach((keyword) => {
    result = result.replace(normalize(keyword), ' ');
  });

  return result.replace(/\s+/g, ' ').trim();
}

async function resolveKitLinks(kits) {
  const links = [];
  const fallbackUrl = process.env.KITS_COLLECTION_URL;

  for (const kit of kits || []) {
    const resolved = await productResolver.resolveProduct(kit.kit_name);

    if (resolved?.url) {
      links.push({ label: kit.kit_name, url: resolved.url });
    } else if (fallbackUrl) {
      links.push({ label: kit.kit_name, url: fallbackUrl });
    }
  }

  return links;
}

async function maybeRewriteText({ userText, draftBody }) {
  const useLLM = process.env.USE_LLM_REWRITE !== 'false'; // default ON
  if (!useLLM) return draftBody;
  if (!process.env.OPENAI_API_KEY) return draftBody;

  const systemPrompt = process.env.ASSISTANT_SYSTEM_PROMPT || '';

  try {
    const newText = await rewrite({
      systemPrompt,
      userText,
      draft: draftBody
    });

    if (newText) {
      draftBody.text = newText;
    }
  } catch (e) {
    console.error('[llm] rewrite error', e.message);
  }

  return draftBody;
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
    // ---- PROMOS ----
    if (intentData.intent === 'promos') {
      const draftBody = composePromosResponse();
      await maybeRewriteText({ userText: text, draftBody });
      return { status: 200, body: draftBody };
    }

    // ---- PAYMENTS ----
    if (intentData.intent === 'payments') {
      const draftBody = composePaymentsResponse();
      await maybeRewriteText({ userText: text, draftBody });
      return { status: 200, body: draftBody };
    }

    // ---- SHIPPING ----
    if (intentData.intent === 'shipping') {
      const draftBody = composeShippingResponse();
      await maybeRewriteText({ userText: text, draftBody });
      return { status: 200, body: draftBody };
    }

    // ---- ORDER ----
    if (intentData.intent === 'order') {
      if (intentData.orderId) {
        const order = await tiendaApi.getOrder(intentData.orderId);
        const draftBody = composeOrderResponse(order);
        await maybeRewriteText({ userText: text, draftBody });
        return { status: 200, body: draftBody };
      }

      const draftBody = {
        text: 'Necesito el número de pedido para ayudarte. ¿Lo tenés a mano?',
        links: [],
        meta: { intent: 'order', status: 'needs_order_id' }
      };
      await maybeRewriteText({ userText: text, draftBody });
      return { status: 200, body: draftBody };
    }

    // ---- PRICE ----
    if (intentData.intent === 'price') {
      const productQuery = extractProductQuery(text, [
        'precio',
        'cuesta',
        'vale',
        'valor',
        'cuanto',
        'cuánto',
        'coste'
      ]);

      const product = await productResolver.resolveProduct(productQuery || text);
      const kits = suggestKits(product?.name);
      const kitLinks = await resolveKitLinks(kits);

      const draftBody = composePriceResponse(product, kits, kitLinks);
      await maybeRewriteText({ userText: text, draftBody });

      return { status: 200, body: draftBody };
    }

    // ---- INFO ----
    if (intentData.intent === 'info') {
      // Limpia el texto para extraer mejor el producto
      const productQuery = extractProductQuery(text, INFO_KEYWORDS);

      // si la query limpia quedó muy corta, probamos igual con el texto original
      const queryToUse = productQuery && productQuery.length >= 3 ? productQuery : text;

      const product = await productResolver.resolveProduct(queryToUse);
      const draftBody = composeInfoResponse(product);

      await maybeRewriteText({ userText: text, draftBody });
      return { status: 200, body: draftBody };
    }

    // ---- FAQ (SPF) ----
    if (intentData.intent === 'faq') {
      const spfKeywords = faqData?.spf_keywords || [
        'spf',
        'proteccion solar',
        'protección solar',
        'protector solar',
        'tiene spf'
      ];

      const productQuery = extractProductQuery(text, spfKeywords);
      const product = productQuery ? await productResolver.resolveProduct(productQuery) : null;
      const ozoneProduct = await productResolver.resolveProduct(ozoneData.query);

      const draftBody = composeFaqResponse(product, ozoneProduct);
      await maybeRewriteText({ userText: text, draftBody });

      return { status: 200, body: draftBody };
    }

    // ---- UNKNOWN ----
    const draftBody = {
      text: '¿Querés saber precio, estado de pedido o información de un producto? Decime qué necesitás 🙂',
      links: [],
      meta: { intent: 'unknown' }
    };

    await maybeRewriteText({ userText: text, draftBody });
    return { status: 200, body: draftBody };
  } catch (error) {
    console.error('[message] error', error.message);
    return { status: 500, body: composeErrorResponse() };
  }
}

module.exports = { handleMessage };
