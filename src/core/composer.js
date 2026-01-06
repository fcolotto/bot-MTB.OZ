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

  const hasSpf = (faqData.spf_positive_keywords || []).some((keyword) =>
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
    ? order.items
        .map((item) => item.name || item.title || item.product_name)
        .filter(Boolean)
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
      text: 'No encontré ese producto. ¿Me decís el nombre exacto (y si aplica, el tamaño: 50 ml / 195 ml)?',
      links: [],
      meta: { intent: 'price', status: 'not_found' }
    };
  }

  const name = (product.name || '').trim();
  const safeName = name || 'ese producto';

  const hasPrice = product.price !== null && product.price !== undefined && product.price !== '';
  const priceText = hasPrice
    ? `El precio de ${safeName} es ${formatCurrency(product.price)}.`
    : `Encontré ${safeName}, pero ahora mismo no me está llegando el precio.`;

  const links = [];
  if (product.url) {
    links.push({ label: `Ver ${safeName}`, url: product.url });
  }

  if (kits.length) {
    const kitNames = kits.map((k) => k.kit_name).filter(Boolean);
    const kitText = kitNames.length
      ? `También puede venir en estos kits: ${kitNames.join(', ')}.`
      : '';

    return {
      text: `${priceText} ${kitText}`.trim(),
      links: [...links, ...(kitLinks || [])],
      meta: {
        intent: 'price',
        status: hasPrice ? 'ok' : 'missing_price',
        product_id: product.id || null
      }
    };
  }

  return {
    text: priceText,
    links,
    meta: {
      intent: 'price',
      status: hasPrice ? 'ok' : 'missing_price',
      product_id: product.id || null
    }
  };
}

function composeFaqResponse(product, ozoneLink) {
  if (!product) {
    return {
      text: faqData.needs_product_prompt || '¿De qué producto querés info?',
      links: [],
      meta: { intent: 'faq', status: 'needs_product' }
    };
  }

  const name = (product.name || '').trim();
  const safeName = name || 'ese producto';

  const spfInfo = extractSpfInfo(product);

  if (spfInfo === true) {
    return {
      text: `Sí, ${safeName} tiene protección solar. ${faqData.spf_usage_tip || ''}`.trim(),
      links: product.url ? [{ label: `Ver ${safeName}`, url: product.url }] : [],
      meta: { intent: 'faq', product_id: product.id || null, spf: true }
    };
  }

  if (spfInfo === false) {
    const links = [];
    if (ozoneLink?.url) {
      links.push({ label: ozoneLink.label || ozoneData.label || 'Ver Ozone', url: ozoneLink.url });
    }
    return {
      text: `Este producto no tiene protección solar. ${ozoneData.copy || ''}`.trim(),
      links,
      meta: { intent: 'faq', product_id: product.id || null, spf: false }
    };
  }

  return {
    text: `No tengo información confirmada sobre protección solar para ${safeName}. ¿Querés que lo revise un asesor?`,
    links: product.url ? [{ label: `Ver ${safeName}`, url: product.url }] : [],
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
  composeFaqResponse,
  composeErrorResponse
};
