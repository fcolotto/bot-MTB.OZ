const fs = require('fs');
const path = require('path');
const tiendaApi = require('./tiendaApi');
const { normalize } = require('../core/normalize');

// --------------------
// Config cache
// --------------------
const cachePath =
  process.env.PRODUCTS_CACHE_PATH || '/tmp/mtb-products-cache.json';

const cacheDir = path.dirname(cachePath);

// --------------------
// Helpers
// --------------------
function pickLang(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  return value.es || value.pt || value.en || null;
}

function normalizeProduct(p) {
  if (!p) return null;

  const name = pickLang(p.name) || p.title || p.product_name || '';
  const slug = p.slug || '';
  const description = pickLang(p.description) || '';

  const variants = Array.isArray(p.variants)
    ? p.variants.map((v) => ({
        id: v.id ?? null,
        name: pickLang(v.name) || v.sku || '',
        price: pickLang(v.price) ?? pickLang(v.promotional_price) ?? null,
        sku: v.sku || null,
        raw: v
      }))
    : [];

  return {
    id: p.id ?? p.product_id ?? null,
    name,
    slug,
    description,
    price:
      pickLang(p.price) ??
      pickLang(p.promotional_price) ??
      variants[0]?.price ??
      null,
    promotional_price: pickLang(p.promotional_price) ?? null,
    url: p.url || p.permalink || p.canonical_url || null,
    tags: Array.isArray(p.tags) ? p.tags : [],
    variants,
    raw: p
  };
}

// --------------------
// Cache I/O
// --------------------
function readCache() {
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(raw);

    return {
      updated_at: parsed?.updated_at || null,
      products: Array.isArray(parsed?.products) ? parsed.products : []
    };
  } catch {
    return { updated_at: null, products: [] };
  }
}

function writeCache(products) {
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    fs.writeFileSync(
      cachePath,
      JSON.stringify(
        {
          updated_at: new Date().toISOString(),
          products
        },
        null,
        2
      )
    );
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

// --------------------
// Search
// --------------------
function findInCache(cache, query) {
  const q = normalize(query);
  if (!q) return null;

  return (
    cache.products.find((p) => {
      return (
        normalize(p.name).includes(q) ||
        normalize(p.slug).includes(q)
      );
    }) || null
  );
}

// --------------------
// Sync cache
// --------------------
async function syncCache() {
  try {
    const products = await tiendaApi.listProducts();
    const normalized = (products || [])
      .map(normalizeProduct)
      .filter(Boolean);

    console.log(`[cache] refreshed n=${normalized.length}`);
    if (normalized.length) writeCache(normalized);
    return normalized;
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

// --------------------
// Resolve product
// --------------------
async function resolveProduct(query) {
  if (!query) return null;

  let liveProduct = null;
  try {
    const rawLive = await tiendaApi.getProduct(query);
    liveProduct = normalizeProduct(rawLive);
  } catch {
    liveProduct = null;
  }

  if (liveProduct?.name) return liveProduct;

  const cache = readCache();
  let cachedProduct = findInCache(cache, query);

  if (!cachedProduct || isCacheStale(cache)) {
    await syncCache();
    cachedProduct = findInCache(readCache(), query);
  }

  if (!cachedProduct) return liveProduct;

  return {
    ...cachedProduct,
    price: liveProduct?.price ?? cachedProduct.price ?? null,
    url: liveProduct?.url ?? cachedProduct.url ?? null,
    variants:
      liveProduct?.variants?.length
        ? liveProduct.variants
        : cachedProduct.variants
  };
}

module.exports = {
  resolveProduct,
  ensureCache,
  syncCache
};
