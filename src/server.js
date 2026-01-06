require('dotenv').config();
const express = require('express');
const healthRoute = require('./routes/health');
const messageRoute = require('./routes/message');
const whatsappRoute = require('./routes/whatsapp');
const debugRoute = require('./routes/debug');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use('/webhook/whatsapp', whatsappRoute);
app.get('/', (req, res) => res.status(200).send('ok'));

app.use('/health', healthRoute);
app.use('/message', messageRoute);
app.use('/debug', debugRoute);

app.use((err, req, res, next) => {
  console.error('[server] error', err.message);
  res.status(500).json({
    text: 'Perdón, ocurrió un error inesperado. ¿Querés que te derive con un asesor? Te contactamos por WhatsApp.',
    links: [],
    meta: { intent: 'error' }
  });
});

const port = process.env.PORT || 3000;

app.get('/health', (req, res) => res.json({ ok: true }));

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[server] running on port ${port}`);
  });
}

module.exports = app;
