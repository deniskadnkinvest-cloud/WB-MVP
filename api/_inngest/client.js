// ═══════════════════════════════════════════════════════════════
//  INNGEST CLIENT — Event-Driven оркестрация для Auto-Catalog
// ═══════════════════════════════════════════════════════════════
import { Inngest } from 'inngest';

export const inngest = new Inngest({ 
  id: 'sellerbot',
  name: 'SellerBot Auto-Catalog',
  // В dev-режиме Inngest Dev Server не требует настоящего ключа
  isDev: process.env.NODE_ENV !== 'production',
});
