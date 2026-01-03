const express = require('express');
const tiendaApi = require('../services/tiendaApi');

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

module.exports = router;
