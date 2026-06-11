import { ensureFirebaseAdmin } from './_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// Initialize Firebase Admin
ensureFirebaseAdmin();

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
    const isLocal = !process.env.VERCEL || process.env.VERCEL_ENV === 'development';

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

    // 2. Save code to Firestore (api rules: bypass client permissions via admin SDK)
    const db = getFirestore();
    await db.collection('otp_codes').doc(email).set({
      code,
      expiresAt,
      email,
      attempts: 0,
      createdAt: new Date()
    });

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
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'Seller Studio <onboarding@resend.dev>';
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: 'Код подтверждения Seller Studio',
            html: `
              <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #0c1020; color: #ffffff;">
                <h2 style="color: #d4af37; text-align: center;">Селлер-Студия</h2>
                <p style="font-size: 16px; text-align: center;">Ваш одноразовый код для входа в виртуальную примерочную:</p>
                <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; color: #ffffff; border: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
                  ${code}
                </div>
                <p style="font-size: 12px; color: #888; text-align: center;">Код действителен в течение 5 минут. Не сообщайте его никому.</p>
              </div>
            `
          })
        });

        if (response.ok) {
          emailSent = true;
          console.log(`✅ Email sent via Resend API to ${email}`);
        } else {
          const errData = await response.json();
          sendError = `Resend API error: ${JSON.stringify(errData)}`;
          console.error(`❌ Resend API sending failed:`, errData);
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
          from: process.env.SMTP_FROM || `"Seller Studio" <${process.env.SMTP_USER}>`,
          to: email,
          subject: 'Код подтверждения Seller Studio',
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #0c1020; color: #ffffff;">
              <h2 style="color: #d4af37; text-align: center;">Селлер-Студия</h2>
              <p style="font-size: 16px; text-align: center;">Ваш одноразовый код для входа в виртуальную примерочную:</p>
              <div style="background-color: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; color: #ffffff; border: 1px solid rgba(255,255,255,0.1); margin: 20px 0;">
                ${code}
              </div>
              <p style="font-size: 12px; color: #888; text-align: center;">Код действителен в течение 5 минут. Не сообщайте его никому.</p>
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
    // User chat is trusted only after Telegram Mini App initData verification.
    // Admin fallback is limited to local/dev environments to avoid leaking OTPs in production.
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramAdminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const targetChatId = verifiedTelegramUser?.id || (isLocal ? telegramAdminChatId : null);
    
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
      return res.status(200).json({
        success: true,
        message: 'OTP generated successfully (debug mode)',
        debug: true,
        code: code
      });
    }

    if (!emailSent) {
      if (sentToTelegram) {
        return res.status(200).json({
          success: true,
          message: verifiedTelegramUser?.id ? 'OTP sent to Telegram' : 'OTP sent to local support fallback',
          telegramFallback: Boolean(verifiedTelegramUser?.id),
          supportFallback: !verifiedTelegramUser?.id,
        });
      }

      return res.status(500).json({
        error: 'Failed to send OTP email',
        details: sendError || 'No email providers (Resend/SMTP) configured in environment variables. Telegram fallback also failed.'
      });
    }

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
