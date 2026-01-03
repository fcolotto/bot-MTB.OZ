const axios = require('axios');
const apiClient = require('./apiClient');

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

  // Tiendanube: price puede venir como objeto por idioma o number/string
  if (product.price !== undefined) {
    const priceValue = pickLang(product.price);
    return priceValue === '' ? null : priceValue;
  }

  // Fallback a variants
  if (Array.isArray(product.variants)) {
    for (const variant of product.variants) {
      if (variant.promotional_price !== undefined) {
        const promoPrice = pickLang(variant.promotional_price);
        if (promoPrice !== '') return promoPrice;
      }
      if (variant.price !== undefined) {
        const variantPrice = pickLang(variant.price);
        if (variantPrice !== '') return variantPrice;
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
    description: pickLang(raw.description || raw.descripcion || ''),
    tags: raw.tags || [],
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

/**
 * Proxy/API (tu backend) — ideal para "getProduct" porque puede resolver por q
 */
async function getProduct(query) {
  const data = await apiClient.get('/product', { q: query });

  if (Array.isArray(data)) return mapProduct(data[0]);
  if (data?.product) return mapProduct(data.product);
  return mapProduct(data);
}

async function getOrder(orderId) {
  const param = process.env.ORDER_ID_PARAM || 'order_id';
  const data = await apiClient.get('/order', { [param]: orderId });

  if (Array.isArray(data)) return mapOrder(data[0]);
  if (data?.order) return mapOrder(data.order);
  return mapOrder(data);
}

async function listProductsFromApi() {
  try {
    const data = await apiClient.get('/products');
    if (Array.isArray(data)) return data.map(mapProduct);
    if (Array.isArray(data?.products)) return data.products.map(mapProduct);
  } catch (error) {
    // si falla el proxy, caemos a TN directo
    return null;
  }
  return null;
}

/**
 * Tiendanube directo (fallback)
 */
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

      if (!Array.isArray(response.data) || response.data.length === 0) break;

      results.push(...response.data.map(mapProduct));
      if (response.data.length < perPage) break;

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
  // 1) Proxy primero (más rápido / controlado / con api-key)
  const fromApi = await listProductsFromApi();
  if (fromApi && fromApi.length) return fromApi;

  // 2) Fallback Tiendanube
  const fromTN = await listProductsFromTiendanube();
  if (fromTN && fromTN.length) return fromTN;

  return [];
}

module.exports = {
  getProduct,
  getOrder,
  listProducts
};
