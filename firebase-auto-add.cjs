const { chromium } = require('playwright');

(async () => {
  console.log('Подключаюсь к Chrome на localhost:9222...');
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const defaultContext = browser.contexts()[0];
    const page = await defaultContext.newPage();
    
    const projectId = 'lord-f842d';
    const domainToAdd = 'seller-studio-ai.ru';
    
    console.log(`Открываю настройки Firebase Auth для проекта ${projectId}...`);
    await page.goto(`https://console.firebase.google.com/project/${projectId}/authentication/settings`, { waitUntil: 'networkidle', timeout: 60000 });
    
    console.log('Ищу вкладку "Authorized domains"...');
    // Ждем, пока интерфейс Firebase загрузится
    await page.waitForTimeout(5000); 

    const domainsTab = page.locator('text="Authorized domains"').or(page.locator('text="Авторизованные домены"')).first();
    if (await domainsTab.isVisible().catch(() => false)) {
        await domainsTab.click();
        await page.waitForTimeout(2000);
    } else {
        console.log('Не нашел вкладку по тексту, пробую вторую вкладку...');
        // Часто это вкладка с индексом 1 (вторая по счету)
        const anyTab = page.locator('.mat-mdc-tab').nth(1); 
        if (await anyTab.isVisible().catch(() => false)) {
            await anyTab.click();
            await page.waitForTimeout(2000);
        }
    }
    
    console.log('Ищу кнопку "Add domain"...');
    const addDomainBtn = page.locator('button:has-text("Add domain")').or(page.locator('button:has-text("Добавить домен")')).first();
    if (await addDomainBtn.isVisible().catch(()=>false)) {
        await addDomainBtn.click();
        await page.waitForTimeout(1000);
        
        console.log(`Ввожу домен ${domainToAdd}...`);
        const input = page.locator('input[type="text"]').last();
        await input.fill(domainToAdd);
        await page.waitForTimeout(500);
        
        console.log('Сохраняю...');
        const addBtn = page.locator('button:has-text("Add")').or(page.locator('button:has-text("Добавить")')).first();
        await addBtn.click();
        await page.waitForTimeout(2000);
        console.log('Успешно добавлено!');
    } else {
        console.log('Кнопка "Add domain" не найдена. Убедись, что Firebase консоль загрузилась и ты авторизован.');
    }
    
    console.log('Закрываю вкладку автоматизации...');
    await page.close();
    await browser.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Ошибка в процессе автоматизации:', err);
    process.exit(1);
  }
})();
