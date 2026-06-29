# VTON MVP TODO

## Critical

- Add an atomic credit reservation flow before generation and automatic refund on failed generation.
- Add production rate limiting for `/api/send-otp`, `/api/verify-otp`, `/api/auth-telegram` and `/api/generate-image`.
- Add a health monitor for PostgreSQL, MinIO and the app container.
- Add restore drills: monthly test restore of PostgreSQL dump and MinIO archive to a clean staging server.

## High

- Decompose `src/App.jsx` into feature modules: upload, generation, product mode, photoshoot and billing.
- Decompose `api/generate-image.js` into prompt builders, AI clients, auth/subscription guard and response helpers.
- Add admin-visible backup status and last successful backup timestamp.
- Add authenticated smoke/e2e checks for saved models, saved locations, tariff assignment and credit consumption.

## Medium

- Add Error Boundary for the main app and admin panel.
- Reduce production `console.log` noise and avoid logging PII.
- Add smoke/e2e for `/offer`, login, pricing modal and credit guards.
- Optimize model upload speed and background-removal asset caching.
