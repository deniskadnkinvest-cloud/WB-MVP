import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for file storage`);
  }
  return value;
}

const S3_ENDPOINT = requiredEnv('S3_ENDPOINT');
const S3_ACCESS_KEY = requiredEnv('S3_ACCESS_KEY');
const S3_SECRET_KEY = requiredEnv('S3_SECRET_KEY');
const S3_BUCKET = requiredEnv('S3_BUCKET');

const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

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

async function deleteFile(key) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  );
}

function getPublicUrl(key) {
  const base = S3_ENDPOINT.replace(/\/$/, '');
  return `${base}/${S3_BUCKET}/${key}`;
}

export {
  s3,
  S3_BUCKET,
  uploadFile,
  deleteFile,
  getPublicUrl,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
};
