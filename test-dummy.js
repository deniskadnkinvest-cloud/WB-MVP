/**
 * Test: "Disposable Calibration Dummy" approach
 * Uses your photo (with face) → should generate COMPLETELY different person
 */
import fs from 'fs';
import path from 'path';

const API_URL = 'https://vton-mvp-omega.vercel.app/api/generate-image';
const OUTPUT_DIR = 'c:\\Users\\LORD-KSON\\Kson Project\\Все мои APPы\\VTON-MVP\\test-results';

function img(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1) === 'png' ? 'png' : 'jpeg';
  return `data:image/${ext};base64,${buf.toString('base64')}`;
}

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const tests = [
  {
    name: 'DUMMY_1_your_photo_to_african_female',
    garment: 'C:\\Users\\LORD-KSON\\Downloads\\Одежда\\2P4A6098.jpg',
    model: '25-year-old African female, athletic build, glowing dark skin, elegant features, natural beauty, short curly hair, confident powerful expression',
    desc: 'Your photo → African woman (max identity distance)',
  },
  {
    name: 'DUMMY_2_your_photo_to_asian_male_old',
    garment: 'C:\\Users\\LORD-KSON\\Downloads\\Одежда\\2P4A6098.jpg',
    model: '45-year-old Asian male, plus-size curvy body, silver gray hair, shaved head, serious intense expression',
    desc: 'Your photo → Old bald Asian man (max identity distance)',
  },
  {
    name: 'DUMMY_3_blonde_girl_to_slavic_male',
    garment: 'C:\\Users\\LORD-KSON\\Downloads\\Одежда\\photo_2026-04-19_14-12-27.jpg',
    model: '28-year-old Slavic male, muscular well-defined body, chestnut brown hair, medium-length hair, confident powerful expression',
    desc: 'Blonde girl in silk → Muscular slavic male (gender+identity swap)',
  },
];

for (const t of tests) {
  console.log(`\n🧪 ${t.name}: ${t.desc}`);
  const start = Date.now();
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        garmentImagesBase64: [img(t.garment)],
        modelPreset: t.model,
        posePreset: 'standing straight, confident posture, facing the camera directly',
        cameraAngle: 'full body shot',
        backgroundPreset: 'clean minimalist white cyclorama, professional studio environment',
        aspectRatio: '3:4',
      }),
    });
    const data = await resp.json();
    if (data.success) {
      const buf = Buffer.from(data.imageBase64, 'base64');
      fs.writeFileSync(path.join(OUTPUT_DIR, `${t.name}.jpg`), buf);
      console.log(`   ✅ SUCCESS (${((Date.now()-start)/1000).toFixed(1)}s) → saved`);
    } else {
      console.log(`   ❌ FAIL: ${data.details || data.error}`);
    }
  } catch (e) {
    console.log(`   ❌ ERROR: ${e.message}`);
  }
}
console.log('\n🏁 All tests done!');
