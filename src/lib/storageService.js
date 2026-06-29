// src/lib/storageService.js
// Замена Auth Storage — загрузка/скачивание файлов через /api/upload
// Чистые клиентские утилиты (compressImage, base64ToBlob) сохранены без изменений

import { apiFetch, getToken } from './api';

// ═══════════════════════════════════════
//  КЛИЕНТСКИЕ УТИЛИТЫ (без изменений)
// ═══════════════════════════════════════

/**
 * Сжимает изображение до заданной максимальной ширины.
 * @param {File|Blob} file
 * @param {number} maxWidth
 * @returns {Promise<Blob>}
 */
export const compressImage = (file, maxWidth = 800) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          // Null guard: canvas.toBlob returns null on tainted canvas / unsupported format
          resolve(blob || file);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file); // Fallback to original on decode error
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });

/**
 * Конвертирует base64 data URL в Blob.
 */
const base64ToBlob = (base64) => {
  const [header, data] = base64.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const blobToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

// ═══════════════════════════════════════
//  UPLOAD / DOWNLOAD / DELETE через API
// ═══════════════════════════════════════

/**
 * Загружает файл через наш API (проксирует в MinIO/S3).
 * @param {string} uid — ID пользователя
 * @param {File|Blob} file — файл для загрузки
 * @param {string} folder — папка ('models' | 'locations')
 * @returns {Promise<{url: string, path: string}>}
 */
export const uploadImage = async (uid, file, folder = 'models') => {
  const base64 = await blobToBase64(file);

  const res = await apiFetch('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ uid, folder, base64 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки файла');
  }

  const json = await res.json();
  return { url: json.url, path: json.path };
};

/**
 * Загружает base64 изображение через наш API.
 * @param {string} uid
 * @param {string} base64 — data URL
 * @param {string} folder
 * @returns {Promise<{url: string, path: string}>}
 */
export const uploadBase64Image = async (uid, base64, folder = 'models') => {
  if (base64.startsWith('http://') || base64.startsWith('https://')) {
    try {
      const response = await fetch(base64);
      const blob = await response.blob();
      return uploadImage(uid, blob, folder);
    } catch (err) {
      console.error('Ошибка при скачивании/загрузке изображения по ссылке:', err);
      // Если скачивание не удалось (например, из-за CORS или сети), возвращаем саму ссылку
      return { url: base64, path: `external/${Date.now()}` };
    }
  }
  const blob = base64ToBlob(base64);
  return uploadImage(uid, blob, folder);
};

/**
 * Удаляет файл через наш API.
 * @param {string} storagePath — полный путь к файлу
 */
export const deleteImage = async (storagePath) => {
  try {
    const params = new URLSearchParams({ path: storagePath });
    const res = await apiFetch(`/api/upload?${params}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Ошибка удаления из Storage:', err.error || res.status);
    }
  } catch (err) {
    console.warn('Ошибка удаления из Storage:', err.message);
  }
};

/**
 * Скачивает файл через наш API и возвращает его как base64 data URL.
 * Используется для миграции legacy-локаций у которых нет сохранённого imageBase64.
 * @param {string} storagePath — полный путь: 'users/{uid}/locations/...'
 * @param {string} [mimeType] — MIME-тип файла (по умолчанию 'image/jpeg')
 * @returns {Promise<string|null>} base64 data URL или null при ошибке
 */
export const downloadStoragePathAsBase64 = async (storagePath, mimeType = 'image/jpeg') => {
  try {
    const params = new URLSearchParams({ path: storagePath });
    const res = await apiFetch(`/api/upload?${params}`);

    if (!res.ok) {
      console.warn(`⚠️ downloadStoragePathAsBase64 failed for '${storagePath}': HTTP ${res.status}`);
      return null;
    }

    const json = await res.json().catch(() => ({}));
    return json.base64 || null;
  } catch (err) {
    console.warn(`⚠️ downloadStoragePathAsBase64 failed for '${storagePath}':`, err.message);
    return null;
  }
};
