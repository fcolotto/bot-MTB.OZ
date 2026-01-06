// src/services/llm.js
// LLM "rewriter" para humanizar respuestas sin inventar datos.
//
// Env:
// - OPENAI_API_KEY (required para usarlo)
// - OPENAI_MODEL (optional) default: gpt-4o-mini
// - OPENAI_BASE_URL (optional) default: https://api.openai.com/v1
//
// Uso:
// const { rewrite } = require('../services/llm');
// const text = await rewrite({ systemPrompt, userText, draft });

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

function buildSystem(systemPrompt) {
  return (
    (systemPrompt ? String(systemPrompt) : '') +
    '\n\n' +
    'Tarea: reescribí la respuesta para WhatsApp con tono humano y natural, manteniendo el contenido.' +
    '\n' +
    'Reglas duras:' +
    '\n- NO inventes datos.' +
    '\n- NO cambies números, precios, IDs ni URLs.' +
    '\n- NO agregues información que no esté en el borrador.' +
    '\n- Si el borrador tiene links, no los modifiques.' +
    '\n- Español neutro/rioplatense, corto y claro.' +
    '\n- Devolvé SOLO el texto final (sin JSON, sin comillas, sin markdown).'
  );
}

async function rewrite({ systemPrompt, userText, draft }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Falta OPENAI_API_KEY');

  const baseUrl = process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const messages = [
    { role: 'system', content: buildSystem(systemPrompt) },
    {
      role: 'user',
      content:
        `Mensaje del cliente:\n${String(userText || '')}\n\n` +
        `Borrador actual (texto + links + meta):\n${JSON.stringify(draft || {}, null, 2)}\n\n` +
        `Reescribí SOLO el campo "text" para que suene natural en WhatsApp.`
    }
  ];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages
    })
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 400)}`);
  }

  const json = await res.json();
  const out = json?.choices?.[0]?.message?.content;
  return String(out || '').trim();
}

module.exports = { rewrite };
