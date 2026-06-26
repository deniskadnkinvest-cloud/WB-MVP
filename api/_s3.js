// ─────────────────────────────────────────────────────────
// _s3.js — Клиент MinIO / S3 для хранения файлов
// Используется вместо Firebase Storage
// ─────────────────────────────────────────────────────────

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

/**
 * Конфигурация S3/MinIO — всё через env, с фолбэками для локальной разработки.
 */
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://186.246.29.31:9000';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'minioAdminPassword2026';
const S3_BUCKET = process.env.S3_BUCKET || 'vton-uploads';

/**
 * S3-клиент (совместим с MinIO).
 * forcePathStyle: true — обязателен для MinIO (path-style вместо virtual-hosted-style).
 * region: 'us-east-1' — дефолт для MinIO, значения не имеет, но SDK требует.
 */
const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

/**
 * Загружает файл в S3/MinIO и возвращает публичный URL.
 *
 * @param {string} key — путь/ключ в бакете (напр. 'users/tg_123/photo.jpg')
 * @param {Buffer} buffer — содержимое файла
 * @param {string} contentType — MIME-тип (напр. 'image/jpeg')
 * @returns {Promise<string>} — публичный URL загруженного файла
 *
 * @example
 *   const url = await uploadFile('generations/abc123.png', pngBuffer, 'image/png');
 */
async function uploadFile(key, buffer, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return getPublicUrl(key);
}

/**
 * Удаляет файл из S3/MinIO.
 *
 * @param {string} key — путь/ключ в бакете
 */
async function deleteFile(key) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  );
}

/**
 * Конструирует публичный URL для файла в MinIO.
 * Формат: {endpoint}/{bucket}/{key}
 *
 * @param {string} key — путь/ключ в бакете
 * @returns {string} — публичный URL
 */
function getPublicUrl(key) {
  // Убираем trailing slash из endpoint если есть
  const base = S3_ENDPOINT.replace(/\/$/, '');
  return `${base}/${S3_BUCKET}/${key}`;
}

export {
  s3,
  S3_BUCKET,
  uploadFile,
  deleteFile,
  getPublicUrl,
  // Реэкспортируем команды для прямого использования при необходимости
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
};
