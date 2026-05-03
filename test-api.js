/**
 * Direct API Test Script — bypasses OAuth, hits /api/generate-image directly
 * Tests: identity separation, garment fidelity, color preservation, bg extras
 */
import fs from 'fs';
import path from 'path';

const API_URL = 'https://vton-mvp-omega.vercel.app/api/generate-image';
const GARMENT_DIR = 'C:\\Users\\LORD-KSON\\Downloads\\Одежда';
const OUTPUT_DIR = 'C:\\Users\\LORD-KSON\\Kson Project\\Все мои APPы\\VTON-MVP\\test-results';

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function imageToBase64(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function runTest(testName, payload) {
  console.log(`\n🧪 TEST: ${testName}`);
  console.log(`   Payload keys: ${Object.keys(payload).join(', ')}`);
  const start = Date.now();
  
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    
    if (!resp.ok) {
      const errText = await resp.text();
      console.log(`   ❌ HTTP ${resp.status} (${elapsed}s): ${errText.substring(0, 200)}`);
      return { test: testName, status: 'HTTP_ERROR', code: resp.status, time: elapsed };
    }
    
    const data = await resp.json();
    
    if (data.success && data.imageBase64) {
      // Save the result image
      const safeName = testName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 50);
      const outPath = path.join(OUTPUT_DIR, `${safeName}.jpg`);
      fs.writeFileSync(outPath, Buffer.from(data.imageBase64, 'base64'));
      console.log(`   ✅ SUCCESS (${elapsed}s) → ${outPath}`);
      return { test: testName, status: 'SUCCESS', time: elapsed, outPath };
    } else {
      console.log(`   ❌ API Error (${elapsed}s): ${data.details || data.error}`);
      return { test: testName, status: 'API_ERROR', error: data.details || data.error, time: elapsed };
    }
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`   ❌ EXCEPTION (${elapsed}s): ${err.message}`);
    return { test: testName, status: 'EXCEPTION', error: err.message, time: elapsed };
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  VTON-MVP DEEP API TEST SUITE');
  console.log('═══════════════════════════════════════');
  
  // Load test garment images
  const greenTee = imageToBase64(path.join(GARMENT_DIR, '203949.635x953@2x.jpg'));
  const blackOutfit = imageToBase64(path.join(GARMENT_DIR, '2P4A6098.jpg'));
  const silkSuit = imageToBase64(path.join(GARMENT_DIR, 'photo_2026-04-19_14-12-27.jpg'));
  const whiteTeeText = imageToBase64(path.join(GARMENT_DIR, 'photo_2026-04-22_22-47-40 — копия.jpg'));
  
  const results = [];
  
  // ═══ TEST 1: Clean garment (no person) + Asian female ═══
  // Expect: Asian woman in GREEN t-shirt, no identity leak possible
  results.push(await runTest('T1_Clean_Garment_Asian_Female', {
    garmentImagesBase64: [greenTee],
    modelPreset: '25-year-old Asian female, slim build, black straight hair, medium length, light smile, no piercings, no tattoos',
    posePreset: 'standing straight, confident posture, facing the camera directly',
    cameraAngle: 'full body shot',
    backgroundPreset: 'clean minimalist white cyclorama',
    aspectRatio: '3:4',
  }));
  
  // ═══ TEST 2: Garment with person (YOUR photo) + African male ═══
  // Expect: AFRICAN male in black vest+tee (from your photo), NOT your face
  results.push(await runTest('T2_Identity_Separation_African_Male', {
    garmentImagesBase64: [blackOutfit],
    modelPreset: '30-year-old African male, muscular build, short black hair, serious expression, no piercings, no tattoos',
    posePreset: 'standing straight, confident posture, facing the camera directly',
    cameraAngle: 'full body shot',
    backgroundPreset: 'clean minimalist white cyclorama',
    aspectRatio: '3:4',
  }));
  
  // ═══ TEST 3: Garment with female model + MALE preset ═══
  // Expect: MALE model wearing the silk suit, NOT the female face
  results.push(await runTest('T3_Gender_Swap_Male_In_Silk', {
    garmentImagesBase64: [silkSuit],
    modelPreset: '28-year-old European male, athletic build, brown short hair, confident expression, no piercings, no tattoos',
    posePreset: 'standing straight, confident posture, facing the camera directly',
    cameraAngle: 'full body shot',
    backgroundPreset: 'clean minimalist white cyclorama',
    aspectRatio: '3:4',
  }));
  
  // ═══ TEST 4: White studio + scene addition ═══
  // Expect: White studio background WITH crocodiles
  results.push(await runTest('T4_White_Studio_Plus_Crocodiles', {
    garmentImagesBase64: [greenTee],
    modelPreset: '22-year-old Slavic male, slim build, blonde short hair, neutral expression, no piercings, no tattoos',
    posePreset: 'standing straight, confident posture, facing the camera directly',
    cameraAngle: 'full body shot',
    backgroundPreset: 'clean minimalist white cyclorama. MANDATORY SCENE ADDITION (must be visible): crocodiles crawling on the floor nearby',
    aspectRatio: '3:4',
  }));
  
  // ═══ TEST 5: Color fidelity — GREEN must stay GREEN ═══
  // Expect: The t-shirt should be the EXACT same shade of green
  results.push(await runTest('T5_Color_Fidelity_Green_Tee', {
    garmentImagesBase64: [greenTee],
    modelPreset: '25-year-old Latina female, curvy build, dark brown long hair, light smile, no piercings, no tattoos',
    posePreset: 'standing with hands on hips, confident posture',
    cameraAngle: 'full body shot',
    backgroundPreset: 'urban street in evening light',
    aspectRatio: '3:4',
  }));
  
  // ═══ TEST 6: Text on garment preservation ═══
  // Expect: White t-shirt with "Маркус Лох" text preserved exactly
  results.push(await runTest('T6_Text_On_Garment_Preservation', {
    garmentImagesBase64: [whiteTeeText],
    modelPreset: '25-year-old European male, athletic build, brown medium hair, neutral expression, no piercings, no tattoos',
    posePreset: 'standing straight, relaxed pose, facing the camera',
    cameraAngle: 'half body shot from waist up',
    backgroundPreset: 'clean minimalist white cyclorama',
    aspectRatio: '3:4',
  }));
  
  // ═══ TEST 7: Edit instruction (shot modifier) ═══
  // First generate, then test edit with the result
  results.push(await runTest('T7_Edit_Instruction_Make_Fatter', {
    garmentImagesBase64: [greenTee],
    modelPreset: '25-year-old European female, slim build, blonde medium hair, neutral expression, no piercings, no tattoos',
    posePreset: 'standing straight, confident posture',
    cameraAngle: 'full body shot',
    backgroundPreset: 'clean minimalist white cyclorama',
    aspectRatio: '3:4',
    editInstruction: 'Сделай модель значительно полнее, увеличь вес',
  }));
  
  // ═══ TEST 8: Tattoo leakage test ═══
  // Your photo has tattoos → model preset says NO tattoos
  results.push(await runTest('T8_Tattoo_Leakage_Check', {
    garmentImagesBase64: [blackOutfit],
    modelPreset: '22-year-old Slavic female, slim build, red long hair, light smile, no piercings, no tattoos. Clean skin, absolutely no body modifications.',
    posePreset: 'standing straight, relaxed, facing camera',
    cameraAngle: 'full body shot',
    backgroundPreset: 'clean minimalist white cyclorama',
    aspectRatio: '3:4',
  }));
  
  // ═══ SUMMARY ═══
  console.log('\n═══════════════════════════════════════');
  console.log('  TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════');
  for (const r of results) {
    const icon = r.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`${icon} ${r.test} — ${r.status} (${r.time}s)`);
  }
  
  const passed = results.filter(r => r.status === 'SUCCESS').length;
  console.log(`\n📊 ${passed}/${results.length} tests generated images successfully.`);
  console.log(`📁 Results saved to: ${OUTPUT_DIR}`);
  console.log(`\n⚠️ MANUAL REVIEW NEEDED: Check each image in test-results/ for:`);
  console.log(`   1. Identity separation (face NOT from garment photo)`);
  console.log(`   2. Color fidelity (garment colors unchanged)`);
  console.log(`   3. Garment details (sleeves, pockets, text preserved)`);
  console.log(`   4. Background correctness (studio + additions)`);
  console.log(`   5. Tattoo/piercing leakage (none unless specified)`);
}

main().catch(console.error);
