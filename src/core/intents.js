// src/core/intents.js
const { normalize } = require('./normalize');

function includesAny(hay, keywords) {
  return (keywords || []).some((k) => hay.includes(normalize(k)));
}

function findOrderId(text) {
  const t = String(text || '');
  // número de pedido razonable (4-10 dígitos)
  const m = t.match(/\b(\d{4,10})\b/);
  return m ? m[1] : null;
}

function detectIntent(text) {
  const raw = String(text || '');
  const t = normalize(raw);

  // -------------------------
  // 1) PROMOS / DESCUENTOS
  // -------------------------
  const promosKeywords = [
    'promo',
    'promos',
    'promocion',
    'promoción',
    'descuento',
    'descuentos',
    'oferta',
    'ofertas',
    '2x1',
    'cuotas sin interes',
    'cuotas sin interés',
    'sale',
  ];
  if (includesAny(t, promosKeywords)) {
    return { intent: 'promos' };
  }

  // -------------------------
  // 2) MEDIOS DE PAGO / TRANSFERENCIA
  // -------------------------
  const paymentsKeywords = [
    'medios de pago',
    'medio de pago',
    'pago',
    'pagos',
    'tarjeta',
    'credito',
    'crédito',
    'debito',
    'débito',
    'cuotas',
    'transferencia',
    'cbu',
    'alias',
    'rapipago',
    'pago facil',
    'pagofacil',
    'pago fácil',
  ];
  if (includesAny(t, paymentsKeywords)) {
    // si menciona transferencia, sigue siendo payments (la respuesta incluye 10% off)
    return { intent: 'payments' };
  }

  // -------------------------
  // 3) ENVIOS (shipping)
  // -------------------------
  const shippingKeywords = [
    'envio',
    'envíos',
    'envio a domicilio',
    'envian',
    'envían',
    'envio al interior',
    'envio a',
    'enviar',
    'envian a',
    'correo',
    'oca',
    'andreani',
    'costo de envio',
    'costo envío',
    'cuanto sale el envio',
    'cuánto sale el envío',
    'codigo postal',
    'código postal',
    'cp',
  ];
  if (includesAny(t, shippingKeywords)) {
    return { intent: 'shipping' };
  }

  // -------------------------
  // 4) PEDIDOS / SEGUIMIENTO (order)
  //  OJO: NO incluir "envío" acá, porque confunde shipping con tracking.
  // -------------------------
  const orderKeywords = [
    'pedido',
    'pedidos',
    'orden',
    'seguimiento',
    'tracking',
    'trackeo',
    'estado de mi pedido',
    'numero de pedido',
    'número de pedido',
    'id de pedido',
    'id pedido',
    'donde esta mi pedido',
    'dónde está mi pedido',
    'cuando llega mi pedido',
    'cuándo llega mi pedido',
    'guia',
    'guía',
    'numero de seguimiento',
    'número de seguimiento',
  ];

  if (includesAny(t, orderKeywords)) {
    const orderId = findOrderId(raw);
    if (orderId) return { intent: 'order', orderId };
    return { intent: 'order', noOrderNumber: true };
  }

  // -------------------------
  // 5) PRECIO (price)
  // -------------------------
  const priceKeywords = ['precio', 'cuanto cuesta', 'cuánto cuesta', 'vale', 'valor', 'coste'];
  if (includesAny(t, priceKeywords)) {
    return { intent: 'price' };
  }

  // -------------------------
  // 6) INFO PRODUCTO (info)
  // -------------------------
  const infoKeywords = [
    'para que sirve',
    'para qué sirve',
    'como se usa',
    'cómo se usa',
    'modo de uso',
    'ingredientes',
    'beneficios',
    'que hace',
    'qué hace',
    'es para',
    'rutina',
    'como aplicar',
    'cómo aplicar',
  ];
  if (includesAny(t, infoKeywords)) {
    return { intent: 'info' };
  }

  // -------------------------
  // 7) FAQ SPF
  // -------------------------
  const spfKeywords = ['spf', 'proteccion solar', 'protección solar', 'protector solar', 'tiene spf'];
  if (includesAny(t, spfKeywords)) {
    return { intent: 'faq' };
  }

  return { intent: 'unknown' };
}

module.exports = { detectIntent };
