const { normalize } = require('./normalize');

function extractOrderId(text) {
  const match = text.match(/\b(\d{4,})\b/);
  return match ? match[1] : null;
}

function wantsOrder(text) {
  return /(pedido|orden|order|envio|seguimiento)/i.test(text);
}

function wantsPrice(text) {
  return /(precio|cuesta|vale|valor|cuanto|coste)/i.test(text);
}

function wantsFaq(text) {
  return /(proteccion solar|protección solar|spf|fps)/i.test(text);
}

function noOrderNumber(text) {
  return /(no tengo|no lo tengo|no cuento|perdi|olvido|no recuerdo)/i.test(text);
}

function detectIntent(text) {
  const normalized = normalize(text);
  if (wantsOrder(normalized)) {
    return { intent: 'order', orderId: extractOrderId(normalized), noOrderNumber: noOrderNumber(normalized) };
  }
  if (wantsFaq(normalized)) {
    return { intent: 'faq' };
  }
  if (wantsPrice(normalized)) {
    return { intent: 'price' };
  }
  return { intent: 'unknown' };
}

module.exports = { detectIntent };
