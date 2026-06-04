// ═══════════════════════════════════════════════════════════════
// GET /api/admin/users
// Возвращает список пользователей из Firestore с поддержкой поиска и пагинации
//
// Query parameters:
//   limit    number?  — количество записей (default 50)
//   search   string?  — поиск по UID, username, firstName, email
// ═══════════════════════════════════════════════════════════════

import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { checkAdminAuth } from './verify.js';

ensureFirebaseAdmin();
const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const adminAuth = checkAdminAuth(req);
  if (!adminAuth.ok) return res.status(403).json({ ok: false, error: 'Нет доступа' });

  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const search = (req.query.search || '').trim().toLowerCase();

    let usersQuery = db.collection('users');
    
    // Если есть поиск, мы загрузим документы и отфильтруем в памяти (так как Firestore не поддерживает поиск подстроки)
    // Либо, если это точный UID, мы можем сделать прямой get
    let usersDocs = [];
    if (search) {
      const snap = await usersQuery.limit(500).get();
      usersDocs = snap.docs.filter(doc => {
        const d = doc.data();
        const uid = doc.id.toLowerCase();
        const username = (d.username || '').toLowerCase();
        const firstName = (d.firstName || '').toLowerCase();
        const email = (d.email || '').toLowerCase();
        return uid.includes(search) || username.includes(search) || firstName.includes(search) || email.includes(search);
      }).slice(0, limit);
    } else {
      // Иначе просто грузим последние 50 пользователей
      // Попробуем отсортировать по createdAt, если поле есть в БД
      let q = usersQuery;
      try {
        q = q.orderBy('createdAt', 'desc');
      } catch (e) {
        // Если индекса нет или поля нет, не сортируем
      }
      const snap = await q.limit(limit).get();
      usersDocs = snap.docs;
    }

    // Загружаем подписки для выбранных пользователей
    const users = await Promise.all(usersDocs.map(async doc => {
      const userData = doc.data();
      const uid = doc.id;

      // Получаем подписку
      const subSnap = await db.doc(`users/${uid}/subscription/current`).get();
      const sub = subSnap.exists ? subSnap.data() : null;

      // Подсчет LTV (суммы всех платежей)
      let ltv = 0;
      if (sub && Array.isArray(sub.payments)) {
        ltv = sub.payments
          .filter(p => p.isTest !== true && p.isGranted !== true && p.amount > 0)
          .reduce((sum, p) => sum + (p.amount || 0), 0);
      }

      return {
        uid,
        username: userData.username || null,
        firstName: userData.firstName || null,
        createdAt: userData.createdAt || null,
        plan: sub?.plan || 'none',
        credits: sub?.credits || 0,
        creditsTotal: sub?.creditsTotal || 0,
        planActivatedAt: sub?.planActivatedAt || null,
        grantedByAdmin: sub?.grantedByAdmin || false,
        ltv,
      };
    }));

    return res.status(200).json({ ok: true, users });
  } catch (err) {
    console.error('[admin/users] Ошибка:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
