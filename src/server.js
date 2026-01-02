require('dotenv').config();
const express = require('express');
const healthRoute = require('./routes/health');
const messageRoute = require('./routes/message');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRoute);
app.use('/message', messageRoute);

app.use((err, req, res, next) => {
  console.error('[server] error', err.message);
  res.status(500).json({
    text: 'Perdón, ocurrió un error inesperado. ¿Querés que te derive con un asesor? Te contactamos por WhatsApp.',
    links: [],
    meta: { intent: 'error' }
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`[server] running on port ${port}`);
});
