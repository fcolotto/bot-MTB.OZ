# Bot MTB.OZ - Backend Channel-Agnostic

Backend único (Node.js + Express) para recibir mensajes de múltiples canales (WhatsApp/Instagram/Web) y responder texto + links. Los adaptadores de canal consumen un único endpoint: `POST /message`.

## Requisitos
- Node.js LTS
- npm

## Configuración
1. Copiá el archivo de entorno:
   ```bash
   cp .env.example .env
   ```
2. Completá las variables necesarias en `.env`.

### Variables de entorno
- `PORT`: puerto del servidor.
- `TIENDA_API_BASE_URL`: base URL de la API de tienda.
- `X_API_KEY`: API key (header `x-api-key`).
- `ORDER_ID_PARAM`: nombre del query param para `/order`.
- `ORDER_LOOKUP_BY_NAME_EMAIL`: habilita búsqueda por nombre + email si la API lo permite.
- `PRODUCTS_CACHE_TTL_MIN`: TTL del cache de productos.
- `KITS_COLLECTION_URL`: URL fallback para colección de kits.
- `TN_STORE_ID`, `TN_ACCESS_TOKEN`, `TN_USER_AGENT`: opcional para sincronizar slugs/urls desde Tiendanube.
codex/create-new-node.js-backend-project-moy8m7
- `WHATSAPP_VERIFY_TOKEN`: token de verificación del webhook.
- `WHATSAPP_TOKEN`: access token de WhatsApp Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: id del número de WhatsApp.
- `WHATSAPP_API_VERSION`: versión de Graph API (default `v24.0`).

codex/create-new-node.js-backend-project-hrgf3n
- `WHATSAPP_VERIFY_TOKEN`: token de verificación del webhook.
- `WHATSAPP_TOKEN`: access token de WhatsApp Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: id del número de WhatsApp.
- `WHATSAPP_API_VERSION`: versión de Graph API (default `v20.0`).

main
main

## Instalación y uso
```bash
npm install
npm run dev
```

## Endpoints
### GET /health
Respuesta:
```json
{ "ok": true }
```

### POST /message
Body:
```json
{ "channel": "whatsapp", "user_id": "123", "text": "precio crema hidratante" }
```
Respuesta:
```json
{ "text": "...", "links": [{"label":"...","url":"..."}], "meta": {} }
```

## Ejemplos curl
### Health
```bash
curl -X GET http://localhost:3000/health
```

### Precio de producto
```bash
curl -X POST http://localhost:3000/message \
  -H 'Content-Type: application/json' \
  -d '{"channel":"web","user_id":"u1","text":"precio serum iluminador"}'
```

### Estado de pedido
```bash
curl -X POST http://localhost:3000/message \
  -H 'Content-Type: application/json' \
  -d '{"channel":"whatsapp","user_id":"u2","text":"estado de pedido 12345"}'
```

### FAQ protección solar
```bash
curl -X POST http://localhost:3000/message \
  -H 'Content-Type: application/json' \
  -d '{"channel":"instagram","user_id":"u3","text":"¿La crema hidratante tiene protección solar?"}'
```

codex/create-new-node.js-backend-project-moy8m7

codex/create-new-node.js-backend-project-hrgf3n
main
### WhatsApp webhook verificación
```bash
curl -G http://localhost:3000/webhook/whatsapp \
  --data-urlencode 'hub.mode=subscribe' \
  --data-urlencode 'hub.verify_token=TU_VERIFY_TOKEN' \
  --data-urlencode 'hub.challenge=12345'
```

## Configurar Webhooks de Meta
Usá la URL pública `https://<tu-dominio>/webhook/whatsapp` y el mismo `WHATSAPP_VERIFY_TOKEN` configurado en el entorno.

codex/create-new-node.js-backend-project-moy8m7


main
main
## Notas
- Los links de productos se resuelven por API. Si la API no provee URL, se utiliza un cache local regenerable con datos de productos.
- Si la API falla, el bot responde con disculpas y ofrece derivar a un asesor.
