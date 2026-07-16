import { pool, query } from './_db.js';

let schemaPromise = null;

function billingError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.isBillingError = true;
  Object.assign(error, details);
  return error;
}

export function ensureCreditReservationsSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`
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
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_credit_reservations_status
        ON credit_reservations (status, created_at)
      `);
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

export async function reserveGenerationBalance({ user, uid, amount, requestId, usesOwnModel }) {
  await ensureCreditReservationsSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const debit = await client.query(
      `UPDATE subscriptions
       SET credits = credits - $1,
           updated_at = NOW()
       WHERE user_id = $2
         AND credits >= $1
         AND plan_name != 'none'
         AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW() OR granted_by_admin IS TRUE)
       RETURNING credits, plan_name`,
      [amount, user.id]
    );

    if (debit.rows.length === 0) {
      const subCheck = await client.query(
        `SELECT plan_name, credits, status, expires_at, granted_by_admin
         FROM subscriptions
         WHERE user_id = $1
         LIMIT 1`,
        [user.id]
      );
      const sub = subCheck.rows[0];
      const hasExpired = sub?.expires_at
        && new Date(sub.expires_at) <= new Date()
        && !sub.granted_by_admin;
      if (!sub || sub.plan_name === 'none' || sub.status !== 'active' || hasExpired) {
        throw billingError('Для генерации нужен активный тариф.', 'NO_PLAN', {
          creditsRemaining: sub?.credits || 0,
        });
      }
      throw billingError(
        `Недостаточно кредитов: нужно ${amount}, доступно ${sub.credits || 0}.`,
        'INSUFFICIENT_CREDITS',
        { creditsRemaining: sub.credits || 0 }
      );
    }

    const planName = debit.rows[0].plan_name;
    let trialModelReserved = false;
    if (usesOwnModel && planName === 'trial') {
      const trialSlot = await client.query(
        `UPDATE subscriptions
         SET model_gens_used = COALESCE(model_gens_used, 0) + 1,
             updated_at = NOW()
         WHERE user_id = $1
           AND plan_name = 'trial'
           AND COALESCE(model_gens_used, 0) < 1
         RETURNING model_gens_used`,
        [user.id]
      );
      if (trialSlot.rows.length === 0) {
        throw billingError(
          'На тарифе Тест-драйв доступна только 1 генерация с собственной моделью. Для безлимитных генераций со своей моделью перейдите на тариф Про или Gold Seller.',
          'TRIAL_MODEL_LIMIT',
          { isTrialModelLimit: true }
        );
      }
      trialModelReserved = true;
    }

    await client.query(
      `INSERT INTO credit_reservations
         (user_id, request_id, amount, status, trial_model_reserved)
       VALUES ($1, $2, $3, 'reserved', $4)`,
      [user.id, requestId, amount, trialModelReserved]
    );

    await client.query('COMMIT');
    return {
      userId: user.id,
      uid,
      amount,
      requestId,
      creditsRemaining: debit.rows[0].credits || 0,
      planName,
      trialModelReserved,
      refunded: false,
      completed: false,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') {
      throw billingError('Этот запрос генерации уже обрабатывался.', 'DUPLICATE_REQUEST');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function completeCreditReservation(reservation) {
  if (!reservation || reservation.completed || reservation.refunded) return null;
  const result = await query(
    `UPDATE credit_reservations
     SET status = 'completed', updated_at = NOW()
     WHERE user_id = $1 AND request_id = $2 AND status = 'reserved'
     RETURNING request_id`,
    [reservation.userId, reservation.requestId],
    { retryUnsafe: true, attempts: 3 }
  );
  if (result.rows.length > 0) {
    reservation.completed = true;
    return result.rows[0];
  }

  // An ambiguous network failure may have committed the first UPDATE before a
  // retry. Read back the durable state instead of treating that as a failure.
  const existing = await query(
    `SELECT status FROM credit_reservations WHERE user_id = $1 AND request_id = $2`,
    [reservation.userId, reservation.requestId]
  );
  reservation.completed = existing.rows[0]?.status === 'completed';
  reservation.refunded = existing.rows[0]?.status === 'refunded';
  if (!reservation.completed && !reservation.refunded) {
    throw new Error(`Credit reservation ${reservation.requestId} was not found during commit`);
  }
  return existing.rows[0];
}

export async function refundCreditReservationPersisted(reservation, reason) {
  if (!reservation || reservation.refunded || reservation.completed) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE credit_reservations
       SET status = 'refunded', updated_at = NOW()
       WHERE user_id = $1 AND request_id = $2 AND status = 'reserved'
       RETURNING amount, trial_model_reserved`,
      [reservation.userId, reservation.requestId]
    );
    if (claimed.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }

    const persisted = claimed.rows[0];
    const result = await client.query(
      `UPDATE subscriptions
       SET credits = credits + $1,
           model_gens_used = GREATEST(
             0,
             COALESCE(model_gens_used, 0) - CASE WHEN $3 THEN 1 ELSE 0 END
           ),
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING credits`,
      [persisted.amount, reservation.userId, persisted.trial_model_reserved]
    );
    await client.query('COMMIT');
    reservation.refunded = true;
    reservation.creditsRemaining = result.rows[0]?.credits
      ?? reservation.creditsRemaining + persisted.amount;
    console.log(
      `[Credit Refunded] user=${reservation.uid} dbUser=${reservation.userId} amount=${persisted.amount} `
      + `remaining=${reservation.creditsRemaining} request=${reservation.requestId} reason=${reason}`
    );
    return { creditsRemaining: reservation.creditsRemaining };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function recoverOrphanedCreditReservations() {
  await ensureCreditReservationsSchema();
  const result = await pool.query(`
    WITH orphaned AS (
      UPDATE credit_reservations
      SET status = 'refunded', updated_at = NOW()
      WHERE status = 'reserved'
      RETURNING user_id, amount, trial_model_reserved
    ), totals AS (
      SELECT
        user_id,
        SUM(amount)::INTEGER AS amount,
        SUM(CASE WHEN trial_model_reserved THEN 1 ELSE 0 END)::INTEGER AS trial_slots
      FROM orphaned
      GROUP BY user_id
    )
    UPDATE subscriptions AS subscription
    SET credits = subscription.credits + totals.amount,
        model_gens_used = GREATEST(
          0,
          COALESCE(subscription.model_gens_used, 0) - totals.trial_slots
        ),
        updated_at = NOW()
    FROM totals
    WHERE subscription.user_id = totals.user_id
    RETURNING subscription.user_id
  `);
  await pool.query(`
    DELETE FROM credit_reservations
    WHERE status != 'reserved' AND updated_at < NOW() - INTERVAL '30 days'
  `);
  return result.rowCount || 0;
}
