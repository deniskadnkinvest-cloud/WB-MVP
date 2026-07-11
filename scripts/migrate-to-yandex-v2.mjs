#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// Правильная миграция: MinIO S3 API → Yandex Object Storage
// Читает файлы через S3 API (не из файловой системы!)
// ═══════════════════════════════════════════════════════════════════

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

// ─── MinIO (источник) ───────────────────────────────────────────────
const minioS3 = new S3Client({
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioAdminPassword2026',
  },
  forcePathStyle: true,
});
const MINIO_BUCKET = 'vton-uploads';

// ─── Yandex (назначение) ────────────────────────────────────────────
const yandexS3 = new S3Client({
  endpoint: 'https://storage.yandexcloud.net',
  region: 'ru-central1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});
const YANDEX_BUCKET = process.env.S3_BUCKET || 'seller-studio-media';

// ─── Список всех объектов в MinIO ──────────────────────────────────
async function listAllKeys(client, bucket) {
  const keys = [];
  let continuationToken;
  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    if (resp.Contents) {
      for (const obj of resp.Contents) {
        keys.push({ key: obj.Key, size: obj.Size });
      }
    }
    continuationToken = resp.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

// ─── Скачать объект из MinIO ───────────────────────────────────────
async function downloadFromMinio(key) {
  const resp = await minioS3.send(
    new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: key })
  );
  const chunks = [];
  for await (const chunk of resp.Body) {
    chunks.push(chunk);
  }
  return {
    buffer: Buffer.concat(chunks),
    contentType: resp.ContentType || 'image/jpeg',
  };
}

// ─── Загрузить объект в Yandex ─────────────────────────────────────
async function uploadToYandex(key, buffer, contentType) {
  await yandexS3.send(
    new PutObjectCommand({
      Bucket: YANDEX_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

// ─── Основная миграция ─────────────────────────────────────────────
async function migrate() {
  console.log('🔍 Получаю список файлов из MinIO...');
  const minioKeys = await listAllKeys(minioS3, MINIO_BUCKET);
  console.log(`📦 В MinIO: ${minioKeys.length} файлов`);

  if (minioKeys.length === 0) {
    console.log('✅ MinIO пуст, нечего мигрировать!');
    return;
  }

  console.log('🔍 Получаю список файлов из Yandex...');
  const yandexKeys = await listAllKeys(yandexS3, YANDEX_BUCKET);
  const existingSet = new Set(yandexKeys.map((k) => k.key));
  console.log(`☁️ В Yandex уже есть: ${existingSet.size} файлов`);

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;
  let totalBytes = 0;

  for (const { key, size } of minioKeys) {
    // Пропускаем если уже есть в Yandex
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    try {
      const { buffer, contentType } = await downloadFromMinio(key);
      await uploadToYandex(key, buffer, contentType);
      uploaded++;
      totalBytes += buffer.length;
      console.log(
        `  ✅ [${uploaded}] ${key} (${(buffer.length / 1024).toFixed(1)} KB, ${contentType})`
      );
    } catch (err) {
      errors++;
      console.error(`  ❌ ${key}: ${err.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`📊 Результат миграции:`);
  console.log(`   ✅ Загружено:  ${uploaded} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`   ⏭️  Пропущено: ${skipped} (уже были в Yandex)`);
  console.log(`   ❌ Ошибок:     ${errors}`);
  console.log('═══════════════════════════════════════════');

  // Финальная проверка
  const finalKeys = await listAllKeys(yandexS3, YANDEX_BUCKET);
  console.log(`\n☁️ Итого в Yandex Object Storage: ${finalKeys.size || finalKeys.length} файлов`);
  console.log('🎉 Миграция завершена!');
}

migrate().catch((err) => {
  console.error('💀 Критическая ошибка:', err);
  process.exit(1);
});
