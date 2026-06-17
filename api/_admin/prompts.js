// GET /api/admin/prompts
// Runtime prompt registry for admin visibility. The data is derived from the
// current deployed source, so prompt changes made in development appear here
// after deployment without manually duplicating them in the admin UI.

import fs from 'fs/promises';
import crypto from 'crypto';
import { checkAdminAuth } from './verify.js';
import * as presets from '../../src/data/presets.js';
import * as cardPrompts from '../../src/data/cardPrompts.js';

function hash(text = '') {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function normalizePrompt({ id, name, group, source, line = null, prompt = '', meta = {} }) {
  const text = String(prompt || '');
  return {
    id,
    name,
    group,
    source,
    line,
    length: text.length,
    sha256: hash(text),
    prompt: text,
    preview: text.replace(/\s+/g, ' ').trim().slice(0, 280),
    meta,
  };
}

async function extractBackendPrompts() {
  const source = await fs.readFile(new URL('../generate-image.js', import.meta.url), 'utf8');
  const items = [];
  const regex = /const\s+([A-Z0-9_]*PROMPT[A-Z0-9_]*)\s*=\s*`([\s\S]*?)`;/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const name = match[1];
    const prompt = match[2];
    items.push(normalizePrompt({
      id: `backend:${name}`,
      name,
      group: 'Backend системные промпты',
      source: 'api/generate-image.js',
      line: lineOf(source, match.index),
      prompt,
      meta: { kind: 'template_literal' },
    }));
  }

  [
    ['buildMasterPrompt', 'Главный сборщик VTON prompt'],
    ['buildProductPrompt', 'Сборщик предметной съемки'],
    ['buildAttributeDirectives', 'Сборщик атрибутов модели'],
  ].forEach(([fnName, label]) => {
    const index = source.indexOf(`function ${fnName}`);
    if (index === -1) return;
    const snippet = source.slice(index, Math.min(source.length, index + 5000));
    items.push(normalizePrompt({
      id: `backend-builder:${fnName}`,
      name: label,
      group: 'Backend prompt builders',
      source: 'api/generate-image.js',
      line: lineOf(source, index),
      prompt: snippet,
      meta: { kind: 'function_snippet', functionName: fnName },
    }));
  });

  return items;
}

function presetItems() {
  const items = [];

  const pushPromptArray = (groupName, sourceName, arr = [], promptKey = 'prompt') => {
    arr.forEach(item => {
      const prompt = item[promptKey];
      if (!prompt) return;
      items.push(normalizePrompt({
        id: `preset:${sourceName}:${item.id || item.label}`,
        name: item.label || item.id || sourceName,
        group: groupName,
        source: 'src/data/presets.js',
        prompt,
        meta: {
          presetId: item.id || null,
          emoji: item.emoji || null,
          gender: item.gender || null,
          sourceName,
        },
      }));
    });
  };

  pushPromptArray('Модели', 'MODEL_PRESETS', presets.MODEL_PRESETS);
  pushPromptArray('Позы', 'POSE_PRESETS', presets.POSE_PRESETS);
  pushPromptArray('Фоны', 'BACKGROUND_PRESETS', presets.BACKGROUND_PRESETS);
  pushPromptArray('Камера', 'CAMERA_ANGLES', presets.CAMERA_ANGLES);
  pushPromptArray('Предметка: композиции', 'PRODUCT_COMPOSITIONS', presets.PRODUCT_COMPOSITIONS);
  pushPromptArray('Предметка: фоны', 'PRODUCT_BACKGROUNDS', presets.PRODUCT_BACKGROUNDS);
  pushPromptArray('Предметка: эффекты', 'PRODUCT_EFFECTS', presets.PRODUCT_EFFECTS);
  pushPromptArray('Предметка: категории', 'PRODUCT_CATEGORIES', presets.PRODUCT_CATEGORIES, 'defaultPrompt');

  Object.entries(cardPrompts).forEach(([name, prompt]) => {
    if (typeof prompt !== 'string') return;
    items.push(normalizePrompt({
      id: `frontend-card:${name}`,
      name,
      group: 'Frontend card prompts',
      source: 'src/data/cardPrompts.js',
      prompt,
      meta: { kind: 'exported_constant' },
    }));
  });

  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Init-Data');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const auth = checkAdminAuth(req);
  if (!auth.ok) return res.status(403).json({ ok: false, error: 'Access denied' });

  try {
    const [backend, frontend] = await Promise.all([
      extractBackendPrompts(),
      Promise.resolve(presetItems()),
    ]);

    const prompts = [...backend, ...frontend].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    const groups = prompts.reduce((acc, item) => {
      acc[item.group] = (acc[item.group] || 0) + 1;
      return acc;
    }, {});

    return res.status(200).json({
      ok: true,
      prompts,
      summary: {
        total: prompts.length,
        groups,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[admin/prompts] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
