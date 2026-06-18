import { chromium } from '@playwright/test';

(async () => {
  console.log('🚀 Подключаюсь к твоему Chrome...');
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const context = browser.contexts()[0];
    
    let page = context.pages().find(p => p.url().includes('yookassa.ru'));
    
    if (!page) {
      console.log('Открываю новую вкладку ЮKassa...');
      page = await context.newPage();
      await page.goto('https://yookassa.ru/my/merchant/settings/add', { waitUntil: 'domcontentloaded' });
    } else {
      console.log('ЮKassa уже открыта, перевожу фокус...');
      await page.bringToFront();
      if (!page.url().includes('/my/merchant/settings/add')) {
          await page.goto('https://yookassa.ru/my/merchant/settings/add', { waitUntil: 'domcontentloaded' });
      }
    }

    console.log('⏳ Жду загрузки интерфейса...');
    await page.waitForTimeout(5000);
    
    console.log('🤖 Заполняю форму Трекопёса...');
    
    await page.evaluate(() => {
        function fillInput(keywords, value) {
            const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="url"], textarea'));
            for (const input of inputs) {
                const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
                const wrapper = input.closest('div');
                const textContext = (
                    input.placeholder + ' ' + 
                    input.name + ' ' + 
                    (label ? label.innerText : '') + ' ' +
                    (wrapper ? wrapper.innerText : '')
                ).toLowerCase();

                if (keywords.some(k => textContext.includes(k.toLowerCase()))) {
                    input.focus();
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.blur();
                    return true;
                }
            }
            return false;
        }
        
        fillInput(['название', 'имя магазина', 'name'], 'ТРЕКОПЁС');
        fillInput(['сайт', 'url', 'ссылка', 'домен', 'адрес'], 'https://app.tpekollec.ru');
        fillInput(['описание', 'что продаете', 'товары', 'суть', 'деятельность'], 'Цифровые услуги (генерация аудио-треков с помощью ИИ в Telegram-боте, разовая покупка и подписки).');
    });

    console.log('✅ Готово! Форма должна быть заполнена. Проверь глазами и нажми кнопку отправки заявки!');
    await browser.disconnect();
    
  } catch(e) {
      console.error('❌ Ошибка автоматизации:', e.message);
  }
})();
