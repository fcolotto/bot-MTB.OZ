require('dotenv').config();
console.log('[boot] server.js loaded');

const express = require('express');
const http = require('http');

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

app.get('/version', (req, res) => {
  res.json({
    ok: true,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
    node: process.version
  });
});

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
  console.log('[boot] ready - waiting for requests');
});

// ✅ Keepalive para evitar que Railway “duerma/mate” el container por inactividad.
// No depende de librerías externas.
function keepAlive() {
  // ping local al propio proceso (no sale a internet, no cuesta nada)
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/healthz',
      method: 'GET',
      timeout: 5000
    },
    (res) => {
      // consumir data para cerrar correctamente
      res.on('data', () => {});
      res.on('end', () => {
        console.log(`[keepalive] /healthz -> ${res.statusCode}`);
      });
    }
  );

  req.on('timeout', () => {
    req.destroy(new Error('timeout'));
  });

  req.on('error', (e) => {
    console.log('[keepalive] error', e.message);
  });

  req.end();
}

// En Railway suele venir esta env; si no, igual lo hacemos configurable.
const enableKeepAlive =
  process.env.ENABLE_KEEPALIVE === 'true' ||
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_PROJECT_ID;

if (enableKeepAlive) {
  const everyMs = Number(process.env.KEEPALIVE_INTERVAL_MS || 60_000); // default 60s
  console.log(`[keepalive] enabled interval=${everyMs}ms`);
  setInterval(keepAlive, everyMs);
}

// ✅ Manejar SIGTERM para shutdown prolijo (Railway manda SIGTERM)
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down...');
  server.close(() => {
    console.log('[server] closed');
    process.exit(0);
  });
});

module.exports = app;
