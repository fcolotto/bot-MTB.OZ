require('dotenv').config();
console.log('[boot] server.js loaded');

const express = require('express');

const healthRoute = require('./routes/health');
const messageRoute = require('./routes/message');
const whatsappRoute = require('./routes/whatsapp');
const debugRoute = require('./routes/debug');

const app = express();

app.use(express.json({ limit: '1mb' }));

// Root simple (útil para chequeos rápidos)
app.get('/', (req, res) => res.status(200).send('ok'));

// Webhook de WhatsApp
app.use('/webhook/whatsapp', whatsappRoute);

// Rutas principales
app.use('/health', healthRoute);
app.use('/message', messageRoute);
app.use('/debug', debugRoute);

// Handler de errores
app.use((err, req, res, next) => {
  console.error('[server] error', err?.stack || err?.message || err);
  res.status(500).json({
    text: 'Perdón, ocurrió un error inesperado. ¿Querés que te derive con un asesor? Te contactamos por WhatsApp.',
    links: [],
    meta: { intent: 'error' }
  });
});

// ✅ Railway: escuchar SIEMPRE en process.env.PORT
const port = process.env.PORT;
if (!port) {
  console.error('❌ PORT no definido por el entorno (Railway).');
  process.exit(1);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`[server] running on port ${port}`);
});

module.exports = app;
