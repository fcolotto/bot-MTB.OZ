const fs = require('fs');
const path = require('path');
const tiendaApi = require('./tiendaApi');
const { normalize } = require('../core/normalize');

// En prod/containers, /tmp suele ser lo más estable.
// Podés overridear con PRODUCTS_CACHE_PATH
const cachePath =
  process.env.PRODUCTS_CACHE_PATH || '/tmp/mtb-products-cache.json';

const cacheDir = path.dirname(cachePath);

function readCache() {
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(raw);

    // compat: si alguna versión guardó generated_at, lo mapeamos a updated_at
    if (parsed && !parsed.updated_at && parsed.generated_at) {
      parsed.updated_at = parsed.generated_at;
    }

    return {
      updated_at: parsed?.updated_at || null,
      products: Array.isArray(parsed?.products) ? parsed.products : []
    };
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
      products: Array.isArray(products) ? products : []
    };
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error('[cache] write error', error.message);
  }
}

function isCacheStale(cache) {
  const ttlMin = Number(process.env.PRODUCTS_CACHE_TTL_MIN || 60);
  if (!cache?.updated_at) return true;
  const ageMs = Date.now() - new Date(cache.updated_at).getTime();
  return ageMs > ttlMin * 60 * 1000;
}

function findInCache(cache, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  return (
    cache.products.find((product) => {
      const name = normalize(product.name || '');
      const slug = normalize(product.slug || '');
      return name.includes(normalizedQuery) || slug.includes(normalizedQuery);
    }) || null
  );
}

async function syncCache() {
  try {
    const products = await tiendaApi.listProducts();
    const safeProducts = products || [];
    console.log(`[cache] refreshed n=${safeProducts.length}`);
    if (safeProducts.length) writeCache(safeProducts);
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

/**
 * resolveProduct:
 * 1) intenta resolver "vivo" via tiendaApi.getProduct(query) (ideal para precio/url exacto)
 * 2) si no, busca en cache (name/slug includes)
 * 3) si cache está viejo, refresca y reintenta
 */
async function resolveProduct(query) {
  if (!query) return null;

  let liveProduct = null;
  try {
    liveProduct = await tiendaApi.getProduct(query);
  } catch (error) {
    liveProduct = null;
  }

  // si viene bien resuelto, devolvemos directo
  if (liveProduct && (liveProduct.url || liveProduct.name)) return liveProduct;

  const cache = readCache();
  let cachedProduct = findInCache(cache, query);

  if (!cachedProduct || isCacheStale(cache)) {
    await syncCache();
    cachedProduct = findInCache(readCache(), query);
  }

  if (cachedProduct) {
    return {
      ...cachedProduct,
      // si el "live" trajo price, lo priorizamos
      price: liveProduct?.price ?? cachedProduct.price ?? null,
      url: liveProduct?.url ?? cachedProduct.url ?? null
    };
  }

  // último fallback
  return liveProduct;
}

module.exports = {
  resolveProduct,
  ensureCache,
  syncCache
};
