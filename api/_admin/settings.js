// ═══════════════════════════════════════════════════════════════
// Admin Settings API — GET / PUT system settings
// ═══════════════════════════════════════════════════════════════

import { query } from '../_db.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const result = await query('SELECT key, value, description, updated_at FROM settings ORDER BY key');
      return res.json({
        ok: true,
        settings: Object.fromEntries(result.rows.map(r => [r.key, { value: r.value, description: r.description, updated_at: r.updated_at }]))
      });
    }

    if (req.method === 'PUT') {
      const { key, value } = req.body;
      if (!key || value === undefined) {
        return res.status(400).json({ ok: false, error: 'key and value required' });
      }
      // Validate known keys
      const allowedKeys = ['prompt_lang'];
      const allowedValues = { prompt_lang: ['ru', 'en'] };
      if (allowedKeys.includes(key) && allowedValues[key] && !allowedValues[key].includes(value)) {
        return res.status(400).json({ ok: false, error: `Invalid value '${value}' for key '${key}'. Allowed: ${allowedValues[key].join(', ')}` });
      }
      await query(
        'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
        [key, value]
      );
      // Invalidate prompt lang cache if it exists
      try {
        const { invalidateLangCache } = await import('../_prompts.js');
        invalidateLangCache();
      } catch (e) { /* _prompts.js may not exist yet */ }
      
      console.log(`[admin-settings] Updated: ${key} = ${value}`);
      return res.json({ ok: true, key, value });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-settings] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
