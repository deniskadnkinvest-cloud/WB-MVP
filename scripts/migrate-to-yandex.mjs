#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// Миграция данных из MinIO (VPS) → Yandex Object Storage
// Запуск: node scripts/migrate-to-yandex.mjs
// ═══════════════════════════════════════════════════════════════════

import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// ─── Конфигурация ───────────────────────────────────────────────────

// MinIO data лежит на хосте в /root/vton-mvp/minio-data/vton-uploads/
const MINIO_DATA_DIR = '/minio-data';

// Yandex Object Storage
const YANDEX_ENDPOINT = 'https://storage.yandexcloud.net';
const YANDEX_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const YANDEX_SECRET_KEY = process.env.S3_SECRET_KEY;
const YANDEX_BUCKET = process.env.S3_BUCKET || 'seller-studio-media';

if (!YANDEX_ACCESS_KEY || !YANDEX_SECRET_KEY) {
  console.error('❌ S3_ACCESS_KEY и S3_SECRET_KEY должны быть в env!');
  process.exit(1);
}

const yandexS3 = new S3Client({
  endpoint: YANDEX_ENDPOINT,
  region: 'ru-central1',
  credentials: {
    accessKeyId: YANDEX_ACCESS_KEY,
    secretAccessKey: YANDEX_SECRET_KEY,
  },
  forcePathStyle: true,
});

// ─── Рекурсивный обход файлов ──────────────────────────────────────

function walkDir(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      // Пропускаем внутренние файлы MinIO (.minio.sys и т.д.)
      if (entry.startsWith('.')) continue;

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...walkDir(fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.warn(`⚠️ Не удалось прочитать ${dir}: ${err.message}`);
  }
  return results;
}

// ─── Определение Content-Type ──────────────────────────────────────

function getContentType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    json: 'application/json',
  };
  return types[ext] || 'application/octet-stream';
}

// ─── Проверка: что уже есть в Yandex ───────────────────────────────

async function listYandexKeys() {
  const keys = new Set();
  let continuationToken;
  do {
    const resp = await yandexS3.send(
      new ListObjectsV2Command({
        Bucket: YANDEX_BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    if (resp.Contents) {
      for (const obj of resp.Contents) {
        keys.add(obj.Key);
      }
    }
    continuationToken = resp.NextContinuationToken;
  } while (continuationToken);
  return keys;
}

// ─── Основная миграция ─────────────────────────────────────────────

async function migrate() {
  console.log('🔍 Сканирую файлы в MinIO...');
  const files = walkDir(MINIO_DATA_DIR);
  console.log(`📦 Найдено файлов: ${files.length}`);

  if (files.length === 0) {
    console.log('✅ Нет файлов для миграции!');
    return;
  }

  console.log('🔍 Проверяю, что уже есть в Yandex...');
  const existingKeys = await listYandexKeys();
  console.log(`☁️ В Yandex уже есть: ${existingKeys.size} файлов`);

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  for (const filePath of files) {
    // Ключ = путь относительно директории MinIO data
    const key = relative(MINIO_DATA_DIR, filePath).replace(/\\/g, '/');

    // Пропускаем, если уже есть в Yandex
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    try {
      const buffer = readFileSync(filePath);
      const contentType = getContentType(filePath);

      await yandexS3.send(
        new PutObjectCommand({
          Bucket: YANDEX_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );

      uploaded++;
      console.log(`  ✅ [${uploaded}/${files.length - skipped}] ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      errors++;
      console.error(`  ❌ ${key}: ${err.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`📊 Результат миграции:`);
  console.log(`   ✅ Загружено:  ${uploaded}`);
  console.log(`   ⏭️  Пропущено: ${skipped} (уже были)`);
  console.log(`   ❌ Ошибок:     ${errors}`);
  console.log('═══════════════════════════════════════════');

  // Финальная проверка
  const finalKeys = await listYandexKeys();
  console.log(`\n☁️ Итого в Yandex Object Storage: ${finalKeys.size} файлов`);
  console.log('🎉 Миграция завершена!');
}

migrate().catch((err) => {
  console.error('💀 Критическая ошибка:', err);
  process.exit(1);
});
