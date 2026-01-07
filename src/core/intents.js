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

  // limpiamos puntuación para detectar "hola!!!"
  const cleaned = t.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

  const greetWords = [
    "hola",
    "buenas",
    "buen dia",
    "buen día",
    "buenas tardes",
    "buenas noches",
    "hello",
    "hi"
  ];

  // Si contiene un saludo pero además contiene palabras típicas de intención,
  // NO lo tratamos como greet (ej: "hola precio piel iluminada")
  const intentHints = [
    "precio","cuanto","cuánto","cuesta","sale","vale","valor","costo","coste",
    "envio","envíos","envio","entrega","codigo postal","código postal",
    "pago","pagos","medios de pago","transferencia","tarjeta","cuotas",
    "promo","promos","descuento","oferta",
    "pedido","seguimiento","tracking",
    "spf","fps","proteccion solar","protección solar","playa","sol","uv",
    "ozone","sunstick",
    "para que sirve","para qué sirve","beneficios","ingredientes","modo de uso"
  ];

  const hasGreet = greetWords.some((g) => cleaned === normalize(g) || cleaned.startsWith(normalize(g) + " "));
  if (!hasGreet) return false;

  // si además hay pistas de intención, no es “saludo puro”
  if (intentHints.some((h) => cleaned.includes(normalize(h)))) return false;

  // frases típicas de saludo corto
  if (cleaned.length <= 20) return true;

  // "hola, como estas?" también cuenta como saludo
  if (cleaned.includes("como estas") || cleaned.includes("cómo estás") || cleaned.includes("todo bien")) return true;

  return false;
}

function detectIntent(text) {
  const raw = String(text || "");
  const t = normalize(raw);

  // ---- GREET (saludo puro) ----
  if (isGreetingOnly(raw)) return { intent: "greet" };

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
    "se nota","deja verde","deja marron","deja marrón","deja azul","deja amarillo"
  ];

  const infoKW = [
    "para que sirve","para qué sirve","beneficios","ingredientes",
    "modo de uso","como se usa","cómo se usa","rutina","sirve para"
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
