import { query } from './_db.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const DEFAULT_RESEND_FROM_EMAIL = 'PANX ID <noreply@panx.app>';

const classifySendError = (sendError = '') => {
  if (sendError.includes('domain is not verified')) {
    return {
      code: 'resend_domain_not_verified',
      error: 'Email-отправка временно не настроена. Мы уже проверяем домен отправителя.',
    };
  }

  return {
    code: 'otp_email_send_failed',
    error: 'Не удалось отправить код на email. Попробуйте ещё раз или войдите с паролем.',
  };
};

function verifyTelegramInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!initData || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const expected = Buffer.from(calculatedHash, 'hex');
    const actual = Buffer.from(hash, 'hex');

    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return null;
    }

    const authDate = Number(params.get('auth_date') || 0);
    if (!authDate || Date.now() / 1000 - authDate > 24 * 60 * 60) {
      return null;
    }

    const userRaw = params.get('user');
    return userRaw ? JSON.parse(userRaw) : null;
  } catch (err) {
    console.warn('[send-otp] Telegram initData verification failed:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let { email, tgInitData } = req.body;
    // Debug-режим OTP (код возвращается в ответе, когда почта не настроена) —
    // строго вне продакшена. Единственный признак — NODE_ENV; на бою всегда 'production'.
    const isLocal = process.env.NODE_ENV !== 'production';

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    email = email.trim().toLowerCase();

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const verifiedTelegramUser = verifyTelegramInitData(tgInitData);

    // 1. Generate 6-digit OTP code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes lifetime

    // 2. Prepare Postgres write. The code is saved only after a delivery channel succeeds.
    const saveOtpCode = async () => {
      await query(`
        INSERT INTO otps (email, code, expires_at, attempts)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (email) DO UPDATE SET
          code = EXCLUDED.code,
          expires_at = EXCLUDED.expires_at,
          attempts = 0,
          created_at = NOW()
      `, [email, code, expiresAt]);
    };

    if (isLocal) {
      console.log(`✉️ [LOCAL] OTP Code generated for ${email} (expires at ${expiresAt.toISOString()})`);
    } else {
      console.log(`✉️ OTP Code generated for ${email} (expires at ${expiresAt.toISOString()})`);
    }

    // 3. Send email via Resend API or SMTP (or fallback to console log for local dev)
    let emailSent = false;
    let sendError = null;

    // A. RESEND API
    if (process.env.RESEND_API_KEY) {
      try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_RESEND_FROM_EMAIL;
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: 'PANX ID: Код для входа в Seller Studio',
            html: `
              <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #0c1020; color: #ffffff;">
                <h2 style="color: #a855f7; text-align: center; letter-spacing: 2px;">PANX ID</h2>
                <p style="font-size: 16px; text-align: center;">Ваш одноразовый код для входа в приложение <b>Seller Studio</b>:</p>
                <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; color: #ffffff; border: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
                  ${code}
                </div>
                <p style="font-size: 12px; color: #888; text-align: center;">Это единый код для доступа к приложениям экосистемы PANX.</p>
              </div>
            `
          })
        });

        if (response.ok) {
          emailSent = true;
          console.log(`✅ Email sent via Resend API to ${email} from ${fromEmail}`);
        } else {
          const errText = await response.text();
          let errData;
          try {
            errData = JSON.parse(errText);
          } catch {
            errData = { message: errText };
          }
          sendError = `Resend API error: ${JSON.stringify(errData)}`;
          console.error(`❌ Resend API sending failed from ${fromEmail}:`, errData);
        }
      } catch (err) {
        sendError = err.message;
        console.error('❌ Resend API request failed:', err);
      }
    }

    // B. SMTP (Nodemailer fallback)
    if (!emailSent && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '465'),
          secure: process.env.SMTP_PORT === '465' || !process.env.SMTP_PORT, // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        const mailOptions = {
          from: process.env.SMTP_FROM || `"PANX ID" <${process.env.SMTP_USER}>`,
          to: email,
          subject: 'PANX ID: Код для входа в Seller Studio',
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #0c1020; color: #ffffff;">
              <h2 style="color: #a855f7; text-align: center; letter-spacing: 2px;">PANX ID</h2>
              <p style="font-size: 16px; text-align: center;">Ваш одноразовый код для входа в приложение <b>Seller Studio</b>:</p>
              <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; color: #ffffff; border: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
                ${code}
              </div>
              <p style="font-size: 12px; color: #888; text-align: center;">Это единый код для доступа к приложениям экосистемы PANX.</p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        emailSent = true;
        console.log(`✅ Email sent via SMTP to ${email}`);
      } catch (err) {
        sendError = err.message;
        console.error('❌ SMTP sending failed:', err);
      }
    }

    // C. TELEGRAM FALLBACK
    // User chat is trusted after Telegram Mini App initData verification, or when
    // the requested email is already linked to a known Telegram user in Postgres.
    // Admin fallback is limited to local/dev environments to avoid leaking OTPs in production.
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramAdminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    let linkedTelegramId = null;

    if (!emailSent && !verifiedTelegramUser && telegramBotToken) {
      try {
        const linkedUser = await query(
          `SELECT telegram_id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [email]
        );
        const candidateTelegramId = String(linkedUser.rows[0]?.telegram_id || '');
        if (/^\d+$/.test(candidateTelegramId)) {
          linkedTelegramId = candidateTelegramId;
        }
      } catch (lookupErr) {
        console.warn('[send-otp] Linked Telegram lookup failed:', lookupErr.message);
      }
    }

    const targetChatId = verifiedTelegramUser?.id || linkedTelegramId || (isLocal ? telegramAdminChatId : null);
    
    let sentToTelegram = false;
    if (!emailSent && telegramBotToken && targetChatId) {
      try {
        const text = [
          `🔑 <b>[OTP Вход] Код подтверждения</b>`,
          `Для почты: <code>${email}</code>`,
          `Код: <b><code>${code}</code></b>`,
          `<i>Код действителен 5 минут. Введите его в приложении.</i>`
        ].join('\n');
        
        const tgUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
        const tgResponse = await fetch(tgUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: text,
            parse_mode: 'HTML'
          })
        });
        
        if (tgResponse.ok) {
          sentToTelegram = true;
          console.log(`✅ OTP Code sent to Telegram Chat (${targetChatId}) for ${email}`);
        } else {
          const tgErrorText = await tgResponse.text();
          sendError = `Telegram API Error for chat ${targetChatId}: ${tgErrorText}`;
          console.error(`❌ Failed to send OTP to Telegram Chat (${targetChatId}):`, tgErrorText);
        }
      } catch (tgErr) {
        sendError = `Telegram fetch error: ${tgErr.message}`;
        console.error(`❌ Telegram send error:`, tgErr.message);
      }
    }

    // D. LOCAL DEBUG FALLBACK
    // If no provider configured and we are running locally, success is returned and code is logged
    if (!emailSent && isLocal) {
      console.log(`⚠️ [LOCAL DEV FALLBACK] No email providers set. OTP Code for ${email} is: ${code}`);
      await saveOtpCode();
      return res.status(200).json({
        success: true,
        message: 'OTP generated successfully (debug mode)',
        debug: true,
        code: code
      });
    }

    if (!emailSent) {
      if (sentToTelegram) {
        await saveOtpCode();
        return res.status(200).json({
          success: true,
          message: verifiedTelegramUser?.id || linkedTelegramId ? 'OTP sent to Telegram' : 'OTP sent to local support fallback',
          telegramFallback: Boolean(verifiedTelegramUser?.id || linkedTelegramId),
          supportFallback: !verifiedTelegramUser?.id && !linkedTelegramId,
        });
      }

      const publicError = classifySendError(sendError);
      return res.status(500).json({
        code: publicError.code,
        error: publicError.error,
        details: sendError || 'No email providers (Resend/SMTP) configured in environment variables. Telegram fallback also failed.'
      });
    }

    await saveOtpCode();
    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      targetChatId: null
    });
  } catch (error) {
    console.error('send-otp error:', error.message);
    return res.status(500).json({
      error: 'Internal server error during OTP send',
      details: error.message
    });
  }
}
