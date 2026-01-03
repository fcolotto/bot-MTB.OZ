function normalize(value) {
  if (!value) return '';

  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[‐-‒–—−]/g, '-')      // normaliza guiones raros
    .replace(/[^a-z0-9\s-]/g, ' ')  // elimina símbolos
    .replace(/\s+/g, ' ')           // colapsa espacios
    .trim();
}

module.exports = { normalize };
