-- ═══════════════════════════════════════════════════════════════
-- VTON-MVP: Полная схема PostgreSQL
-- Запускать на rf-db в базе vton_mvp
-- ═══════════════════════════════════════════════════════════════

-- ═══ USERS ═══
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id VARCHAR(64) UNIQUE,
  email VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ═══ SUBSCRIPTIONS ═══
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  plan_name VARCHAR(20) DEFAULT 'none',
  credits INTEGER DEFAULT 0,
  credits_total INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'inactive',
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN DEFAULT false,
  granted_by_admin BOOLEAN DEFAULT false,
  yookassa_payment_method_id VARCHAR(255),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ PAYMENTS ═══
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  plan_id VARCHAR(20),
  method VARCHAR(50),
  yookassa_payment_id VARCHAR(255),
  amount DECIMAL(10,2),
  credits_amount INTEGER,
  currency VARCHAR(10) DEFAULT 'RUB',
  paid_at TIMESTAMPTZ,
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_yookassa ON payments(yookassa_payment_id);

-- ═══ GENERATIONS ═══
CREATE TABLE IF NOT EXISTS generations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  type VARCHAR(50),
  status VARCHAR(20) DEFAULT 'success',
  duration_ms INTEGER,
  credits_used INTEGER DEFAULT 1,
  prompt TEXT,
  model VARCHAR(50),
  result_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id);

-- ═══ OTP (email одноразовые коды) ═══
CREATE TABLE IF NOT EXISTS otps (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(10) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);

-- ═══ TEMP AUTH SESSIONS (Telegram QR/link auth) ═══
CREATE TABLE IF NOT EXISTS temp_auth_sessions (
  id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(20) DEFAULT 'pending',
  user_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- ═══ STATS ═══
CREATE TABLE IF NOT EXISTS stats_kv (
  key VARCHAR(255) PRIMARY KEY,
  value INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  key VARCHAR(255) NOT NULL,
  value INTEGER DEFAULT 0,
  UNIQUE(date, key)
);

-- ═══ MODELS (сохранённые модели пользователей) ═══
CREATE TABLE IF NOT EXISTS models (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  type VARCHAR(50),
  image_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ LOCATIONS (сохранённые локации) ═══
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(255),
  image_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
