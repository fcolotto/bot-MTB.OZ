const fs = require('fs');
const path = require('path');
const tiendaApi = require('./tiendaApi');
const { normalize } = require('../core/normalize');

const cachePath = process.env.PRODUCTS_CACHE_PATH || '/tmp/mtb-products-cache.json';
const cacheDir = path.dirname(cachePath);

const STOPWORDS = [
  'hola',
  'buenas',
  'quiero',
  'quisiera',
  'necesito',
  'saber',
  'decirme',
  'me decis',
  'por favor',
  'precio',
  'cuanto',
  'cuesta',
  'vale',
  'sale',
  'link',
  'para',
  'que',
  'sirve',
  'info',
  'informacion',
  'de',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'producto',
  'crema' // importante: “crema” suele meter ruido
];

function readCache() {
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(raw);

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

function cleanQuery(query) {
  const q = normalize(query || '');
  if (!q) return '';

  // sacar “50 ml”, “195ml”, etc.
  const noUnits = q.replace(/\b\d+\s*ml\b/g, ' ').replace(/\bml\b/g, ' ');

  // sacar números sueltos (a veces ensucian)
  const noNumbers = noUnits.replace(/\b\d+\b/g, ' ');

  const words = noNumbers
    .split(' ')
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !STOPWORDS.includes(w));

  return words.join(' ').trim();
}

function scoreProduct(product, tokens) {
  const name = normalize(product?.name || '');
  const slug = normalize(product?.slug || '');

  if (!name && !slug) return 0;

  let score = 0;
  for (const t of tokens) {
    if (!t) continue;
    if (name.includes(t)) score += 3;
    else if (slug.includes(t)) score += 2;
  }

  // pequeño bonus si el match es “más largo”
  score += Math.min(tokens.length, 6);

  return score;
}

function findInCache(cache, query) {
  const cleaned = cleanQuery(query);
  const normalizedQuery = cleaned || normalize(query || '');
  if (!normalizedQuery) return null;

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (!tokens.length) return null;

  let best = null;
  let bestScore = 0;

  for (const product of cache.products || []) {
    const s = scoreProduct(product, tokens);
    if (s > bestScore) {
      bestScore = s;
      best = product;
    }
  }

  // umbral mínimo: evita false positives
  if (bestScore < 6) return null;

  return best;
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

async function resolveProduct(query) {
  if (!query) return null;

  // 1) intentar live con query limpio (mejor hit)
  const cleaned = cleanQuery(query) || query;

  let liveProduct = null;
  try {
    liveProduct = await tiendaApi.getProduct(cleaned);
  } catch (error) {
    liveProduct = null;
  }

  // si el live ya trae name o url, joya
  if (liveProduct && (liveProduct.name || liveProduct.url)) {
    return liveProduct;
  }

  // 2) cache match
  const cache = readCache();
  let cachedProduct = findInCache(cache, query);

  if (!cachedProduct || isCacheStale(cache)) {
    await syncCache();
    cachedProduct = findInCache(readCache(), query);
  }

  if (cachedProduct) {
    return {
      ...cachedProduct,
      // priorizamos lo que venga del live si existe
      price: liveProduct?.price ?? cachedProduct.price ?? null,
      url: liveProduct?.url ?? cachedProduct.url ?? null,
      name: liveProduct?.name ?? cachedProduct.name ?? null
    };
  }

  // 3) último fallback
  return liveProduct;
}

module.exports = {
  resolveProduct,
  ensureCache,
  syncCache
};
