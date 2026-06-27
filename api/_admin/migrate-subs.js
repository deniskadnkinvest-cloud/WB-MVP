// ═══════════════════════════════════════════════════════════════
// GET /api/admin/migrate-subs
// Прямое восстановление подписок в PostgreSQL по hardcoded списку из Firestore
// ═══════════════════════════════════════════════════════════════

import { query as pgQuery } from '../_db.js';
import { checkAdminAuth } from './verify.js';

const ONE_TIME_TOKEN = '7556bb544bcdb31162cd9bbbf7ab1fdc';

// Список из Firestore dry-run — все юзеры с активными планами
// tg = реальный telegram_id (числовой) или Firestore UID
const USERS_FROM_FIRESTORE = [
  // UID → tg (числовой), план, кредиты
  { tg: '130388073',  email: 'tg_130388073@telegram.user',  plan: 'base',  credits: 94,   creditsTotal: 100,  status: 'active',   grantedByAdmin: true  },
  { tg: '130388073',  email: 'tg_130388073@telegram.user',  plan: 'base',  credits: 1100, creditsTotal: 1100, status: 'active',   grantedByAdmin: true  }, // дубль — возьмём последний
  { tg: '130388073',  email: 'tg_130388073@telegram.user',  plan: 'base',  credits: 1200, creditsTotal: 1200, status: 'active',   grantedByAdmin: true  }, // дубль — возьмём последний
  { tg: '1878016295', email: 'tg_1878016295@telegram.user', plan: 'base',  credits: 100,  creditsTotal: 100,  status: 'active',   grantedByAdmin: false },
  { tg: '640128457',  email: 'tg_640128457@telegram.user',  plan: 'pro',   credits: 960,  creditsTotal: 1000, status: 'active',   grantedByAdmin: false },
  { tg: '8505788696', email: 'tg_8505788696@telegram.user', plan: 'base',  credits: 525,  creditsTotal: 525,  status: 'active',   grantedByAdmin: true  },
  { tg: 'mery20333',  email: 'tg_mery20333@telegram.user',  plan: 'trial', credits: 75,   creditsTotal: 75,   status: 'active',   grantedByAdmin: true  },
  { tg: 'Meet20333',  email: 'tg_Meet20333@telegram.user',  plan: 'trial', credits: 100,  creditsTotal: 100,  status: 'active',   grantedByAdmin: true  },
  { tg: '@mery20333', email: 'tg_@mery20333@telegram.user', plan: 'pro',   credits: 2000, creditsTotal: 2000, status: 'active',   grantedByAdmin: true  },
  { tg: 'LOciv6iqH0SbI5TZcWuX5ELS7992', email: 'tg_LOciv6iqH0SbI5TZcWuX5ELS7992@telegram.user', plan: 'base',  credits: 86,  creditsTotal: 100,  status: 'inactive', grantedByAdmin: false },
  { tg: 'tCK8H3fRmXbkPkuZEpkBRJzlzVV2', email: 'tg_tCK8H3fRmXbkPkuZEpkBRJzlzVV2@telegram.user', plan: 'base',  credits: 95,  creditsTotal: 100,  status: 'inactive', grantedByAdmin: false },
];

// Дедупликация: если один tg встречается несколько раз — берём с максимальными кредитами
function dedup(users) {
  const map = new Map();
  for (const u of users) {
    const existing = map.get(u.tg);
    if (!existing || u.credits > existing.credits) map.set(u.tg, u);
  }
  return [...map.values()];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const providedToken = req.query.token || req.headers['x-migrate-token'];
  const auth = checkAdminAuth(req);
  if (!auth.ok && providedToken !== ONE_TIME_TOKEN) {
    return res.status(403).json({ ok: false, error: 'Access denied' });
  }

  const dryRun = req.query.dry !== 'false';
  const items = dedup(USERS_FROM_FIRESTORE);

  if (dryRun) {
    return res.status(200).json({
      ok: true, dryRun: true,
      message: `DRY RUN: ${items.length} users would be migrated`,
      users: items.map(i => ({ tg: i.tg, plan: i.plan, credits: i.credits })),
    });
  }

  const results = { migrated: 0, errors: [] };

  try {
    // Один запрос на всех — upsert пользователей
    for (const item of items) {
      try {
        const { rows } = await pgQuery(
          `INSERT INTO users (telegram_id, email, role) VALUES ($1, $2, 'user')
           ON CONFLICT (telegram_id) DO UPDATE SET email = COALESCE(NULLIF($2,''), users.email)
           RETURNING id`,
          [item.tg, item.email]
        );
        await pgQuery(
          `INSERT INTO subscriptions (user_id, plan_name, credits, credits_total, status, granted_by_admin)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id) DO UPDATE SET
             plan_name = EXCLUDED.plan_name, credits = EXCLUDED.credits,
             credits_total = EXCLUDED.credits_total, status = EXCLUDED.status,
             granted_by_admin = EXCLUDED.granted_by_admin`,
          [rows[0].id, item.plan, item.credits, item.creditsTotal, item.status, item.grantedByAdmin]
        );
        results.migrated++;
      } catch (err) {
        results.errors.push({ tg: item.tg, error: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      message: `✅ DONE: ${results.migrated} migrated, ${results.errors.length} errors`,
      ...results,
      users: items.map(i => ({ tg: i.tg, plan: i.plan, credits: i.credits })),
    });
  } catch (err) {
    console.error('[migrate-subs]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
