const express = require('express');
const { handleMessage } = require('../core/messageHandler');

const router = express.Router();

router.post('/', async (req, res) => {
  const result = await handleMessage(req.body);
  return res.status(result.status).json(result.body);
});

module.exports = router;
