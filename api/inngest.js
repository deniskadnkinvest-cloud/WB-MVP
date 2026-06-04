// ═══════════════════════════════════════════════════════════════
//  Vercel Serverless Function эндпоинт для Inngest
//  Служит мостом для вызова фоновых задач Inngest на Vercel
// ═══════════════════════════════════════════════════════════════

import { serve } from 'inngest/vercel';
import { inngest } from './inngest/client.js';
import { functions } from './inngest/functions.js';

export default serve({
  client: inngest,
  functions,
});
