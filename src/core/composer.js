const faqData = require('../data/faq.json');
const ozoneData = require('../data/ozone.json');
const { normalize } = require('./normalize');

function formatCurrency(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(number);
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

  const hasSpf = faqData.spf_positive_keywords.some((keyword) => {
    return haystack.includes(normalize(keyword));
  });

  return hasSpf ? true : null;
}

function pickLang(obj) {
  if (obj == null) return null;
  if (typeof obj === 'string' || typeof obj === 'number') return obj;
  return obj.es || obj.pt || obj.en || null;
}

/**
 * Intenta obtener el precio del producto de forma robusta:
 * - price puede venir como number/string o como objeto por idioma
 * - si no está en product.price, puede estar en variants
 */
function getPrice(product) {
  if (!product) return null;

  const direct =
    product.price ??
    product.promotional_price ??
    product.compare_at_price ??
    product.price_amount ??
    null;

  if (direct != null) {
    const v = pickLang(direct);
    if (v != null && v !== '') return v;
  }

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const preferred =
      product.variants.find((v) => v && (v.available === true || Number(v.stock) > 0)) ||
      product.variants[0];

    const vp =
      preferred?.price ??
      preferred?.promotional_price ??
      preferred?.compare_at_price ??
      preferred?.price_amount ??
      null;

    if (vp != null) {
      const v = pickLang(vp);
      if (v != null && v !== '') return v;
    }
  }

  return null;
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
      text: 'No encontré ese producto. ¿Podés decirme el nombre exacto como aparece en la tienda?',
      links: [],
      meta: { intent: 'price', status: 'not_found' }
    };
  }

  const links = [];
  if (product.url) {
    links.push({ label: `Ver ${product.name}`, url: product.url });
  }

  const priceRaw = getPrice(product);
  const priceFormatted = priceRaw != null ? formatCurrency(priceRaw) : null;

  // Si no hay precio, pedimos variante/tamaño para desambiguar (y porque muchas veces el precio vive en variants)
  if (priceFormatted == null) {
    const followUp = '¿Me decís cuál tamaño/variante querés (por ejemplo 50 ml o 195 ml) así lo busco exacto?';
    const kitText = kits.length
      ? ' También puede estar en estos kits: ' + kits.map((k) => k.kit_name).join(', ') + '.'
      : '';

    return {
      text: `Encontré ${product.name}, pero no me está llegando el precio ahora mismo. ${followUp}${kitText}`.trim(),
      links: kits.length ? [...links, ...kitLinks] : links,
      meta: { intent: 'price', status: 'missing_price', product_id: product.id || null }
    };
  }

  const priceText = `El precio de ${product.name} es ${priceFormatted}.`;

  if (kits.length) {
    const kitText = 'También podés encontrarlo en estos kits: ' + kits.map((kit) => kit.kit_name).join(', ') + '.';
    return {
      text: `${priceText} ${kitText}`.trim(),
      links: [...links, ...kitLinks],
      meta: { intent: 'price', status: 'ok', product_id: product.id || null }
    };
  }

  return {
    text: priceText,
    links,
    meta: { intent: 'price', status: 'ok', product_id: product.id || null }
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
    if (ozoneLink?.url) {
      links.push({ label: ozoneLink.label || ozoneData.label, url: ozoneLink.url });
    }
    return {
      text: `Este producto no tiene protección solar. ${ozoneData.copy}`,
      links,
      meta: { intent: 'faq', product_id: product.id || null, spf: false }
    };
  }

  return {
    text: 'No tengo información confirmada sobre protección solar para este producto. ¿Querés que lo revise un asesor?',
    links: [],
    meta: { intent: 'faq', product_id: product.id || null, spf: 'unknown' }
  };
}

function composeErrorResponse() {
  return {
    text: 'Perdón, tuve un problema para obtener la información. ¿Querés que te derive con un asesor? Te contactamos por WhatsApp.',
    links: [],
    meta: { intent: 'error' }
  };
}

module.exports = {
  composeOrderResponse,
  composePriceResponse,
  composeFaqResponse,
  composeErrorResponse
};
