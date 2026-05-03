import fs from 'fs';
import path from 'path';

const API_URL = 'https://vton-mvp-omega.vercel.app/api/generate-image';
const OUTPUT_DIR = 'C:\\Users\\LORD-KSON\\Kson Project\\Все мои APPы\\VTON-MVP\\test-results';

function img(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function test(name, payload) {
  console.log(`\n🧪 ${name}`);
  const t = Date.now();
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    const s = ((Date.now() - t) / 1000).toFixed(1);
    if (d.success && d.imageBase64) {
      const out = path.join(OUTPUT_DIR, `${name}.jpg`);
      fs.writeFileSync(out, Buffer.from(d.imageBase64, 'base64'));
      console.log(`   ✅ ${s}s → ${out}`);
    } else {
      console.log(`   ❌ ${s}s: ${d.details || d.error}`);
    }
  } catch (e) {
    console.log(`   ❌ ${e.message}`);
  }
}

async function main() {
  console.log('═══ SANITIZATION TEST ═══\n');
  
  const yourPhoto = img('C:\\Users\\LORD-KSON\\Downloads\\Одежда\\2P4A6098.jpg');
  const silkSuit = img('C:\\Users\\LORD-KSON\\Downloads\\Одежда\\photo_2026-04-19_14-12-27.jpg');

  // Test 1: YOUR photo → African female (most extreme identity swap)
  await test('SANITIZE_1_your_photo_african_female', {
    garmentImagesBase64: [yourPhoto],
    modelPreset: '25-year-old African female, slim build, short black curly hair, light smile, no tattoos, no piercings',
    posePreset: 'standing straight, confident posture',
    cameraAngle: 'full body shot',
    backgroundPreset: 'clean minimalist white cyclorama',
    aspectRatio: '3:4',
  });

  // Test 2: YOUR photo → Asian male (different gender + ethnicity)
  await test('SANITIZE_2_your_photo_asian_male', {
    garmentImagesBase64: [yourPhoto],
    modelPreset: '40-year-old Asian male, overweight build, grey short hair, serious expression, no tattoos, no piercings',
    posePreset: 'standing with arms crossed',
    cameraAngle: 'full body shot',
    backgroundPreset: 'clean minimalist white cyclorama',
    aspectRatio: '3:4',
  });

  // Test 3: Female silk suit → Slavic male, bald, with beard
  await test('SANITIZE_3_silk_suit_slavic_male', {
    garmentImagesBase64: [silkSuit],
    modelPreset: '35-year-old Slavic male, muscular build, bald head, thick beard, serious expression, no tattoos, no piercings',
    posePreset: 'standing straight, confident posture',
    cameraAngle: 'full body shot',
    backgroundPreset: 'clean minimalist white cyclorama',
    aspectRatio: '3:4',
  });

  console.log('\n═══ DONE ═══');
}

main();
