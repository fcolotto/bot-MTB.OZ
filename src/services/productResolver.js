const fs = require('fs');
const path = require('path');
const tiendaApi = require('./tiendaApi');
const { normalize } = require('../core/normalize');

const cachePath = process.env.PRODUCTS_CACHE_PATH || '/tmp/mtb-products-cache.json';
const cacheDir = path.dirname(cachePath);

function pickLang(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.es || value.pt || value.en || '';
}

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function getProductPrice(raw) {
  // TiendaNube suele traer price como string/obj, y variantes con price
  const direct = raw?.price ?? raw?.promotional_price ?? raw?.compare_at_price;
  const p1 = toNumber(pickLang(direct));
  if (p1 != null) return p1;

  const v = Array.isArray(raw?.variants) ? raw.variants : [];
  if (v.length) {
    const pv = toNumber(pickLang(v[0]?.price ?? v[0]?.promotional_price));
    if (pv != null) return pv;
  }

  return null;
}

function normalizeProduct(raw) {
  if (!raw) return null;

  const name = pickLang(raw.name || raw.title) || raw.name || raw.title || '';
  const slug = raw.slug || raw.handle || '';
  const url = raw?.permalink || raw?.canonical_url || raw?.url || null;

  const normalized = {
    id: raw.id || raw.product_id || null,
    name: String(name).trim(),
    slug: String(slug).trim(),
    url,
    description: pickLang(raw.description) || raw.description || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    price: getProductPrice(raw),
    raw // opcional: útil para debug
  };

  // Nunca devuelvas un “producto” sin nombre (eso te está rompiendo el composer)
  if (!normalized.name) return null;

  return normalized;
}

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
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

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

function tokenize(text) {
  const n = normalize(text);
  if (!n) return [];
  return n.split(' ').map((t) => t.trim()).filter(Boolean);
}

function scoreMatch(product, queryTokens) {
  const nameTokens = tokenize(product.name);
  const slugTokens = tokenize(product.slug);

  if (!queryTokens.length) return 0;

  const hay = new Set([...nameTokens, ...slugTokens]);
  let hits = 0;
  for (const t of queryTokens) if (hay.has(t)) hits++;

  // bonus si aparece la frase completa dentro del nombre
  const qStr = queryTokens.join(' ');
  const nameStr = normalize(product.name);
  if (qStr && nameStr.includes(qStr)) hits += 2;

  return hits;
}

function findBestInCache(products, query) {
  const q = normalize(query);
  if (!q) return null;

  // tokens sin basura corta
  const queryTokens = tokenize(q).filter((t) => t.length >= 3);

  let best = null;
  let bestScore = 0;

  for (const p of products || []) {
    if (!p?.name) continue;

    const score = scoreMatch(p, queryTokens);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }

  // umbral mínimo: evita “matches” falopa
  if (bestScore < 2) return null;
  return best;
}

async function syncCache() {
  try {
    const products = await tiendaApi.listProducts();
    const safe = (products || [])
      .map(normalizeProduct)
      .filter(Boolean);

    console.log(`[cache] refreshed n=${safe.length}`);
    if (safe.length) writeCache(safe);
    return safe;
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
 * - Primero intenta “live” (si tu tiendaApi.getProduct() soporta query corta)
 * - Si live viene incompleto, usa cache + fuzzy match
 * - Si cache está viejo, refresca
 */
async function resolveProduct(query) {
  if (!query) return null;

  let liveRaw = null;
  try {
    liveRaw = await tiendaApi.getProduct(query);
  } catch (error) {
    liveRaw = null;
  }

  const live = normalizeProduct(liveRaw);

  // Si live ya está bien, listo
  if (live?.name) return live;

  const cache = readCache();

  let cached = findBestInCache(cache.products, query);

  if (!cached || isCacheStale(cache)) {
    const refreshed = await syncCache();
    cached = findBestInCache(refreshed, query);
  }

  if (!cached) return null;

  // Merge: si live trajo price/url, prioriza
  return {
    ...cached,
    price: live?.price ?? cached.price ?? null,
    url: live?.url ?? cached.url ?? null
  };
}

module.exports = {
  resolveProduct,
  ensureCache,
  syncCache
};
