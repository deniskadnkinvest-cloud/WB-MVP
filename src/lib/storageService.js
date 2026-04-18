import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
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
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
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
