// src/core/intents.js
const { normalize } = require('./normalize');

function findOrderId(text) {
  const t = String(text || '');
  const m = t.match(/\b(\d{4,10})\b/);
  return m ? m[1] : null;
}

function includesAny(hay, keywords) {
  return (keywords || []).some((k) => hay.includes(normalize(k)));
}

function isGreetingOnly(normalizedText) {
  const t = normalize(normalizedText);
  if (!t) return false;

  const greetings = [
    'hola',
    'buenas',
    'buenos dias',
    'buenas tardes',
    'buenas noches',
    'hey',
    'holi'
  ];

  // si el mensaje es solo un saludo (o saludo + emoji)
  const cleaned = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return greetings.includes(cleaned);
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
    'cuándo llega',
    'numero de pedido',
    'número de pedido'
  ];

  const orderId = findOrderId(raw);
  const isOrder = Boolean(orderId) || includesAny(t, orderKeywords);

  if (isOrder) {
    return {
      intent: 'order',
      orderId: orderId || null,
      noOrderNumber: !orderId
    };
  }

  // GREETING (solo saludo)
  if (isGreetingOnly(t)) {
    return { intent: 'greeting' };
  }

  // PRICE
  const priceKeywords = ['precio', 'cuesta', 'vale', 'valor', 'cuanto', 'cuánto', 'coste'];
  if (includesAny(t, priceKeywords)) {
    return { intent: 'price' };
  }

  // FAQ SPF (más específico: va antes que info)
  const spfKeywords = [
    'spf',
    'proteccion solar',
    'protección solar',
    'protector solar',
    'tiene spf',
    'tiene filtro',
    'tiene proteccion',
    'tiene protección'
  ];
  if (includesAny(t, spfKeywords)) {
    return { intent: 'faq_spf' };
  }

  // INFO (uso/beneficios/ingredientes)
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

  return { intent: 'unknown' };
}

module.exports = { detectIntent };
