import { ref, uploadBytes, getDownloadURL, deleteObject, getBytes } from 'firebase/storage';
import { storage } from './firebase';

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
 * Скачивает файл из Firebase Storage через SDK (с auth-контекстом, без CORS ограничений)
 * и возвращает его как base64 data URL.
 * Используется для миграции legacy-локаций у которых нет сохранённого imageBase64.
 * @param {string} storagePath — полный путь: 'users/{uid}/locations/...'
 * @param {string} [mimeType] — MIME-тип файла (по умолчанию 'image/jpeg')
 * @returns {Promise<string|null>} base64 data URL или null при ошибке
 */
export const downloadStoragePathAsBase64 = async (storagePath, mimeType = 'image/jpeg') => {
  try {
    const storageRef = ref(storage, storagePath);
    const bytes = await getBytes(storageRef); // Auth-aware, bypasses CORS
    const blob = new Blob([bytes], { type: mimeType });
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn(`⚠️ downloadStoragePathAsBase64 failed for '${storagePath}':`, err.message);
    return null;
  }
};

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

/**
 * Загружает файл в Firebase Storage.
 * @param {string} uid — ID пользователя
 * @param {File|Blob} file — файл для загрузки
 * @param {string} folder — папка ('models' | 'locations')
 * @returns {Promise<{url: string, path: string}>}
 */
export const uploadImage = async (uid, file, folder = 'models') => {
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const storagePath = `users/${uid}/${folder}/${filename}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, path: storagePath };
};

/**
 * Загружает base64 изображение в Firebase Storage.
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
 * Удаляет файл из Firebase Storage.
 * @param {string} storagePath — полный путь к файлу
 */
export const deleteImage = async (storagePath) => {
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn('Ошибка удаления из Storage:', err.message);
  }
};
