# Bot MTB.OZ - Backend Channel-Agnostic

Backend único (Node.js + Express) para recibir mensajes de múltiples canales (WhatsApp/Instagram/Web) y responder texto + links. Los adaptadores de canal consumen un único endpoint: `POST /message`.

## Requisitos
- Node.js LTS
- npm

## Configuración
1. Copiá el archivo de entorno:
   ```bash
   cp .env.example .env
