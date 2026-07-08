import { useEffect } from "react";

export default function TelegramInit() {
  useEffect(() => {
    let attempts = 0;
    const interval = setInterval(() => {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        clearInterval(interval);

        // 1. Говорим телеграму, что приложение готово
        tg.ready();
        
        // 2. Разворачиваем на 100% высоты
        tg.expand();
        
        // 3. БЛОКИРУЕМ ЗАКРЫТИЕ СВАЙПОМ ВНИЗ (САМОЕ ВАЖНОЕ)
        if (typeof tg.disableVerticalSwipes === 'function') {
          tg.disableVerticalSwipes();
        }
        
        // Опционально: красим хедер под фон приложения
        try {
          tg.setHeaderColor("#050508"); 
          tg.setBackgroundColor("#050508");
        } catch (e) {
          console.warn("Failed to set TG colors:", e);
        }
      }

      attempts++;
      if (attempts > 60) clearInterval(interval);
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return null;
}
