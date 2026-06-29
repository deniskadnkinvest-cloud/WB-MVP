# Seller Studio Business Brief

Updated: 2026-06-28

Seller Studio is a Telegram Mini App and web SaaS for marketplace sellers. It creates product photos, model photos, locations and marketplace card assets using AI generation.

## Product

- Target users: Wildberries, Ozon and other marketplace sellers.
- Core workflow: upload product or reference photos, choose model/location/style, generate marketplace-ready images.
- Key value: replace expensive product photoshoots with fast repeatable AI content generation.
- Saved assets: custom models, custom locations, generation history and subscription state.

## Current Technical Stack

- Frontend: React + Vite.
- Backend: Node.js/Express in Docker.
- Auth: Telegram Mini App initData and email OTP, both converted to internal JWT.
- Database: PostgreSQL on our database VPS.
- Storage: MinIO/S3-compatible storage on our storage VPS.
- Payments: YooKassa.
- AI providers: KIE.ai and Google GenAI, configured only through environment variables.

## Data Model

- Stable user identity: `tg_{telegramId}`.
- Subscription state: PostgreSQL `subscriptions`.
- Credit accounting: PostgreSQL subscription credits and generation records.
- Saved models: PostgreSQL `user_models`, files in MinIO.
- Saved locations: PostgreSQL `user_locations`, files in MinIO.
- Generated outputs: PostgreSQL `generations`, files in MinIO when uploaded through app storage.

## Tariffs

| Plan | Price | Credits | Notes |
| --- | ---: | ---: | --- |
| `trial` | 500 RUB one-time | 25 | Test-drive package |
| `base` | 5,000 RUB/month | 100 | Saved models, locations and photoshoots |
| `pro` | 14,990 RUB/month | 1000 | Full access for heavy sellers and agencies |

## Launch Priorities

1. Keep auth, subscriptions and credit spending stable.
2. Protect user assets with daily PostgreSQL and MinIO backups.
3. Verify admin tariff assignment before every release.
4. Monitor app, database and storage health.
5. Run smoke tests after deploy: auth, subscription, user-data and upload/download/delete.

## Known Migration Note

All metadata that was available during migration has been moved into PostgreSQL. Some legacy binary image files from the previous storage provider were not recoverable while the old account was blocked by billing. Those assets need to be re-uploaded or regenerated, but their records are preserved in our database.
