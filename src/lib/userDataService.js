// src/lib/userDataService.js
// User data operations through the PostgreSQL API.
// Все функции сохраняют оригинальные сигнатуры и типы возвращаемых данных

import { apiFetch } from './api';

// ═══════════════════════════════════════
//  ГЕНЕРАЦИИ (generations) — Галерея
// ═══════════════════════════════════════

/**
 * Получить историю генераций юзера (последние N).
 * @param {string} uid
 * @param {number} maxResults — максимум записей (default 50)
 * @returns {Promise<Array>}
 */
export const getUserGenerations = async (uid, maxResults = 50) => {
  const params = new URLSearchParams({ type: 'generations', uid, limit: String(maxResults) });
  const res = await apiFetch(`/api/user-data?${params}`);
  if (!res.ok) {
    console.error('[userDataService] Ошибка получения генераций:', res.status);
    return [];
  }
  const json = await res.json();
  return json.data || [];
};

export const getGenerationTasks = async (uid, maxResults = 100) => {
  const params = new URLSearchParams({ type: 'generation-tasks', uid, limit: String(maxResults) });
  const res = await apiFetch(`/api/user-data?${params}`);
  if (!res.ok) throw new Error('Не удалось обновить статусы генераций');
  const json = await res.json();
  return json.data || [];
};

export const deleteGeneration = async (uid, generationId) => {
  const params = new URLSearchParams({ type: 'generation', id: generationId });
  const res = await apiFetch(`/api/user-data?${params}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Не удалось удалить работу');
  }
};

// ═══════════════════════════════════════
//  МОДЕЛИ (saved_models)
// ═══════════════════════════════════════

/**
 * Сохранить модель.
 * @param {string} uid
 * @param {{ name: string, type: string, imageUrls: string[], storagePaths?: string[], prompt?: string }} data
 */
export const saveModel = async (uid, data) => {
  const { type: modelSubType, ...rest } = data;
  const res = await apiFetch('/api/user-data', {
    method: 'POST',
    body: JSON.stringify({ type: 'model', uid, model_type: modelSubType, ...rest }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения модели');
  }
  const json = await res.json();
  return json.data || { id: json.id };
};

/**
 * Обновить данные модели.
 * @param {string} uid
 * @param {string} modelId
 * @param {object} data
 */
export const updateModel = async (uid, modelId, data) => {
  const { type: modelSubType, ...rest } = data;
  const res = await apiFetch('/api/user-data', {
    method: 'PATCH',
    body: JSON.stringify({ type: 'model', id: modelId, uid, model_type: modelSubType, ...rest }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления модели');
  }
  const json = await res.json();
  return json.data || { id: json.id };
};

/**
 * Получить все модели юзера.
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export const getModels = async (uid) => {
  const params = new URLSearchParams({ type: 'models', uid });
  const res = await apiFetch(`/api/user-data?${params}`);
  if (!res.ok) {
    console.error('[userDataService] Ошибка получения моделей:', res.status);
    return [];
  }
  const json = await res.json();
  return json.data || [];
};

/**
 * Удалить модель.
 * @param {string} uid
 * @param {string} modelId
 */
export const deleteModelDoc = async (uid, modelId) => {
  const params = new URLSearchParams({ type: 'model', id: modelId });
  const res = await apiFetch(`/api/user-data?${params}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления модели');
  }
};

/**
 * Обновить промпт модели (сохранение модификаторов).
 * @param {string} uid
 * @param {string} modelId
 * @param {string} prompt
 */
export const updateModelPrompt = async (uid, modelId, prompt) => {
  const res = await apiFetch('/api/user-data', {
    method: 'PATCH',
    body: JSON.stringify({ type: 'model', id: modelId, prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления промпта модели');
  }
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
  const res = await apiFetch('/api/user-data', {
    method: 'POST',
    body: JSON.stringify({ type: 'location', uid, ...data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения локации');
  }
  const json = await res.json();
  return json.data || { id: json.id };
};

/**
 * Получить все локации юзера.
 * @param {string} uid
 * @returns {Promise<Array>}
 */
export const getLocations = async (uid) => {
  const params = new URLSearchParams({ type: 'locations', uid });
  const res = await apiFetch(`/api/user-data?${params}`);
  if (!res.ok) {
    console.error('[userDataService] Ошибка получения локаций:', res.status);
    return [];
  }
  const json = await res.json();
  return json.data || [];
};

/**
 * Удалить локацию.
 * @param {string} uid
 * @param {string} locationId
 */
export const deleteLocationDoc = async (uid, locationId) => {
  const params = new URLSearchParams({ type: 'location', id: locationId });
  const res = await apiFetch(`/api/user-data?${params}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления локации');
  }
};

/**
 * Обновить промпт локации (сохранение модификаторов).
 * @param {string} uid
 * @param {string} locationId
 * @param {string} prompt
 */
export const updateLocationPrompt = async (uid, locationId, prompt) => {
  const res = await apiFetch('/api/user-data', {
    method: 'PATCH',
    body: JSON.stringify({ type: 'location', id: locationId, prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления промпта локации');
  }
};

/**
 * Патч произвольных полей локации (используется для миграции).
 * @param {string} uid
 * @param {string} locationId
 * @param {Object} fields — поля для обновления
 */
export const patchLocation = async (uid, locationId, fields) => {
  const res = await apiFetch('/api/user-data', {
    method: 'PATCH',
    body: JSON.stringify({ type: 'location', id: locationId, ...fields }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления локации');
  }
};
