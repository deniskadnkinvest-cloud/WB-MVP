import { query } from '../_db.js';

export default async function handler(req, res) {
  try {
    // 1. Создаем таблицу generations
    await query(`
      CREATE TABLE IF NOT EXISTS generations (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        success BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        duration_ms INT,
        type VARCHAR(50),
        aspect_ratio VARCHAR(20),
        garment_urls JSONB,
        model_preset TEXT,
        pose_preset TEXT,
        background_preset TEXT,
        camera_angle VARCHAR(50),
        category_id VARCHAR(50),
        with_human_model BOOLEAN,
        is_card_design BOOLEAN,
        card_style VARCHAR(100),
        is_beauty_mode BOOLEAN,
        is_photo_edit BOOLEAN,
        edit_instruction TEXT,
        custom_pose_text TEXT,
        attributes JSONB,
        user_product_info TEXT,
        quick_prompt_name VARCHAR(100),
        image_url TEXT,
        error TEXT
      );
    `);

    // 2. Создаем таблицу otps
    await query(`
      CREATE TABLE IF NOT EXISTS otps (
        email VARCHAR(100) PRIMARY KEY,
        code VARCHAR(10),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        attempts INT DEFAULT 0
      );
    `);

    // 3. Создаем таблицу stats_kv для глобальных счетчиков
    await query(`
      CREATE TABLE IF NOT EXISTS stats_kv (
        key VARCHAR(100) PRIMARY KEY,
        value INT DEFAULT 0
      );
    `);

    // 4. Таблица daily_stats
    await query(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        date DATE,
        key VARCHAR(100),
        value INT DEFAULT 0,
        PRIMARY KEY (date, key)
      );
    `);

    return res.status(200).json({ ok: true, message: 'DB tables verified/created.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
