require('dotenv').config();
console.log('[boot] server.js loaded');

const express = require('express');

const healthRoute = require('./routes/health');
const messageRoute = require('./routes/message');
const whatsappRoute = require('./routes/whatsapp');
const debugRoute = require('./routes/debug');

const app = express();
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));

// ✅ Health simple (Railway-friendly)
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

// Root
app.get('/', (req, res) => res.status(200).send('ok'));

// Routes
app.use('/webhook/whatsapp', whatsappRoute);
app.use('/health', healthRoute);
app.use('/message', messageRoute);
app.use('/debug', debugRoute);

// Error handler
app.use((err, req, res, next) => {
  console.error('[server] error', err?.stack || err?.message || err);
  res.status(500).json({
    text: 'Perdón, ocurrió un error inesperado. ¿Querés que te derive con un asesor? Te contactamos por WhatsApp.',
    links: [],
    meta: { intent: 'error' }
  });
});

// ✅ IMPORTANTÍSIMO: Railway PORT
const port = Number(process.env.PORT);
if (!port) {
  console.error('❌ PORT no definido por el entorno.');
  process.exit(1);
}

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[server] listening on 0.0.0.0:${port}`);
});

// ✅ Manejar SIGTERM para shutdown prolijo (Railway manda SIGTERM)
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down...');
  server.close(() => {
    console.log('[server] closed');
    process.exit(0);
  });
});

module.exports = app;
