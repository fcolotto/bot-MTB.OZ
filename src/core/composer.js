// src/core/composer.js
const faqData = require('../data/faq.json');
const ozoneData = require('../data/ozone.json');
const { normalize } = require('./normalize');

// ---- Consts / URLs ----
const MT_URL = process.env.MT_URL || 'https://www.mariatboticario.shop';
const OZONE_URL = process.env.OZONE_URL || 'https://www.ozonelifestyle.com/';

// Si querés, podés setear OZONE_SUNSTICKS_URL a una colección específica.
// Si no existe, cae a OZONE_URL.
const OZONE_SUNSTICKS_URL = process.env.OZONE_SUNSTICKS_URL || OZONE_URL;

// ---- Utils ----
function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(Number(code));
      } catch {
        return _;
      }
    });
}

function stripHtml(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
}

function normalizeArsAmount(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value;

  // Heurística anti-x100:
  // Si viene muy grande y divisible por 100, probablemente son "centavos".
  if (n >= 1000000 && n % 100 === 0) return n / 100;

  return n;
}

function formatCurrency(value) {
  if (value === null || value === undefined) return null;

  const normalized = normalizeArsAmount(value);
  if (typeof normalized !== 'number' || Number.isNaN(normalized)) return value;

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(normalized);
}

function tenOff(price) {
  const n = Number(normalizeArsAmount(price));
  if (Number.isNaN(n)) return null;
  return Math.round(n * 0.9);
}

// ---- Responses ----
function composeOrderResponse(order) {
  if (!order) {
    return {
      text: 'No encontré el pedido. ¿Podés revisar el número y enviármelo de nuevo?',
      links: [],
      meta: { intent: 'order', status: 'not_found' }
    };
  }

  const items = Array.isArray(order.items)
    ? order.items.map((item) => item.name || item.title || item.product_name).filter(Boolean)
    : [];

  const itemsText = items.length ? `Productos: ${items.join(', ')}.` : '';
  const trackingText = order.tracking ? `Tracking: ${order.tracking}.` : '';
  const statusText = order.status
    ? `Estado del pedido ${order.id || ''}: ${order.status}.`
    : `Recibí el pedido ${order.id || ''}, pero no tengo el estado exacto todavía.`;

  return {
    text: `${statusText} ${itemsText} ${trackingText}`.trim(),
    links: [],
    meta: { intent: 'order', status: order.status || null }
  };
}

// Soporta: product = objeto OR array de objetos (para mostrar pocket + corporal)
function composePriceResponse(product, kits = [], kitLinks = []) {
  if (!product || (Array.isArray(product) && product.length === 0)) {
    return {
      text: 'No encontré ese producto. ¿Podés decirme el nombre exacto (y si es posible el tamaño/variante)?',
      links: [],
      meta: { intent: 'price', status: 'not_found' }
    };
  }

  const products = Array.isArray(product) ? product : [product];

  const lines = [];
  const links = [];

  for (const p of products) {
    const name = p?.name || 'ese producto';
    const price = p?.price != null ? formatCurrency(p.price) : null;

    if (p?.url) links.push({ label: `Ver ${name}`, url: p.url });

    if (price) {
      const tf = tenOff(p.price);
      const tfText = tf ? ` Pagando por transferencia tenés 10% OFF: ${formatCurrency(tf)}.` : '';
      lines.push(`• ${name}: ${price}.${tfText}`);
    } else {
      lines.push(`• ${name}: no me está llegando el precio ahora mismo.`);
    }
  }

  return {
    text: lines.join('\n'),
    links,
    meta: {
      intent: 'price',
      status: products.every((p) => p?.price != null) ? 'ok' : 'missing_price',
      product_id: products[0]?.id || null
    }
  };
}

function composeInfoResponse(product) {
  if (!product) {
    return {
      text: '¿De qué producto querés info? Decime el nombre y (si aplica) el tamaño/variante 🙂',
      links: [],
      meta: { intent: 'info', status: 'needs_product' }
    };
  }

  const name = product.name || 'ese producto';
  const raw = product.description || product.raw?.description || '';
  const clean = stripHtml(raw);
  const snippet = clean ? (clean.length > 420 ? clean.slice(0, 420).trim() + '…' : clean) : null;

  const links = [];
  if (product.url) links.push({ label: `Ver ${name}`, url: product.url });

  return {
    text: snippet
      ? `Sobre ${name}: ${snippet}`
      : `Tengo el link de ${name}. ¿Qué info querés (beneficios, uso, ingredientes)?`,
    links,
    meta: { intent: 'info', status: 'ok', product_id: product.id || null }
  };
}

/**
 * Regla de negocio:
 * - Productos María T: NO tienen SPF
 * - Protección solar => Ozone Lifestyle (sitio propio)
 */
function composeSunResponse({ productName }) {
  const name = productName || 'este producto';

  return {
    text: `${name} no tiene protección solar. Si buscás protección, eso lo tenemos en Ozone Lifestyle (protectores solares en formato sunstick). En la web de Ozone podés ver todas las variantes y los videos de aplicación.`,
    links: [{ label: 'Ver Ozone Lifestyle', url: OZONE_URL }],
    meta: { intent: 'sun', status: 'ok' }
  };
}

function composeOzoneResponse() {
  return {
    text: `Sí: los protectores solares de Ozone Lifestyle están pensados con enfoque sustentable. Para ver todas las variantes, tonos y videos de aplicación, revisá la web de Ozone.`,
    links: [{ label: 'Ver Ozone Lifestyle', url: OZONE_URL }],
    meta: { intent: 'ozone', status: 'ok' }
  };
}

function composeSunstickResponse() {
  return {
    text: `Sí, cada color deja un rastro del tono (blanco/blanco, verde/verde, marrón/marrón, etc.). La mejor forma de verlo es con los videos de aplicación en la web de Ozone.`,
    links: [{ label: 'Ver Sunsticks Ozone', url: OZONE_SUNSTICKS_URL }],
    meta: { intent: 'sunstick', status: 'ok' }
  };
}

function composeFaqResponse(product) {
  // Preguntas SPF directas tipo “X tiene SPF?”
  // Por regla de negocio: si es producto María T => NO y derivamos a Ozone.
  if (!product) {
    return {
      text: '¿De qué producto querés saber si tiene protección solar?',
      links: [],
      meta: { intent: 'faq', status: 'needs_product' }
    };
  }

  return composeSunResponse({ productName: product.name });
}

function composePaymentsResponse() {
  return {
    text: 'Medios de pago: transferencia (10% OFF), Rapipago, Pago Fácil y tarjeta de débito/crédito. Para cuotas y detalle actualizado, revisá la tienda.',
    links: [{ label: 'Ver tienda', url: MT_URL }],
    meta: { intent: 'payments', status: 'ok' }
  };
}

function composeInstallmentsResponse() {
  return {
    text: 'Sí, podés pagar con tarjeta y ver las cuotas disponibles al momento de comprar. Para el detalle actualizado, revisalo en la tienda.',
    links: [{ label: 'Ver tienda', url: MT_URL }],
    meta: { intent: 'installments', status: 'ok' }
  };
}

function composeShippingResponse() {
  return {
    text: 'Hacemos envíos. El costo depende de tu ubicación: podés calcularlo en la tienda ingresando tu código postal al iniciar la compra.',
    links: [{ label: 'Ver tienda', url: MT_URL }],
    meta: { intent: 'shipping', status: 'ok' }
  };
}

function composePromosResponse() {
  return {
    text: 'Las promos vigentes pueden cambiar según la fecha. Para ver las promociones actuales, revisá la tienda.',
    links: [{ label: 'Ver tienda', url: MT_URL }],
    meta: { intent: 'promos', status: 'ok' }
  };
}

function composeErrorResponse() {
  return {
    text: 'Perdón, tuve un problema para obtener la información. ¿Querés que te derive con un asesor?',
    links: [],
    meta: { intent: 'error' }
  };
}

module.exports = {
  composeOrderResponse,
  composePriceResponse,
  composePaymentsResponse,
  composeInstallmentsResponse,
  composeShippingResponse,
  composePromosResponse,
  composeInfoResponse,
  composeSunResponse,
  composeOzoneResponse,
  composeSunstickResponse,
  composeFaqResponse,
  composeErrorResponse
};
