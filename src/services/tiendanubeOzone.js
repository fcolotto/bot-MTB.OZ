function tnHeaders() {
  const token = process.env.OZONE_ACCESS_TOKEN;
  const ua = process.env.TN_USER_AGENT || "Ozone Bot";
  return {
    Authentication: `bearer ${token}`,
    "User-Agent": ua,
    "Content-Type": "application/json",
  };
}

function baseUrl() {
  const storeId = process.env.OZONE_STORE_ID;
  return `https://api.tiendanube.com/v1/${storeId}`;
}

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐-‒–—−]/g, "-")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickLang(obj) {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  return obj.es || obj.pt || obj.en || Object.values(obj)[0] || "";
}

function getName(p) {
  return pickLang(p?.name) || "";
}

function getPrice(p) {
  const price = p?.price;
  if (price == null) return null;
  if (typeof price === "number") return price;
  if (typeof price === "string") return price;
  return pickLang(price) || null;
}

function getUrl(p) {
  return p?.canonical_url || p?.url || p?.permalink || null;
}

function scoreMatch(q, name) {
  const nq = normalize(q);
  const nn = normalize(name);
  if (!nq || !nn) return 0;
  if (nn === nq) return 100;
  if (nn.includes(nq)) return 80;
  const qWords = new Set(nq.split(" "));
  const nWords = new Set(nn.split(" "));
  let hit = 0;
  for (const w of qWords) if (nWords.has(w)) hit++;
  return Math.round((hit / Math.max(1, qWords.size)) * 60);
}

async function listProductsPage(page = 1, perPage = 50) {
  const r = await fetch(
    `${baseUrl()}/products?page=${page}&per_page=${perPage}`,
    { headers: tnHeaders() }
  );
  const data = await r.json();
  if (!r.ok) {
    const err = new Error(data?.message || "Tiendanube error");
    err.status = r.status;
    throw err;
  }
  return data;
}

async function findBestProduct(q) {
  const pages = await Promise.all([
    listProductsPage(1, 50),
    listProductsPage(2, 50),
  ]);

  const all = [...pages[0], ...pages[1]];
  let best = null;
  let bestScore = 0;

  for (const p of all) {
    const s = scoreMatch(q, getName(p));
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }

  if (!best || bestScore < 40) return null;

  return {
    id: best.id,
    name: getName(best),
    price: getPrice(best),
    url: getUrl(best),
    available: best?.stock_management ? best?.stock > 0 : true,
    score: bestScore,
  };
}

module.exports = { findBestProduct };
