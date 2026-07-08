-- Migration 002: Settings table for system configuration
-- Created: 2026-07-04

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default: промпты на русском языке
INSERT INTO settings (key, value, description) VALUES 
  ('prompt_lang', 'ru', 'Язык системных промптов: ru или en')
ON CONFLICT (key) DO NOTHING;
