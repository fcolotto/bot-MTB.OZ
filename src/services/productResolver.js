const fs = require('fs');
const path = require('path');
const tiendaApi = require('./tiendaApi');
const { normalize } = require('../core/normalize');

const cachePath = process.env.PRODUCTS_CACHE_PATH || '/tmp/mtb-products-cache.json';
const cacheDir = path.dirname(cachePath);

function readCache() {
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return { updated_at: null, products: [] };
  }
}

function writeCache(products) {
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const payload = {
      updated_at: new Date().toISOString(),
      products
    };
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('[cache] write error', error.message);
  }
}

function isCacheStale(cache) {
  const ttlMin = Number(process.env.PRODUCTS_CACHE_TTL_MIN || 60);
  if (!cache.updated_at) return true;
  const ageMs = Date.now() - new Date(cache.updated_at).getTime();
  return ageMs > ttlMin * 60 * 1000;
}

async function syncCache() {
  try {
    const products = await tiendaApi.listProducts();
    const safeProducts = products || [];
    console.log(`[cache] refreshed n=${safeProducts.length}`);
    writeCache(safeProducts);
    return safeProducts;
  } catch (error) {
    console.error('[cache] sync error', error.message);
    return [];
  }
}

async function ensureCache() {
  const cache = readCache();
  if (!isCacheStale(cache) && cache.products.length > 0) {
    return cache.products;
  }
  return syncCache();
}

async function resolveProduct(query) {
  if (!query) return null;
  const products = await ensureCache();
  const normalizedQuery = normalize(query);
  return products.find((product) => {
    const name = normalize(product.name || '');
    const slug = normalize(product.slug || '');
    return name.includes(normalizedQuery) || slug.includes(normalizedQuery);
  }) || null;
}

module.exports = {
  resolveProduct,
  ensureCache,
  syncCache
};
