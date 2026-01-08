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

function isGreetingOnly(raw) {
  const t = normalize(raw);
  const cleaned = t.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

  const greetWords = ["hola", "buenas", "buen dia", "buen día", "buenas tardes", "buenas noches", "hello", "hi"];

  const intentHints = [
    "precio","cuanto","cuánto","cuesta","sale","vale","valor","costo","coste",
    "envio","envíos","entrega","codigo postal","código postal",
    "pago","pagos","transferencia","tarjeta","cuotas",
    "promo","promos","descuento","oferta",
    "pedido","seguimiento","tracking",
    "spf","fps","protector","proteccion solar","protección solar","playa","sol","uv",
    "ozone","sunstick","kids",
    "para que sirve","para qué sirve","beneficios","ingredientes","modo de uso","como se usa","cómo se usa"
  ];

  const hasGreet = greetWords.some((g) => cleaned === normalize(g) || cleaned.startsWith(normalize(g) + " "));
  if (!hasGreet) return false;

  if (intentHints.some((h) => cleaned.includes(normalize(h)))) return false;

  if (cleaned.length <= 20) return true;

  if (cleaned.includes("como estas") || cleaned.includes("cómo estás") || cleaned.includes("todo bien")) return true;

  return false;
}

function detectIntent(text) {
  const raw = String(text || "");
  const t = normalize(raw);

  if (isGreetingOnly(raw)) return { intent: "greet" };

  const shippingKW = [
    "envio","envíos","enviar","entrega","correo",
    "codigo postal","código postal","cp","domicilio","retiro","retirar","sucursal",
    "andreani","oca"
  ];

  const installmentsKW = ["cuotas", "en cuotas", "3 cuotas", "6 cuotas", "12 cuotas", "sin interes", "sin interés"];

  const paymentsKW = [
    "pago","pagos","medio de pago","medios de pago","como pagar","cómo pagar",
    "transferencia","debito","débito","credito","crédito","tarjeta",
    "rapipago","pago facil","pago fácil","mercadopago"
  ];

  // ✅ NO incluir "sale" acá
  const promosKW = [
    "promo","promos","promocion","promoción","oferta","ofertas",
    "descuento","descuentos","cyber","black","hotsale","hot sale"
  ];

  const orderKW = [
    "pedido","seguimiento","tracking","numero de pedido","número de pedido",
    "estado de mi pedido","donde esta mi pedido","dónde está mi pedido",
    "no me llego","no me llegó","llego mi pedido","llegó mi pedido"
  ];

  const sunKW = ["spf","fps","protector","proteccion solar","protección solar","solar","sol","playa","verano","uv","rayos"];

  const ozoneKW = ["ozone","ozone lifestyle","sunstick","kids"];

  const sunstickLookKW = [
    "deja blanco","deja blanca","deja color","mancha","marca",
    "como queda","cómo queda","queda blanco","queda blanca","rastro",
    "se nota","deja verde","deja marron","deja marrón","deja azul","deja amarillo"
  ];

  const infoKW = [
    "para que sirve","para qué sirve","beneficios","ingredientes",
    "modo de uso","como se usa","cómo se usa","rutina","sirve para"
  ];

  // ✅ incluir "sale" solo como palabra, porque la gente dice "cuanto sale X"
  const priceKW = [
    "precio",
    "cuanto sale","cuánto sale","cuanto cuesta","cuánto cuesta",
    "cuesta","sale",
    "vale","valor","costo","coste"
  ];

  if (hasAny(t, promosKW)) return { intent: "promos" };
  if (hasAny(t, installmentsKW)) return { intent: "installments" };
  if (hasAny(t, paymentsKW)) return { intent: "payments" };
  if (hasAny(t, shippingKW)) return { intent: "shipping" };

  if (hasAny(t, orderKW)) {
    const orderId = extractOrderId(raw);
    if (orderId) return { intent: "order", orderId };
    return { intent: "order" };
  }

  if (hasAny(t, ozoneKW) && hasAny(t, sunstickLookKW)) return { intent: "sunstick" };
  if (hasAny(t, sunstickLookKW) && t.includes("sunstick")) return { intent: "sunstick" };

  if (hasAny(t, ozoneKW)) return { intent: "ozone" };
  if (hasAny(t, sunKW)) return { intent: "sun" };

  if (hasAny(t, infoKW)) return { intent: "info" };
  if (hasAny(t, priceKW)) return { intent: "price" };

  return { intent: "unknown" };
}

module.exports = { detectIntent };
