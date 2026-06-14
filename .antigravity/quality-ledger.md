# Quality Ledger Ч Seller Studio AI
## ѕоследний аудит: 2026-06-14
## ”ровень: Deep Audit Level 3 (Chaos)

## Baseline:
- Build: 0 ошибок, Vercel maxDuration=60, font fallback OK
- Undefined CSS vars: исправлено, Firefox @property: исправлено

## AI-RULES:
- Glassmorphism прозрачности < 0.05 Ч намеренный дизайн, не трогать
- TerminalOfMagic симулированные логи Ч WIP, не баг
- --text-muted низкий контраст Ч только дл€ декора

## ќткрытые задачи:
- Firebase verifyIdToken на /api/generate-image
- YooKassa webhook signature
- OTP plaintext > SHA256
- window.confirm/alert > inline modal
