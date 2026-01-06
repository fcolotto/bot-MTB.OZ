// src/core/messageHandler.js
const { detectIntent } = require('./intents');
const { suggestKits } = require('./kitSuggester');
const {
  composeOrderResponse,
  composePriceResponse,
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

function extractProductQuery(text, keywords) {
  let result = normalize(text);

  // Sacamos keywords explícitas
  (keywords || []).forEach((keyword) => {
    result = result.replace(normalize(keyword), ' ');
  });

  // Sacamos frases típicas “de conversación”
  const stopPhrases = [
    'hola',
    'buenas',
    'buenos dias',
    'buenas tardes',
    'quiero saber',
    'me decis',
    'me decis por favor',
    'por favor',
    'necesito',
    'consulta',
    'para que sirve',
    'sirve para',
    'beneficios',
    'modo de uso',
    'como se usa',
    'ingredientes',
    'rutina',
    'info',
    'informacion',
    'información',
    'precio',
    'cuesta',
    'vale',
    'valor',
    'cuanto',
    'cuánto'
  ];

  stopPhrases.forEach((p) => {
    result = result.replace(normalize(p), ' ');
  });

  // Normalizamos espacios
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

async function resolveKitLinks(kits) {
  const links = [];
  const fallbackUrl = process.env.KITS_COLLECTION_URL;

  for (const kit of kits || []) {
    const resolved = await productResolver.resolveProduct(kit.kit_name);

    if (resolved?.url) links.push({ label: kit.kit_name, url: resolved.url });
    else if (fallbackUrl) links.push({ label: kit.kit_name, url: fallbackUrl });
  }

  return links;
}

// Reescribe draftBody.text con LLM si está habilitado.
// Mantiene links y meta intactos. Si falla, no rompe la respuesta.
async function maybeRewriteText({ userText, draftBody }) {
  const useLLM = process.env.USE_LLM_REWRITE !== 'false'; // default ON
  if (!useLLM) return draftBody;

  if (!process.env.OPENAI_API_KEY) return draftBody;

  const systemPrompt = process.env.ASSISTANT_SYSTEM_PROMPT || '';

  try {
    const newText = await rewrite({ systemPrompt, userText, draft: draftBody });
    if (newText) draftBody.text = newText;
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
    // ---- ORDER ----
    if (intentData.intent === 'order') {
      if (intentData.orderId) {
        const order = await tiendaApi.getOrder(intentData.orderId);
        const draftBody = composeOrderResponse(order);
        await maybeRewriteText({ userText: text, draftBody });
        return { status: 200, body: draftBody };
      }

      const draftBody = {
        text:
          process.env.ORDER_LOOKUP_BY_NAME_EMAIL === 'true'
            ? 'Puedo buscarlo por nombre y email. ¿Me los compartís, por favor?'
            : 'Necesito el número de pedido para ayudarte. ¿Lo tenés a mano?',
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

    // ---- INFO (NUEVO) ----
    if (intentData.intent === 'info') {
      const productQuery = extractProductQuery(text, [
        'para que sirve',
        'para qué sirve',
        'sirve para',
        'beneficios',
        'modo de uso',
        'como se usa',
        'cómo se usa',
        'ingredientes',
        'rutina',
        'info',
        'informacion',
        'información'
      ]);

      const product = productQuery ? await productResolver.resolveProduct(productQuery) : null;

      const draftBody = composeInfoResponse(product);
      await maybeRewriteText({ userText: text, draftBody });

      return { status: 200, body: draftBody };
    }

    // ---- FAQ (SPF) ----
    if (intentData.intent === 'faq') {
      const productQuery = extractProductQuery(text, faqData.spf_keywords || []);
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
