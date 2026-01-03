const express = require('express');
const { handleMessage } = require('../core/messageHandler');

const router = express.Router();

function extractMessage(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const message = change?.messages?.[0];
  const contact = change?.contacts?.[0];
  return { message, contact };
}

function isTextMessage(message) {
  return message?.type === 'text' && message?.text?.body;
}

function isFromSelf(message) {
  const from = message?.from;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return !!from && !!phoneId && from === phoneId;
}

async function sendWhatsAppMessage(to, text) {
  const version = process.env.WHATSAPP_API_VERSION || 'v20.0';
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN no configurado');
  }

  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${errorText}`);
  }
  return response.json();
}

router.get('/', (req, res) => {
  console.log('[wa] verification request');
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
  const { message } = extractMessage(req.body || {});

  if (!message) {
    console.log('[wa] ignored: no message payload');
    return res.sendStatus(200);
  }

  if (isFromSelf(message)) {
    console.log('[wa] ignored: self message');
    return res.sendStatus(200);
  }

  const sender = message.from;
  if (!isTextMessage(message)) {
    console.log('[wa] received non-text');
    try {
      await sendWhatsAppMessage(sender, 'Por ahora solo puedo leer mensajes de texto 🙂');
      console.log('[wa] replied non-text');
    } catch (error) {
      console.error('[wa] reply error', error.message);
    }
    return res.sendStatus(200);
  }

  const incomingText = message.text.body;
  console.log(`[wa] received message from=${sender}`);

  const result = await handleMessage({ channel: 'whatsapp', user_id: sender, text: incomingText });
  const replyText = result.body?.text || 'Perdón, tuve un problema. ¿Querés que te derive con un asesor?';

  try {
    await sendWhatsAppMessage(sender, replyText);
    console.log('[wa] replied');
  } catch (error) {
    console.error('[wa] reply error', error.message);
  }

  return res.sendStatus(200);
});

module.exports = router;
