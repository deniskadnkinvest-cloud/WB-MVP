import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.REVE_API_KEY;
if (!apiKey) {
  console.error('❌ REVE_API_KEY is not defined in .env!');
  process.exit(1);
}

console.log('Using API Key:', apiKey.substring(0, 15) + '...');

const payload = {
  prompt: 'test: simple green circle, white background',
  aspect_ratio: '1:1',
  test_time_scaling: 1
};

console.log('Sending request to Reve API...');
const start = Date.now();

try {
  const res = await fetch('https://api.reve.com/v1/image/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!res.ok) {
    console.error(`❌ HTTP Error ${res.status} (${elapsed}s):`, data);
    process.exit(1);
  }

  console.log(`✅ Reve API response received in ${elapsed}s:`, {
    model: data.model,
    credits_used: data.credits_used,
    has_image: !!(data.image_b64 || data.image || data.data)
  });

  const imgData = data.image_b64 || data.image || data.data;
  if (imgData) {
    const outDir = './test-results';
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    
    const outFile = path.join(outDir, 'reve-test-out.png');
    fs.writeFileSync(outFile, Buffer.from(imgData, 'base64'));
    console.log(`🎉 Image saved to: ${outFile}`);
  } else {
    console.error('❌ No image data returned!');
  }
} catch (err) {
  console.error('❌ Request failed:', err);
}
