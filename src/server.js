require('dotenv').config();
console.log('[boot] server.js loaded');

const express = require('express');
const http = require('http');

const healthRoute = require('./routes/health');
const messageRoute = require('./routes/message');
const whatsappRoute = require('./routes/whatsapp');
const debugRoute = require('./routes/debug');
const healthOzoneRoute = require('./routes/healthOzone');

const app = express();
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));

// ✅ Health simple (Railway-friendly)
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

// Root
app.get('/', (req, res) => res.status(200).send('ok'));

app.get('/version', (req, res) => {
  res.json({
    ok: true,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
    node: process.version
  });
});

// Routes
// ✅ ESTE es tu webhook final para Meta:
// https://TU_DOMINIO/webhook/whatsapp   (GET verifica / POST mensajes)
app.use('/webhook/whatsapp', whatsappRoute);

// (Opcional) alias más corto por comodidad (no hace daño)
app.use('/whatsapp', whatsappRoute);

app.use('/health', healthRoute);
app.use('/message', messageRoute);
app.use('/debug', debugRoute);
app.use('/health', healthOzoneRoute);
app.use('/ozone', ozoneRoute);


// Error handler
app.use((err, req, res, next) => {
  console.error('[server] error', err?.stack || err?.message || err);
  res.status(500).json({
    text: 'Perdón, ocurrió un error inesperado. ¿Querés que te derive con un asesor? Te contactamos por WhatsApp.',
    links: [],
    meta: { intent: 'error' }
  });
});

// ✅ Railway PORT (pero con fallback local)
const port = Number(process.env.PORT || 3000);

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[server] listening on 0.0.0.0:${port}`);
  console.log('[boot] ready - waiting for requests');
});

// ✅ Keepalive (opcional)
function keepAlive() {
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/healthz',
      method: 'GET',
      timeout: 5000
    },
    (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        console.log(`[keepalive] /healthz -> ${res.statusCode}`);
      });
    }
  );

  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', (e) => console.log('[keepalive] error', e.message));
  req.end();
}

const enableKeepAlive =
  process.env.ENABLE_KEEPALIVE === 'true' ||
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_PROJECT_ID;

if (enableKeepAlive) {
  const everyMs = Number(process.env.KEEPALIVE_INTERVAL_MS || 60_000);
  console.log(`[keepalive] enabled interval=${everyMs}ms`);
  setInterval(keepAlive, everyMs);
}

// ✅ SIGTERM shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down...');
  server.close(() => {
    console.log('[server] closed');
    process.exit(0);
  });
});

module.exports = app;
