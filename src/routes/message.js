const express = require('express');
const { handleMessage } = require('../core/messageHandler');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const result = await handleMessage(req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('[message] unhandled error', error.message);
    return res.status(500).json({
      text: 'Ocurrió un error inesperado. Probá de nuevo en unos minutos.',
      links: [],
      meta: { intent: 'error' }
    });
  }
});

module.exports = router;
