// src/core/composer.js
const faqData = require('../data/faq.json');
const ozoneData = require('../data/ozone.json');
const { normalize } = require('./normalize');

const STORE_BASE_URL = process.env.STORE_BASE_URL || 'https://www.mariatboticario.shop';

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

function toNumberLoose(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;

  const s = String(value).trim();
  if (!s) return NaN;

  const normalized = s.replace(/\./g, '').replace(/,/g, '.');
  const n = Number(normalized);
  return Number.isNaN(n) ? NaN : n;
}

function normalizeArsAmount(value) {
  if (value === null || value === undefined) return null;

  const n = toNumberLoose(value);
  if (Number.isNaN(n)) return value;

  const forceCents = String(process.env.PRICE_IS_CENTS || '').toLowerCase() === 'true';
  if (forceCents) return n / 100;

  const threshold = Number(process.env.PRICE_CENTS_THRESHOLD || 500000);
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

function composePriceResponse(product, kits = [], kitLinks = []) {
  if (!product) {
    return {
      text: 'No encontré ese producto. ¿Podés decirme el nombre exacto (y si es posible el tamaño/variante)?',
      links: [],
      meta: { intent: 'price', status: 'not_found' }
    };
  }

  const name = product.name || 'ese producto';

  const priceNumber = product.price != null ? normalizeArsAmount(product.price) : null;
  const priceText = priceNumber != null ? formatCurrency(priceNumber) : null;

  let transferText = '';
  if (typeof priceNumber === 'number' && !Number.isNaN(priceNumber)) {
    const transferPrice = Math.round(priceNumber * 0.9);
    transferText = ` Pagando por transferencia tenés 10% OFF: ${formatCurrency(transferPrice)}.`;
  }

  const baseText = priceText
    ? `El precio de ${name} es ${priceText}.${transferText}`
    : `Encontré ${name}, pero no me está llegando el precio ahora mismo.`;

  const links = [];
  if (product.url) links.push({ label: `Ver ${name}`, url: product.url });
  else links.push({ label: 'Ver tienda', url: STORE_BASE_URL });

  if (kits.length) {
    const kitText = ' También podés encontrarlo en estos kits: ' + kits.map((k) => k.kit_name).join(', ') + '.';
    return {
      text: `${baseText}${kitText}`.trim(),
      links: [...links, ...kitLinks],
      meta: { intent: 'price', product_id: product.id || null, status: priceText ? 'ok' : 'missing_price' }
    };
  }

  return {
    text: baseText.trim(),
    links,
    meta: { intent: 'price', product_id: product.id || null, status: priceText ? 'ok' : 'missing_price' }
  };
}

function composePaymentsResponse() {
  return {
    text:
      'Medios de pago: transferencia, Rapipago, Pago Fácil y tarjeta de débito/crédito. ' +
      'Con transferencia tenés 10% OFF. Para ver cuotas y detalles actualizados, miralo en la tienda.',
    links: [{ label: 'Ver tienda', url: STORE_BASE_URL }],
    meta: { intent: 'payments', status: 'ok' }
  };
}

function composeShippingResponse() {
  return {
    text:
      'Hacemos envíos. El costo depende de tu ubicación: podés calcularlo en la tienda ingresando tu código postal al iniciar la compra.',
    links: [{ label: 'Ver tienda', url: STORE_BASE_URL }],
    meta: { intent: 'shipping', status: 'ok' }
  };
}

function composePromosResponse() {
  return {
    text:
      'Las promos vigentes pueden cambiar según la fecha. Para ver las promociones actuales, revisá la tienda.',
    links: [{ label: 'Ver tienda', url: STORE_BASE_URL }],
    meta: { intent: 'promos', status: 'ok' }
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
  else links.push({ label: 'Ver tienda', url: STORE_BASE_URL });

  if (snippet) {
    return {
      text: `Info de ${name}:\n${snippet}`.trim(),
      links,
      meta: { intent: 'info', status: 'ok', product_id: product.id || null }
    };
  }

  return {
    text: `Tengo el link de ${name}. ¿Qué info querés (beneficios, uso, ingredientes)?`,
    links,
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
      links: product.url ? [{ label: `Ver ${product.name}`, url: product.url }] : [{ label: 'Ver tienda', url: STORE_BASE_URL }],
      meta: { intent: 'faq', product_id: product.id || null, spf: true }
    };
  }

  if (spfInfo === false) {
    const links = [];
    if (ozoneLink?.url) links.push({ label: ozoneLink.label || ozoneData.label, url: ozoneLink.url });
    if (!links.length) links.push({ label: 'Ver tienda', url: STORE_BASE_URL });

    return {
      text: `Este producto no tiene protección solar. ${ozoneData.copy}`,
      links,
      meta: { intent: 'faq', product_id: product.id || null, spf: false }
    };
  }

  return {
    text: `No tengo confirmado si ${product.name} tiene SPF.`,
    links: [{ label: 'Ver tienda', url: STORE_BASE_URL }],
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
  composePaymentsResponse,
  composeShippingResponse,
  composePromosResponse,
  composeInfoResponse,
  composeFaqResponse,
  composeErrorResponse
};
