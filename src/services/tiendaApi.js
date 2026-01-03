const apiClient = require('./apiClient');
const axios = require('axios');

function mapProduct(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.product_id || raw._id || null,
    name: raw.name || raw.title || raw.nombre || null,
    price: raw.price || raw.precio || raw.amount || null,
    url: raw.url || raw.link || raw.canonical_url || raw.permalink || null,
    slug: raw.slug || null,
    description: raw.description || raw.descripcion || null,
    tags: raw.tags || raw.etiquetas || [],
    variants: raw.variants || raw.variantes || [],
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

async function getProduct(query) {
  const data = await apiClient.get('/product', { q: query });
  if (Array.isArray(data)) {
    return mapProduct(data[0]);
  }
  if (data?.product) {
    return mapProduct(data.product);
  }
  return mapProduct(data);
}

async function getOrder(orderId) {
  const param = process.env.ORDER_ID_PARAM || 'order_id';
  const data = await apiClient.get('/order', { [param]: orderId });
  if (Array.isArray(data)) {
    return mapOrder(data[0]);
  }
  if (data?.order) {
    return mapOrder(data.order);
  }
  return mapOrder(data);
}

async function listProductsFromApi() {
  try {
    const data = await apiClient.get('/products');
    if (Array.isArray(data)) {
      return data.map(mapProduct);
    }
    if (Array.isArray(data?.products)) {
      return data.products.map(mapProduct);
    }
  } catch (error) {
    return null;
  }
  return null;
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
    const data = error.response?.data;
    const message = error.message;
    console.error('[tiendanube] list products error', { status, data, message });
    return [];
  }
  return results;
}

async function listProducts() {
  const fromApi = await listProductsFromApi();
  if (fromApi && fromApi.length) {
    return fromApi;
  }
  const fromTN = await listProductsFromTiendanube();
  if (fromTN && fromTN.length) {
    return fromTN;
  }
  return [];
}

module.exports = {
  getProduct,
  getOrder,
  listProducts
};
