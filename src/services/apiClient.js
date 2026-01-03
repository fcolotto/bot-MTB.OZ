const axios = require('axios');

const baseURL =
  process.env.TIENDA_API_BASE_URL ||
  process.env.PUBLIC_BASE_URL ||
  'http://127.0.0.1:3000';

const client = axios.create({
  baseURL,
  timeout: 15000
});

async function get(path, params = {}) {
  const headers = {};
  if (process.env.TIENDA_API_KEY) {
    headers['x-api-key'] = process.env.TIENDA_API_KEY;
  }

  const resp = await client.get(path, { params, headers });
  return resp.data;
}

module.exports = { get };
