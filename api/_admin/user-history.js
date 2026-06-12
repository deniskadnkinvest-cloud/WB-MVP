// GET /api/user/history — история генераций текущего пользователя
import { ensureFirebaseAdmin } from '../_firebase-admin.js';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

ensureFirebaseAdmin();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const idToken = authHeader.slice(7);
  let uid;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const db = getFirestore();
    const limitCount = Math.min(parseInt(req.query.limit) || 60, 200);
    const typeFilter = req.query.type;

    let queryRef = db.collection('generations')
      .where('userId', '==', uid)
      .where('success', '==', true);

    if (typeFilter) {
      queryRef = db.collection('generations')
        .where('userId', '==', uid)
        .where('success', '==', true)
        .where('type', '==', typeFilter);
    }

    const snap = await queryRef.get();
    let generations = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        imageUrl: d.imageUrl || null,
        type: d.type || 'fashion',
        aspectRatio: d.aspectRatio || '3:4',
        createdAt: d.createdAt || null,
        modelPreset: d.modelPreset || '',
        posePreset: d.posePreset || '',
        backgroundPreset: d.backgroundPreset || '',
        cameraAngle: d.cameraAngle || '',
        garmentUrls: d.garmentUrls || [],
        durationMs: d.durationMs || 0,
        categoryId: d.categoryId || '',
        withHumanModel: d.withHumanModel || false,
        isCardDesign: d.isCardDesign || false,
        cardStyle: d.cardStyle || '',
        isBeautyMode: d.isBeautyMode || false,
        isPhotoEdit: d.isPhotoEdit || false,
        editInstruction: d.editInstruction || '',
        customPoseText: d.customPoseText || '',
      };
    });

    // Сортировка в памяти Node.js по убыванию даты создания (учитывая Firebase Timestamp)
    generations.sort((a, b) => {
      const dateA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : 0;
      const dateB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : 0;
      return dateB - dateA;
    });

    generations = generations.slice(0, limitCount);

    return res.status(200).json({ ok: true, generations, total: generations.length });
  } catch (err) {
    console.error('[user/history] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
