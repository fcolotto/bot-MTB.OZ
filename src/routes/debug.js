const express = require('express');
const tiendaApi = require('../services/tiendaApi');
const productResolver = require('../services/productResolver');

const router = express.Router();

// Devuelve sample de productos (usa cache y la refresca si hace falta)
router.get('/products', async (req, res) => {
  try {
    const products =
      typeof productResolver.ensureCache === 'function'
        ? await productResolver.ensureCache()
        : await productResolver.syncCache();

    return res.json({
      ok: true,
      source: 'cache_sync',
      count: products.length,
      sample: products.slice(0, 3)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: { message: error.message }
    });
  }
});

// Lista productos directo desde TiendaNube
router.get('/tn/products', async (req, res) => {
  try {
    const products = await tiendaApi.listProducts();
    return res.json({
      ok: true,
      count: products.length,
      sample: products.slice(0, 3)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      }
    });
  }
});

// Devuelve solo los nombres (para debug)
router.get('/cache/names', async (req, res) => {
  try {
    const products =
      typeof productResolver.ensureCache === 'function'
        ? await productResolver.ensureCache()
        : await productResolver.syncCache();

    const names = products.map((p) => p?.raw?.name || p?.name || null);

    return res.json({
      ok: true,
      count: names.length,
      names
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: { message: error.message }
    });
  }
});

module.exports = router;
