require('dotenv').config();
const express = require('express');
const healthRoute = require('./routes/health');
const messageRoute = require('./routes/message');
const whatsappRoute = require('./routes/whatsapp');
codex/create-new-node.js-backend-project-moy8m7
const debugRoute = require('./routes/debug');

main

const app = express();

app.use(express.json({ limit: '1mb' }));

codex/create-new-node.js-backend-project-moy8m7
app.use('/webhook/whatsapp', whatsappRoute);

// Opcional pero útil para testear rápido
main
app.get('/', (req, res) => res.status(200).send('ok'));

app.use('/health', healthRoute);
app.use('/message', messageRoute);
codex/create-new-node.js-backend-project-moy8m7
app.use('/debug', debugRoute);

app.use('/webhook/whatsapp', whatsappRoute);
main

app.use((err, req, res, next) => {
  console.error('[server] error', err.message);
  res.status(500).json({
    text: 'Perdón, ocurrió un error inesperado. ¿Querés que te derive con un asesor? Te contactamos por WhatsApp.',
    links: [],
    meta: { intent: 'error' }
  });
});

codex/create-new-node.js-backend-project-moy8m7
const port = process.env.PORT || 3000;

const port = process.env.PORT || 8080;
main

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[server] running on port ${port}`);
  });
}

module.exports = app;
