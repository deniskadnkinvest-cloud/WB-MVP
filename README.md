# VTON MVP

Seller Studio is a Telegram Mini App and web app for AI-assisted marketplace product photography.

## Stack

- Frontend: React + Vite.
- Backend: Express.js in Docker.
- Auth: Telegram Mini App initData and email OTP converted to internal JWT.
- Database: PostgreSQL on our database VPS.
- Storage: MinIO/S3-compatible storage on our storage VPS.
- Background jobs: Inngest functions.
- AI: KIE.ai and Google GenAI.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.local.example` and fill required secrets.

3. Run local development:

   ```bash
   npm run dev
   ```

4. Before deploy:

   ```bash
   npm run lint
   npm run build
   ```

## Production Checks

After each deploy, verify:

- `GET /api/auth-ping`
- authenticated `GET /api/subscription`
- authenticated `GET /api/user-data?type=models`
- upload/download/delete through `/api/upload`
- backup freshness on the database/storage VPS
