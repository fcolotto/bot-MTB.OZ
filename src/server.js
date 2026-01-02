require('dotenv').config();
const express = require('express');
const healthRoute = require('./routes/health');
const messageRoute = require('./routes/message');
const whatsappRoute = require('./routes/whatsapp');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRoute);
app.use('/message', messageRoute);
app.use('/webhook/whatsapp', whatsappRoute);

app.use((err, req, res, next) => {
  console.error('[server] error', err.message);
  res.status(500).json({
    text: 'Perdón, ocurrió un error inesperado. ¿Querés que te derive con un asesor? Te contactamos por WhatsApp.',
    links: [],
    meta: { intent: 'error' }
  });
});

const port = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`[server] running on port ${port}`);
  });
}

module.exports = app;
