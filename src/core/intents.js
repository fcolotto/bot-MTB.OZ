// src/core/intents.js
const { normalize } = require('./normalize');

function findOrderId(text) {
  const t = String(text || '');
  // busca un número de pedido razonable (4-10 dígitos)
  const m = t.match(/\b(\d{4,10})\b/);
  return m ? m[1] : null;
}

function includesAny(normalizedHaystack, keywords) {
  return (keywords || []).some((k) => normalizedHaystack.includes(normalize(k)));
}

function detectIntent(text) {
  const raw = String(text || '');
  const t = normalize(raw);

  // ---------------------------
  // 0) ORDER (estado/seguimiento)
  // IMPORTANTE:
  // - NO incluir "envio/envíos" acá porque dispara shipping.
  // ---------------------------
  const orderKeywords = [
    'pedido',
    'orden',
    'estado del pedido',
    'estado pedido',
    'seguimiento',
    'tracking',
    'trackeo',
    'numero de pedido',
    'número de pedido',
    'codigo de pedido',
    'código de pedido',
    'donde esta mi pedido',
    'dónde está mi pedido',
    'cuando llega mi pedido',
    'cuándo llega mi pedido',
    'me llego mi pedido',
    'me llegó mi pedido'
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

  // ---------------------------
  // 1) PRICE
  // ---------------------------
  const priceKeywords = ['precio', 'cuesta', 'vale', 'valor', 'cuanto', 'cuánto', 'coste'];
  if (includesAny(t, priceKeywords)) return { intent: 'price' };

  // ---------------------------
  // 2) PAYMENTS (transferencia/medios de pago)
  // Va ANTES de PROMOS:
  // "transferencia + descuento" tiene que caer acá.
  // ---------------------------
  const paymentsKeywords = [
    'medios de pago',
    'formas de pago',
    'forma de pago',
    'como pagar',
    'cómo pagar',
    'pagar',
    'pago',
    'pagos',
    'transferencia',
    'transferir',
    'cbu',
    'alias',
    'rapipago',
    'pago facil',
    'pago fácil',
    'tarjeta',
    'credito',
    'crédito',
    'debito',
    'débito',
    'cuotas',
    'cuotas sin interes',
    'cuotas sin interés',
    // descuento por transferencia (lo tratamos como payments)
    'descuento transferencia',
    '10% transferencia',
    '10 transferencia'
  ];

  // Si la pregunta mezcla "descuento" + "transferencia", es payments.
  const mentionsDiscount =
    t.includes('descuento') || t.includes('off') || t.includes('%') || t.includes('promo');
  const mentionsTransfer =
    t.includes('transferencia') || t.includes('cbu') || t.includes('alias') || t.includes('transferir');

  if (includesAny(t, paymentsKeywords) || (mentionsDiscount && mentionsTransfer)) {
    return { intent: 'payments' };
  }

  // ---------------------------
  // 3) SHIPPING (envíos / costo envío)
  // ---------------------------
  const shippingKeywords = [
    'envio',
    'envíos',
    'envios',
    'enviar',
    'envian',
    'envían',
    'hacen envios',
    'hacen envíos',
    'costo de envio',
    'costo de envío',
    'cuanto cuesta el envio',
    'cuánto cuesta el envío',
    'precio del envio',
    'precio del envío',
    'codigo postal',
    'código postal',
    'cp'
  ];

  if (includesAny(t, shippingKeywords)) return { intent: 'shipping' };

  // ---------------------------
  // 4) PROMOS
  // OJO: NO metemos "descuento" acá para no pisar payments.
  // ---------------------------
  const promosKeywords = [
    'promo',
    'promos',
    'promocion',
    'promoción',
    'oferta',
    'ofertas',
    '2x1',
    'sale',
    'black friday',
    'cyber monday',
    'cybermonday'
  ];

  if (includesAny(t, promosKeywords)) return { intent: 'promos' };

  // ---------------------------
  // 5) INFO (beneficios / uso / ingredientes)
  // ---------------------------
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
    'uso recomendado',
    'informacion',
    'información',
    'info'
  ];

  if (includesAny(t, infoKeywords)) return { intent: 'info' };

  // ---------------------------
  // 6) FAQ SPF / PROTECCIÓN SOLAR
  // ---------------------------
  const spfKeywords = [
    'spf',
    'proteccion solar',
    'protección solar',
    'protector solar',
    'tiene spf',
    'tiene protección',
    'protege del sol',
    'protege del sol?'
  ];

  if (includesAny(t, spfKeywords)) return { intent: 'faq' };

  return { intent: 'unknown' };
}

module.exports = { detectIntent };
