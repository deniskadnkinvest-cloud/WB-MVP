// ═══════════════════════════════════════════════════════════════
//  ТЕСТ Auto-Catalog конвейера
//  Отправляет 3 тестовых SKU на обработку
// ═══════════════════════════════════════════════════════════════

const API_URL = 'http://localhost:3002';

// Тестовые товары (публичные фото одежды для демо)
const TEST_ITEMS = [
  {
    skuId: 'ART-001',
    name: 'Чёрная куртка-бомбер',
    imageUrl: 'https://picsum.photos/seed/jacket1/400/600'
  }
];

async function testAutoCatalog() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('🧪 TEST: Auto-Catalog Pipeline');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Health check
  try {
    const health = await fetch(`${API_URL}/api/health`);
    const healthData = await health.json();
    console.log('✅ Health:', healthData.status);
  } catch (err) {
    console.error('❌ Server not running! Start it with: node server-autocatalog.js');
    console.error('   Then in another terminal: npx inngest-cli@latest dev -u http://localhost:3002/api/inngest');
    process.exit(1);
  }

  // 2. Запуск Auto-Catalog
  console.log(`\n📦 Sending ${TEST_ITEMS.length} test SKUs...\n`);

  const resp = await fetch(`${API_URL}/api/auto-catalog/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: TEST_ITEMS,
      sellerId: 'test_seller_001',
      vibe: 'y2k_streetwear'
    })
  });

  const data = await resp.json();
  
  if (data.success) {
    console.log('✅ Auto-Catalog запущен!');
    console.log(`   Batch ID: ${data.batchId}`);
    console.log(`   Items: ${TEST_ITEMS.length}`);
    console.log(`\n📊 Откройте Inngest Dev Dashboard для мониторинга:`);
    console.log(`   → http://localhost:8288\n`);
  } else {
    console.error('❌ Error:', data.error);
  }
}

testAutoCatalog().catch(console.error);
