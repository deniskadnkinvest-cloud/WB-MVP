/**
 * CHAOS TEST RUNNER — Sequential executor for all chaos tests
 * Runs tests 01-06 sequentially, captures all output
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CHAOS_DIR = __dirname;
const tests = [
  '01-network-stress.cjs',
  '02-api-error-injection.cjs',
  '03-button-spam.cjs',
  '04-keyboard-navigation.cjs',
  '05-empty-state.cjs',
  '06-double-submit.cjs',
];

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║       🔥 CHAOS ENGINEERING TEST SUITE — VTON-MVP      ║');
console.log('║            Deep Audit Level 3: Stress Tests           ║');
console.log('╚════════════════════════════════════════════════════════╝');
console.log('');
console.log(`📅 ${new Date().toLocaleString('ru-RU')}`);
console.log(`📂 Output: ${CHAOS_DIR}`);
console.log('');

const results = [];

for (const test of tests) {
  const testPath = path.join(CHAOS_DIR, test);
  if (!fs.existsSync(testPath)) {
    console.log(`⚠️ Skipping ${test} (file not found)`);
    continue;
  }

  console.log(`\n${'▓'.repeat(60)}`);
  console.log(`▓ Running: ${test}`);
  console.log(`${'▓'.repeat(60)}\n`);

  const startTime = Date.now();
  try {
    const output = execSync(`node "${testPath}"`, {
      cwd: CHAOS_DIR,
      encoding: 'utf-8',
      timeout: 120000, // 2 min per test
      stdio: 'pipe',
    });
    const duration = Date.now() - startTime;
    console.log(output);
    results.push({ test, status: '✅ PASS', duration: `${duration}ms`, output });
  } catch (err) {
    const duration = Date.now() - startTime;
    const output = (err.stdout || '') + '\n' + (err.stderr || '');
    console.log(output);
    console.error(`❌ Test ${test} failed after ${duration}ms`);
    results.push({ test, status: '❌ FAIL', duration: `${duration}ms`, error: err.message?.substring(0, 200) });
  }
}

// Summary
console.log('\n\n╔════════════════════════════════════════════════════════╗');
console.log('║                📋 TEST SUMMARY                        ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

for (const r of results) {
  console.log(`  ${r.status} ${r.test} (${r.duration})`);
  if (r.error) console.log(`     Error: ${r.error}`);
}

console.log(`\n📊 Total: ${results.length} tests | ✅ ${results.filter(r => r.status.includes('PASS')).length} passed | ❌ ${results.filter(r => r.status.includes('FAIL')).length} failed`);

// Список скриншотов
const screenshots = fs.readdirSync(CHAOS_DIR).filter(f => f.endsWith('.png'));
console.log(`\n📸 Screenshots generated: ${screenshots.length}`);
screenshots.forEach(s => console.log(`   → ${s}`));
