// src/core/intents.js
const { normalize } = require("./normalize");

function hasAny(text, keywords) {
  const t = normalize(text);
  return keywords.some((k) => t.includes(normalize(k)));
}

function extractOrderId(text) {
  const m = String(text || "").match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

function detectIntent(text) {
  const raw = String(text || "");
  const t = normalize(raw);

  const shippingKW = [
    "envio","envíos","enviar","entrega","correo",
    "codigo postal","código postal","cp","domicilio","retiro","retirar","sucursal",
    "andreani","oca"
  ];

  const installmentsKW = [
    "cuotas", "en cuotas", "3 cuotas", "6 cuotas", "12 cuotas", "sin interes", "sin interés"
  ];

  const paymentsKW = [
    "pago","pagos","medio de pago","medios de pago","como pagar","cómo pagar",
    "transferencia","debito","débito","credito","crédito","tarjeta",
    "rapipago","pago facil","pago fácil","mercadopago"
  ];

  const promosKW = [
    "promo","promos","promocion","promoción","oferta","ofertas",
    "descuento","descuentos","sale","cyber","black"
  ];

  const orderKW = [
    "pedido","seguimiento","tracking","numero de pedido","número de pedido",
    "estado de mi pedido","donde esta mi pedido","dónde está mi pedido",
    "no me llego","no me llegó","llego mi pedido","llegó mi pedido"
  ];

  // Sol/SPF
  const sunKW = [
    "spf","fps","protector","proteccion solar","protección solar",
    "solar","sol","playa","verano","uv","rayos"
  ];

  // Ozone/Sunstick marca-producto
  const ozoneKW = [
    "ozone","ozone lifestyle","sunstick","protector solar","protectores solares"
  ];

  // Preguntas típicas de “cómo queda / deja blanco / deja color”
  const sunstickLookKW = [
    "deja blanco","deja blanca","deja color","mancha","marca",
    "como queda","cómo queda","queda blanco","queda blanca","rastro",
    "se nota","deja verde","deja marron","deja marrón"
  ];

  const infoKW = [
    "para que sirve","para qué sirve","beneficios","ingredientes",
    "modo de uso","como se usa","cómo se usa","rutina","usar","sirve para"
  ];

  const priceKW = [
    "precio","cuanto sale","cuánto sale","cuanto cuesta","cuánto cuesta",
    "vale","valor","costo","coste"
  ];

  // 1) promos
  if (hasAny(t, promosKW)) return { intent: "promos" };

  // 2) cuotas (más específico que payments)
  if (hasAny(t, installmentsKW)) return { intent: "installments" };

  // 3) payments
  if (hasAny(t, paymentsKW)) return { intent: "payments" };

  // 4) shipping SIEMPRE antes que price
  if (hasAny(t, shippingKW)) return { intent: "shipping" };

  // 5) order
  if (hasAny(t, orderKW)) {
    const orderId = extractOrderId(raw);
    if (orderId) return { intent: "order", orderId };
    return { intent: "order" };
  }

  // 6) Sunstick “cómo queda / deja blanco” (más específico)
  if (hasAny(t, ozoneKW) && hasAny(t, sunstickLookKW)) return { intent: "sunstick" };
  if (hasAny(t, sunstickLookKW) && t.includes("sunstick")) return { intent: "sunstick" };

  // 7) Ozone general
  if (hasAny(t, ozoneKW)) return { intent: "ozone" };

  // 8) Sol/SPF general
  if (hasAny(t, sunKW)) return { intent: "sun" };

  // 9) info
  if (hasAny(t, infoKW)) return { intent: "info" };

  // 10) price
  if (hasAny(t, priceKW)) return { intent: "price" };

  return { intent: "unknown" };
}

module.exports = { detectIntent };
