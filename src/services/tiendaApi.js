const axios = require('axios');

function pickLang(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'object') {
    const candidates = [value.es, value.pt, value.en];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        return candidate;
      }
    }
    for (const candidate of Object.values(value)) {
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        return candidate;
      }
    }
  }
  return '';
}

function getPrice(product) {
  if (!product) return null;
  if (product.price !== undefined) {
    const priceValue = pickLang(product.price);
    return priceValue === '' ? null : priceValue;
  }
  if (Array.isArray(product.variants)) {
    for (const variant of product.variants) {
      if (variant.price !== undefined) {
        const variantPrice = pickLang(variant.price);
        if (variantPrice !== '') return variantPrice;
      }
      if (variant.promotional_price !== undefined) {
        const promoPrice = pickLang(variant.promotional_price);
        if (promoPrice !== '') return promoPrice;
      }
    }
  }
  return null;
}

function mapProduct(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.product_id || raw._id || null,
    name: pickLang(raw.name || raw.title || raw.nombre),
    slug: raw.slug || null,
    price: getPrice(raw),
    url: raw.canonical_url || raw.permalink || raw.url || null,
    variants: raw.variants || [],
    raw
  };
}

function mapOrder(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.order_id || raw._id || null,
    status: raw.status || raw.estado || null,
    tracking: raw.tracking || raw.tracking_url || raw.envio || null,
    items: raw.items || raw.line_items || raw.productos || [],
    created_at: raw.created_at || raw.fecha || null,
    raw
  };
}

async function getOrder(orderId) {
  const param = process.env.ORDER_ID_PARAM || 'order_id';
  const response = await axios.get(`${process.env.TIENDA_API_BASE_URL}/order`, {
    headers: { 'x-api-key': process.env.X_API_KEY || '' },
    params: { [param]: orderId }
  });
  const data = response.data;
  if (Array.isArray(data)) {
    return mapOrder(data[0]);
  }
  if (data?.order) {
    return mapOrder(data.order);
  }
  return mapOrder(data);
}

async function listProductsFromTiendanube() {
  const storeId = process.env.TN_STORE_ID;
  const token = process.env.TN_ACCESS_TOKEN;
  if (!storeId || !token) return null;

  const baseUrl = `https://api.tiendanube.com/v1/${storeId}`;
  const headers = {
    Authentication: `bearer ${token}`,
    'User-Agent': process.env.TN_USER_AGENT || 'Bot-MTB-OZ'
  };

  const results = [];
  let page = 1;
  const perPage = 200;
  try {
    while (true) {
      const response = await axios.get(`${baseUrl}/products`, {
        headers,
        params: { page, per_page: perPage }
      });
      if (!Array.isArray(response.data) || response.data.length === 0) {
        break;
      }
      results.push(...response.data.map(mapProduct));
      if (response.data.length < perPage) {
        break;
      }
      page += 1;
    }
  } catch (error) {
    const status = error.response?.status;
    const message = error.message;
    let data = error.response?.data;
    if (data && typeof data === 'object') {
      const json = JSON.stringify(data);
      data = json.length > 500 ? `${json.slice(0, 500)}...` : json;
    }
    if (typeof data === 'string' && data.length > 500) {
      data = `${data.slice(0, 500)}...`;
    }
    console.error('[tiendanube] list products error', { status, data, message });
    return [];
  }
  return results;
}

async function listProducts() {
  const fromTN = await listProductsFromTiendanube();
  return fromTN || [];
}

module.exports = {
  getOrder,
  listProducts
};
