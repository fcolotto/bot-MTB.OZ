const express = require("express");

const router = express.Router();

router.get("/ozone", async (req, res) => {
  try {
    const storeId = process.env.OZONE_STORE_ID;
    const token = process.env.OZONE_ACCESS_TOKEN;

    if (!storeId || !token) {
      return res.status(500).json({
        ok: false,
        error: "Missing OZONE_STORE_ID or OZONE_ACCESS_TOKEN in env",
      });
    }

    const r = await fetch(`https://api.tiendanube.com/v1/${storeId}/store`, {
      headers: {
        Authentication: `bearer ${token}`,
        "User-Agent": process.env.TN_USER_AGENT || "Ozone Bot",
        "Content-Type": "application/json",
      },
    });

    const data = await r.json();
    return res.status(r.status).json({ ok: r.ok, status: r.status, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
