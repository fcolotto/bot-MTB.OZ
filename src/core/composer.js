// src/core/composer.js
const faqData = require('../data/faq.json');
const ozoneData = require('../data/ozone.json');
const { normalize } = require('./normalize');

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
    .replace(/<\/h\d>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]*>/g, ' ');

  const decoded = decodeHtmlEntities(text);

  return decoded
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(text, max = 520) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trim() + '…';
}

/**
 * Parse numérico robusto:
 * - Soporta "3.559.500" (miles con puntos)
 * - Soporta "35,595" / "35595" (si viniera con coma)
 */
function toNumberLoose(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;

  const s = String(value).trim();
  if (!s) return NaN;

  // Caso AR: miles con puntos -> los sacamos
  // Caso coma decimal -> la pasamos a punto
  const normalized = s
    .replace(/\./g, '')     // "3.559.500" -> "3559500"
    .replace(/,/g, '.');    // "35595,50" -> "35595.50"

  const n = Number(normalized);
  return Number.isNaN(n) ? NaN : n;
}

/**
 * Normaliza montos ARS:
 * - PRICE_IS_CENTS=true => divide por 100 siempre
 * - Si es "muy grande" para un precio típico de tu tienda => asumimos centavos y dividimos por 100
 *
 * Umbral elegido: 500.000 ARS.
 * En cosmética, un precio real arriba de 500k es rarísimo; si algún día vendés un kit carísimo,
 * podés subir/bajar el umbral con PRICE_CENTS_THRESHOLD.
 */
function normalizeArsAmount(value) {
  if (value === null || value === undefined) return null;

  const n = toNumberLoose(value);
  if (Number.isNaN(n)) return value;

  const forceCents = String(process.env.PRICE_IS_CENTS || '').toLowerCase() === 'true';
  if (forceCents) return n / 100;

  const threshold = Number(process.env.PRICE_CENTS_THRESHOLD || 500000);

  // Si parece un precio “demasiado grande”, casi seguro son centavos
  if (n >= threshold) return n / 100;

  return n;
}

function formatCurrency(value) {
  const normalized = normalizeArsAmount(value);
  if (normalized === null || normalized === undefined) return null;
  if (typeof normalized !== 'number' || Number.isNaN(normalized)) return value;

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(normalized);
}

function extractSpfInfo(product) {
  if (!product) return null;
  if (product.raw?.spf === true || product.raw?.has_spf === true) return true;
  if (product.raw?.spf === false || product.raw?.has_spf === false) return false;

  const haystack = [product.name, product.description, ...(product.tags || [])]
    .filter(Boolean)
    .map((item) => normalize(item))
    .join(' ');

  if (!haystack) return null;

  const hasSpf = faqData.spf_positive_keywords.some((keyword) =>
    haystack.includes(normalize(keyword))
  );

  return hasSpf ? true : null;
}

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

function buildExtrasLinks() {
  const extras = [];
  if (process.env.PROMOS_URL) extras.push({ label: 'Ver promos', url: process.env.PROMOS_URL });
  if (process.env.MEDIOS_PAGO_URL) extras.push({ label: 'Medios de pago', url: process.env.MEDIOS_PAGO_URL });
  if (process.env.ENVIOS_URL) extras.push({ label: 'Calcular envío', url: process.env.ENVIOS_URL });
  return extras;
}

function composePriceResponse(product, kits = [], kitLinks = []) {
  if (!product) {
    return {
      text: 'No encontré ese producto. ¿Podés decirme el nombre exacto (y si es posible el tamaño/variante)?',
      links: [],
      meta: { intent: 'price', status: 'not_found' }
    };
  }

  const name = product.name || 'ese producto';

  // ✅ Normalización fuerte acá (por si viniera en formato raro)
  const normalizedPrice = product.price != null ? normalizeArsAmount(product.price) : null;
  const priceTextValue = normalizedPrice != null ? formatCurrency(normalizedPrice) : null;

  const links = [];
  if (product.url) links.push({ label: `Ver ${name}`, url: product.url });

  const extras = buildExtrasLinks();

  const baseText = priceTextValue
    ? `El precio de ${name} es ${priceTextValue}.`
    : `Encontré ${name}, pero no me está llegando el precio ahora mismo.`;

  const extraText = extras.length
    ? ' Si querés, te dejo links de promos/medios de pago/envíos.'
    : '';

  if (kits.length) {
    const kitText =
      ' También podés encontrarlo en estos kits: ' + kits.map((k) => k.kit_name).join(', ') + '.';

    return {
      text: `${baseText}${kitText}${extraText}`.trim(),
      links: [...links, ...kitLinks, ...extras],
      meta: { intent: 'price', product_id: product.id || null, status: priceTextValue ? 'ok' : 'missing_price' }
    };
  }

  return {
    text: `${baseText}${extraText}`.trim(),
    links: [...links, ...extras],
    meta: { intent: 'price', product_id: product.id || null, status: priceTextValue ? 'ok' : 'missing_price' }
  };
}

function composeInfoResponse(product) {
  if (!product) {
    return {
      text: '¿De qué producto querés info? Decime el nombre y (si aplica) el tamaño/variante.',
      links: [],
      meta: { intent: 'info', status: 'needs_product' }
    };
  }

  const name = product.name || 'ese producto';
  const raw = product.description || product.raw?.description || '';
  const clean = stripHtml(raw);
  const snippet = truncate(clean, 520);

  const links = [];
  if (product.url) links.push({ label: `Ver ${name}`, url: product.url });

  const extras = buildExtrasLinks();
  const extraText = extras.length ? ' También puedo pasarte promos/medios de pago/envíos.' : '';

  if (snippet) {
    return {
      text: `Info de ${name}:\n${snippet}${extraText}`.trim(),
      links: [...links, ...extras],
      meta: { intent: 'info', status: 'ok', product_id: product.id || null }
    };
  }

  return {
    text: `Tengo el link de ${name}. ¿Qué info querés (beneficios, uso, ingredientes)?`,
    links: [...links, ...extras],
    meta: { intent: 'info', status: 'ok', product_id: product.id || null }
  };
}

function composeFaqResponse(product, ozoneLink) {
  if (!product) {
    return {
      text: faqData.needs_product_prompt,
      links: [],
      meta: { intent: 'faq', status: 'needs_product' }
    };
  }

  const spfInfo = extractSpfInfo(product);

  if (spfInfo === true) {
    return {
      text: `Sí, ${product.name} tiene protección solar. ${faqData.spf_usage_tip}`,
      links: product.url ? [{ label: `Ver ${product.name}`, url: product.url }] : [],
      meta: { intent: 'faq', product_id: product.id || null, spf: true }
    };
  }

  if (spfInfo === false) {
    const links = [];
    if (ozoneLink?.url) links.push({ label: ozoneLink.label || ozoneData.label, url: ozoneLink.url });
    return {
      text: `Este producto no tiene protección solar. ${ozoneData.copy}`,
      links,
      meta: { intent: 'faq', product_id: product.id || null, spf: false }
    };
  }

  return {
    text: `No tengo confirmado si ${product.name} tiene SPF. Si querés, te cuento cómo usarlo o te paso opciones con protección.`,
    links: [],
    meta: { intent: 'faq', product_id: product.id || null, spf: 'unknown' }
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
  composeInfoResponse,
  composeFaqResponse,
  composeErrorResponse
};
