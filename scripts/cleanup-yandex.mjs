// Удаляет мусорные файлы из Yandex (xl.meta, part.1 от V1 миграции)
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: 'https://storage.yandexcloud.net',
  region: 'ru-central1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});
const BUCKET = process.env.S3_BUCKET || 'seller-studio-media';

async function cleanup() {
  console.log('🔍 Сканирую Yandex на мусорные файлы...');
  
  const junkKeys = [];
  let continuationToken;
  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    if (resp.Contents) {
      for (const obj of resp.Contents) {
        if (obj.Key.endsWith('/xl.meta') || obj.Key.includes('/part.1')) {
          junkKeys.push(obj.Key);
        }
      }
    }
    continuationToken = resp.NextContinuationToken;
  } while (continuationToken);

  console.log(`🗑️ Найдено мусорных файлов: ${junkKeys.length}`);

  if (junkKeys.length === 0) {
    console.log('✅ Мусора нет!');
    return;
  }

  // Удаляем батчами по 1000 (лимит S3)
  for (let i = 0; i < junkKeys.length; i += 1000) {
    const batch = junkKeys.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: batch.map(key => ({ Key: key })),
        },
      })
    );
    console.log(`  🗑️ Удалено ${batch.length} файлов`);
  }

  // Финальный подсчёт
  let total = 0;
  continuationToken = undefined;
  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    total += resp.KeyCount || 0;
    continuationToken = resp.NextContinuationToken;
  } while (continuationToken);

  console.log(`\n✅ Очистка завершена! Осталось чистых файлов: ${total}`);
}

cleanup().catch(e => { console.error(e); process.exit(1); });
