const express = require('express');
const tiendaApi = require('../services/tiendaApi');
const productResolver = require('../services/productResolver');

const router = express.Router();

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

router.get('/products', async (req, res) => {
  try {
    const products = await productResolver.ensureCache();
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

router.get('/cache/names', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();

    const products = await productResolver.ensureCache();

    const names = (products || [])
      .map((p) => {
        const n = p?.name;
        const name =
          typeof n === 'object'
            ? (n.es || n.en || n.pt || '')
            : (n || '');
        return { es: name };
      })
      .filter((x) => x.es);

    const filtered = q
      ? names.filter((x) => x.es.toLowerCase().includes(q))
      : names;

    return res.json({
      ok: true,
      count: filtered.length,
      names: filtered
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


module.exports = router;
