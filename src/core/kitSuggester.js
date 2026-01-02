const kits = require('../data/kits.json');
const { normalize } = require('./normalize');

function suggestKits(productName) {
  if (!productName) return [];
  const normalizedProduct = normalize(productName);

  return kits.filter((kit) => {
    return kit.products_included.some((item) => {
      return normalize(item).includes(normalizedProduct) || normalizedProduct.includes(normalize(item));
    });
  });
}

module.exports = { suggestKits };
