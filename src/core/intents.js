// src/core/intents.js
const { normalize } = require("./normalize");

function hasAny(text, keywords) {
  const t = normalize(text);
  return keywords.some((k) => t.includes(normalize(k)));
}

function extractOrderId(text) {
  // busca 4 a 8 dígitos seguidos (ajustable)
  const m = String(text || "").match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

function detectIntent(text) {
  const raw = String(text || "");
  const t = normalize(raw);

  // --- buckets de keywords ---
  const shippingKW = [
    "envio", "envíos", "enviar", "entrega", "correo",
    "codigo postal", "código postal", "cp", "domicilio",
    "retiro", "retirar", "sucursal", "andreani", "oca"
  ];

  const paymentsKW = [
    "pago", "pagos", "medio de pago", "medios de pago", "como pagar",
    "transferencia", "debito", "débito", "credito", "crédito",
    "tarjeta", "cuotas", "rapipago", "pago facil", "pago fácil", "mercadopago"
  ];

  const promosKW = [
    "promo", "promos", "promocion", "promoción", "oferta", "ofertas",
    "descuento", "descuentos", "sale", "cyber", "black"
  ];

  const orderKW = [
    "pedido", "seguimiento", "tracking", "envio de mi pedido", "numero de pedido",
    "estado de mi pedido", "donde esta mi pedido", "dónde está mi pedido",
    "no me llego", "no me llegó", "llego mi pedido", "llegó mi pedido"
  ];

  // SPF / Ozone / sol
  const sunKW = [
    "spf", "fps", "protector", "proteccion solar", "protección solar",
    "solar", "sol", "playa", "verano", "uv", "rayos", "sunstick", "ozone"
  ];

  const infoKW = [
    "para que sirve", "para qué sirve", "beneficios", "ingredientes",
    "modo de uso", "como se usa", "cómo se usa", "rutina", "usar"
  ];

  const priceKW = [
    "precio", "cuanto sale", "cuánto sale", "cuanto cuesta", "cuánto cuesta",
    "vale", "valor", "costo", "coste"
  ];

  // 1) promos
  if (hasAny(t, promosKW)) {
    return { intent: "promos" };
  }

  // 2) payments (incluye transferencia/descuento/cuotas)
  if (hasAny(t, paymentsKW)) {
    return { intent: "payments" };
  }

  // 3) shipping SIEMPRE antes que price
  if (hasAny(t, shippingKW)) {
    return { intent: "shipping" };
  }

  // 4) order
  if (hasAny(t, orderKW)) {
    const orderId = extractOrderId(raw);
    if (orderId) return { intent: "order", orderId };
    return { intent: "order" }; // messageHandler ya pide el número
  }

  // 5) SPF / Ozone
  if (hasAny(t, sunKW)) {
    return { intent: "faq" };
  }

  // 6) info (para qué sirve X)
  if (hasAny(t, infoKW)) {
    return { intent: "info" };
  }

  // 7) price (pero cuidado: que no sea envío)
  if (hasAny(t, priceKW)) {
    return { intent: "price" };
  }

  return { intent: "unknown" };
}

module.exports = { detectIntent };
