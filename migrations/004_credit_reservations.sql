CREATE TABLE IF NOT EXISTS credit_reservations (
  user_id BIGINT NOT NULL,
  request_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'completed', 'refunded')),
  trial_model_reserved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_status
  ON credit_reservations (status, created_at);
