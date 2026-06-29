# VTON MVP Project State

Updated: 2026-06-28

## Runtime Architecture

- Frontend: React + Vite, served by the Node/Express container.
- Backend: Node.js/Express API in Docker on the app VPS.
- Auth: Telegram Mini App initData and email OTP issue internal JWT tokens.
- Database: PostgreSQL on the database VPS.
- File storage: MinIO/S3-compatible bucket on the database/storage VPS.
- Payments: YooKassa endpoints in `api/create-payment.js` and `api/payment-webhook-yookassa.js`.
- AI generation: KIE.ai and Google GenAI keys from server environment variables.

## Data Ownership

All user-facing product data is stored on our servers:

- users and Telegram IDs: PostgreSQL `users`
- subscriptions, plans and credits: PostgreSQL `subscriptions`
- generation history: PostgreSQL `generations`
- saved models and locations: PostgreSQL `user_models` and `user_locations`
- uploaded images and generated assets: MinIO bucket configured by `S3_*`

## Production Servers

- App VPS: `72.56.20.222`, container `vton-mvp`.
- Database/storage VPS: `186.246.29.31`, PostgreSQL container `db-komunalka`, MinIO container `vton_minio`.
- Production domain: `https://seller-studio-ai.ru`.

## Backups

Daily backups are configured on the database/storage VPS:

- PostgreSQL custom dumps.
- MinIO data archives.
- Daily local retention under `/root/vton-backups/daily`.
- Mirrored copies on the app VPS under `/root/vton-backups-db-mirror`.

Before any risky migration, create a manual backup and verify it with `pg_restore -l` plus an archive listing.

## Current Launch Risks

- Legacy image files from the old storage provider could not be recovered while billing was blocked. Their metadata is preserved in PostgreSQL, but missing binary assets must be re-uploaded or regenerated.
- Keep `S3_*`, `DATABASE_URL`, `JWT_SECRET`, Telegram, AI and YooKassa secrets only in server `.env` files.
- Do not deploy without `npm run lint`, `npm run build`, and a production smoke test for auth, subscription, user-data and upload/download/delete.
