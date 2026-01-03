const express = require('express');
const productResolver = require('../services/productResolver');

const router = express.Router();

router.get('/products', async (req, res) => {
  try {
    const products = await productResolver.ensureCache();
    return res.json({
      ok: true,
      count: products.length,
      sample: products.slice(0, 3)
    });
  } catch (error) {
    console.error('[debug] products error', error.message);
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
