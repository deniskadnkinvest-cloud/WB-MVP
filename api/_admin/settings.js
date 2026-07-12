// ═══════════════════════════════════════════════════════════════
// Admin Settings API — GET / PUT system settings
// ⚠️ ADMIN-ONLY. Все запросы проходят через checkAdminAuth.
// ═══════════════════════════════════════════════════════════════

import { query } from '../_db.js';
import { checkAdminAuth } from './verify.js';

// Реестр разрешённых настроек. Ключи вне реестра запрещены к записи —
// это защищает таблицу settings от записи произвольных ключей.
const SETTINGS_REGISTRY = {
  prompt_lang: { values: ['ru', 'en'] },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── AUTH: только админ ──
  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(403).json({ ok: false, error: 'Access denied' });

  try {
    if (req.method === 'GET') {
      const result = await query('SELECT key, value, description, updated_at FROM settings ORDER BY key');
      return res.json({
        ok: true,
        settings: Object.fromEntries(result.rows.map(r => [r.key, { value: r.value, description: r.description, updated_at: r.updated_at }]))
      });
    }

    if (req.method === 'PUT') {
      const { key, value } = req.body || {};
      if (!key || value === undefined) {
        return res.status(400).json({ ok: false, error: 'key and value required' });
      }

      // Разрешаем запись ТОЛЬКО для ключей из реестра
      const spec = SETTINGS_REGISTRY[key];
      if (!spec) {
        return res.status(400).json({ ok: false, error: `Unknown setting key: '${key}'` });
      }
      // Валидируем значение, если для ключа задан список допустимых
      if (spec.values && !spec.values.includes(value)) {
        return res.status(400).json({ ok: false, error: `Invalid value '${value}' for '${key}'. Allowed: ${spec.values.join(', ')}` });
      }

      await query(
        'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
        [key, value]
      );

      // Сбрасываем кэш языка промптов, если он есть
      try {
        const { invalidateLangCache } = await import('../_prompts.js');
        invalidateLangCache();
      } catch { /* _prompts.js may not exist yet */ }

      console.log(`[admin-settings] Updated by ${auth.user?.firstName || 'admin'}: ${key} = ${value}`);
      return res.json({ ok: true, key, value });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-settings] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
