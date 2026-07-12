-- ═══════════════════════════════════════════════════════════════
-- 003: Broadcasts (Telegram-рассылки из админки)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS broadcasts (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  image_url TEXT,
  button_text VARCHAR(255),
  button_url TEXT,
  audience VARCHAR(20) DEFAULT 'all',        -- all | paying | free
  status VARCHAR(20) DEFAULT 'queued',       -- queued | running | completed | failed
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts(created_at DESC);
