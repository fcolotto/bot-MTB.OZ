const fs = require('fs');
const path = require('path');
const tiendaApi = require('./tiendaApi');
const { normalize } = require('../core/normalize');

const cachePath = path.join(__dirname, '..', 'cache', 'products-cache.json');
const cacheDir = path.dirname(cachePath);

function readCache() {
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return { generated_at: null, products: [] };
  }
}

function writeCache(products) {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const payload = {
    generated_at: new Date().toISOString(),
    products
  };
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));
}

function isCacheStale(cache) {
  const ttlMin = Number(process.env.PRODUCTS_CACHE_TTL_MIN || 60);
  if (!cache.generated_at) return true;
  const ageMs = Date.now() - new Date(cache.generated_at).getTime();
  return ageMs > ttlMin * 60 * 1000;
}

async function syncCache() {
  try {
    const products = await tiendaApi.listProducts();
    if (products && products.length) {
      try {
        writeCache(products);
      } catch (error) {
        console.error('[cache] write error', error.message);
      }
    }
    return products || [];
  } catch (error) {
    console.error('[cache] sync error', error.message);
    return [];
  }
}

function findInCache(cache, query) {
  const normalizedQuery = normalize(query);
  return cache.products.find((product) => {
    const name = normalize(product.name || '');
    const slug = normalize(product.slug || '');
    return name.includes(normalizedQuery) || slug.includes(normalizedQuery);
  });
}

async function resolveProduct(query) {
  if (!query) return null;
  let product = null;
  try {
    product = await tiendaApi.getProduct(query);
  } catch (error) {
    product = null;
  }

  if (product && product.url) {
    return product;
  }

  const cache = readCache();
  let cachedProduct = findInCache(cache, query);
  if (!cachedProduct || isCacheStale(cache)) {
    const refreshed = await syncCache();
    if (refreshed.length) {
      cachedProduct = findInCache(readCache(), query);
    }
  }

  if (cachedProduct) {
    return {
      ...cachedProduct,
      price: product?.price || cachedProduct.price || null
    };
  }

  return product;
}

module.exports = {
  resolveProduct,
  syncCache
};
