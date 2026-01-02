const axios = require('axios');

function createApiClient() {
  const baseURL = process.env.TIENDA_API_BASE_URL;
  if (!baseURL) {
    throw new Error('TIENDA_API_BASE_URL no configurado');
  }

  const headers = {
    'x-api-key': process.env.X_API_KEY || '',
    'content-type': 'application/json'
  };

  return axios.create({
    baseURL,
    headers,
    timeout: 10000
  });
}

async function get(path, params = {}) {
  const client = createApiClient();
  const response = await client.get(path, { params });
  return response.data;
}

module.exports = { get };
