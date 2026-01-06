// src/core/intents.js
const { normalize } = require('./normalize');

function findOrderId(text) {
  const t = String(text || '');
  // busca un número de pedido razonable (4-10 dígitos)
  const m = t.match(/\b(\d{4,10})\b/);
  return m ? m[1] : null;
}

function includesAny(hay, keywords) {
  return keywords.some((k) => hay.includes(normalize(k)));
}

function detectIntent(text) {
  const raw = String(text || '');
  const t = normalize(raw);

  // ORDER
  const orderKeywords = [
    'pedido',
    'orden',
    'estado',
    'seguimiento',
    'tracking',
    'envio',
    'envío',
    'donde esta',
    'dónde está',
    'cuando llega',
    'cuándo llega'
  ];

  const orderId = findOrderId(raw);
  const isOrder = orderId || includesAny(t, orderKeywords);

  if (isOrder) {
    return {
      intent: 'order',
      orderId: orderId || null,
      noOrderNumber: !orderId
    };
  }

  // PRICE
  const priceKeywords = ['precio', 'cuesta', 'vale', 'valor', 'cuanto', 'cuánto', 'coste'];
  if (includesAny(t, priceKeywords)) {
    return { intent: 'price' };
  }

  // INFO (lo que te falta)
  const infoKeywords = [
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
    'uso recomendado'
  ];

  if (includesAny(t, infoKeywords)) {
    return { intent: 'info' };
  }

  // FAQ SPF (lo que ya tenías)
  const spfKeywords = ['spf', 'proteccion solar', 'protección solar', 'protector solar', 'tiene spf'];
  if (includesAny(t, spfKeywords)) {
    return { intent: 'faq' };
  }

  return { intent: 'unknown' };
}

module.exports = { detectIntent };
