
const express = require("express");
const ozoneTN = require("../services/tiendanubeOzone");

const router = express.Router();

// GET /ozone/product?q=iuven
router.get("/product", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ ok: false, error: "Missing q" });

    const product = await ozoneTN.findBestProduct(q);

    if (!product) {
      return res.json({
        ok: true,
        found: false,
        text: `No encontré "${q}" en Ozone. ¿Querés que te pase el link a la tienda para buscarlo?`,
        product: null,
      });
    }

    return res.json({
      ok: true,
      found: true,
      product,
    });
  } catch (e) {
    console.error("[ozone] product error", e.status || "", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
