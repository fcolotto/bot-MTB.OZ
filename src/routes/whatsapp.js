const express = require('express');
const axios = require('axios');

const router = express.Router();

function extractWaMessage(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const message = change?.messages?.[0];
  return message || null;
}

function isTextMessage(message) {
  return message?.type === 'text' && message?.text?.body;
}

async function sendWhatsAppText(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_API_VERSION || 'v24.0';

  if (!token || !phoneId) {
    throw new Error('Falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en env');
  }

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

  const resp = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return resp.data;
}

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

router.post('/', async (req, res) => {
  // Importante: responder 200 rápido para que Meta no reintente
  res.sendStatus(200);

  try {
    const message = extractWaMessage(req.body || {});
    if (!message) {
      console.log('[wa] ignored: no message');
      return;
    }

    const from = message.from; // ej: "549228..."
    if (!isTextMessage(message)) {
      console.log('[wa] non-text from=', from);
      await sendWhatsAppText(from, 'Por ahora solo puedo leer mensajes de texto 🙂');
      console.log('[wa] replied non-text');
      return;
    }

    const incomingText = message.text.body;
    console.log('[wa] received from=', from, 'text=', incomingText);

    // Reutiliza tu lógica actual del bot (endpoint /message)
    const baseUrl = process.env.PUBLIC_BASE_URL; // ej https://bot-mtboz-production.up.railway.app
    if (!baseUrl) {
      throw new Error('Falta PUBLIC_BASE_URL en env (URL pública del servicio)');
    }

    const botResp = await axios.post(`${baseUrl}/message`, {
      channel: 'whatsapp',
      user_id: from,
      text: incomingText
    });

    const replyText =
      botResp?.data?.text ||
      'Perdón, tuve un problema. ¿Querés que te derive con un asesor?';

    await sendWhatsAppText(from, replyText);
    console.log('[wa] replied ok');
  } catch (err) {
    console.error('[wa] error', err?.response?.data || err.message);
    // Si falla, intentamos igual mandar algo (si tenemos el from)
    try {
      const message = extractWaMessage(req.body || {});
      const from = message?.from;
      if (from) {
        await sendWhatsAppText(from, 'Perdón, tuve un problema técnico. ¿Querés que te derive con un asesor?');
      }
    } catch (e) {
      console.error('[wa] fallback reply error', e.message);
    }
  }
});

module.exports = router;
