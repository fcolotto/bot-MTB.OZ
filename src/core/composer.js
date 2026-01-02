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
  const statusText = order.status ? `Estado del pedido ${order.id || ''}: ${order.status}.` : `Recibí el pedido ${order.id || ''}, pero no tengo el estado exacto todavía.`;

  return {
    text: `${statusText} ${itemsText} ${trackingText}`.trim(),
    links: [],
    meta: { intent: 'order', status: order.status || null }
  };
}

function composePriceResponse(product, kits = [], kitLinks = []) {
  if (!product) {
    return {
      text: 'No encontré ese producto. ¿Podés decirme el nombre exacto?',
      links: [],
      meta: { intent: 'price', status: 'not_found' }
    };
  }

  const priceText = product.price ? `El precio de ${product.name} es ${formatCurrency(product.price)}.` : `Encontré ${product.name}, pero no tengo el precio.`;
  const links = [];
  if (product.url) {
    links.push({ label: `Ver ${product.name}`, url: product.url });
  }

  if (kits.length) {
    const kitText = 'También podés encontrarlo en estos kits: ' + kits.map((kit) => kit.kit_name).join(', ') + '.';
    return {
      text: `${priceText} ${kitText}`.trim(),
      links: [...links, ...kitLinks],
      meta: { intent: 'price', product_id: product.id || null }
    };
  }

  return {
    text: priceText,
    links,
    meta: { intent: 'price', product_id: product.id || null }
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
