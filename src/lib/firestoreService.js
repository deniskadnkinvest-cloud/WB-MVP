import {
  collection, doc, addDoc, getDocs, deleteDoc, updateDoc, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ═══════════════════════════════════════
//  МОДЕЛИ (saved_models)
// ═══════════════════════════════════════

/**
 * Сохранить модель.
 * @param {string} uid
 * @param {{ name: string, type: string, imageUrls: string[], storagePaths?: string[], prompt?: string }} data
 */
export const saveModel = async (uid, data) => {
  const colRef = collection(db, 'users', uid, 'saved_models');
  return addDoc(colRef, { ...data, createdAt: serverTimestamp() });
};

/**
 * Получить все модели юзера.
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export const getModels = async (uid) => {
  const colRef = collection(db, 'users', uid, 'saved_models');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Удалить модель.
 * @param {string} uid
 * @param {string} modelId
 */
export const deleteModelDoc = async (uid, modelId) => {
  const docRef = doc(db, 'users', uid, 'saved_models', modelId);
  return deleteDoc(docRef);
};

/**
 * Обновить промпт модели (сохранение модификаторов).
 * @param {string} uid
 * @param {string} modelId
 * @param {string} prompt
 */
export const updateModelPrompt = async (uid, modelId, prompt) => {
  const docRef = doc(db, 'users', uid, 'saved_models', modelId);
  return updateDoc(docRef, { prompt, updatedAt: serverTimestamp() });
};

// ═══════════════════════════════════════
//  ЛОКАЦИИ (saved_locations)
// ═══════════════════════════════════════

/**
 * Сохранить локацию.
 * @param {string} uid
 * @param {{ title: string, imageUrls: string[], storagePaths?: string[], thumbnail: string }} data
 */
export const saveLocation = async (uid, data) => {
  const colRef = collection(db, 'users', uid, 'saved_locations');
  return addDoc(colRef, { ...data, createdAt: serverTimestamp() });
};

/**
 * Получить все локации юзера.
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export const getLocations = async (uid) => {
  const colRef = collection(db, 'users', uid, 'saved_locations');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * Удалить локацию.
 * @param {string} uid
 * @param {string} locationId
 */
export const deleteLocationDoc = async (uid, locationId) => {
  const docRef = doc(db, 'users', uid, 'saved_locations', locationId);
  return deleteDoc(docRef);
};

/**
 * Обновить промпт локации (сохранение модификаторов).
 * @param {string} uid
 * @param {string} locationId
 * @param {string} prompt
 */
export const updateLocationPrompt = async (uid, locationId, prompt) => {
  const docRef = doc(db, 'users', uid, 'saved_locations', locationId);
  return updateDoc(docRef, { prompt, updatedAt: serverTimestamp() });
};
