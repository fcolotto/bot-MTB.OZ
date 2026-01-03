const axios = require('axios');

function createApiClient() {
  const baseURL = process.env.TIENDA_API_BASE_URL;
  if (!baseURL) {
    throw new Error('TIENDA_API_BASE_URL no configurado');
  }

  const apiKey =
    process.env.TIENDA_API_KEY ||
    process.env.X_API_KEY || // fallback por compatibilidad
    '';

  const headers = {
    'content-type': 'application/json'
  };

  // Solo enviamos header si hay key (evita mandar "x-api-key: " vacío)
  if (apiKey) headers['x-api-key'] = apiKey;

  return axios.create({
    baseURL,
    headers,
    timeout: 15000
  });
}

async function get(path, params = {}) {
  const client = createApiClient();
  const response = await client.get(path, { params });
  return response.data;
}

module.exports = { get };
