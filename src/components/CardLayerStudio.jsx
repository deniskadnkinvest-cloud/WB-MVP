import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './CardLayerStudio.css';

// ═══════════════════════════════════════════════════════════════
//  CardLayerStudio — Полноценный редактор слоёв (Photoshop/Figma-style)
//  Только для quick-режима «В два клика».
//  Клиентский compositor: z-index слои, zoom/pan, opacity, blend,
//  lock, drag-reorder, текстовые слои, undo/redo, crop/flip, экспорт.
// ═══════════════════════════════════════════════════════════════

const BLEND_MODES = [
  { v: 'normal',     l: 'Обычный' },
  { v: 'multiply',   l: 'Умножение' },
  { v: 'overlay',    l: 'Перекрытие' },
  { v: 'screen',     l: 'Осветление' },
  { v: 'soft-light', l: 'Мягкий свет' },
];

const FONTS = [
  { v: "'Syne', sans-serif",          l: 'Syne' },
  { v: "'Space Grotesk', sans-serif", l: 'Space Grotesk' },
  { v: "'Inter', system-ui, sans-serif", l: 'Inter' },
  { v: "'JetBrains Mono', monospace", l: 'Mono' },
  { v: 'Georgia, serif',              l: 'Georgia' },
  { v: 'Impact, sans-serif',          l: 'Impact' },
];

const LAYER_ICON = {
  background: '🖼️',
  image: '📦',
  text: '🔤',
  shape: '⬛',
  watermark: '💧',
};

let _idc = 0;
const uid = () => `l${++_idc}_${Math.random().toString(36).slice(2, 7)}`;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
// Слои плоские (все значения — примитивы), поэтому мелкая копия = корректный снимок
const cloneLayers = (ls) => ls.map((l) => ({ ...l }));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const buildInitialLayers = (imageUrl) => {
  const bg = {
    id: uid(), name: 'Фон', type: 'background', visible: true, locked: false, opacity: 1, blendMode: 'normal',
    bgType: 'color', bgColor: '#ffffff', gradFrom: '#2a2440', gradTo: '#0f0f1a', gradAngle: 135,
  };
  const img = {
    id: uid(), name: 'Карточка', type: 'image', visible: true, locked: false, opacity: 1, blendMode: 'normal',
    src: imageUrl, x: 0, y: 0, w: 100, h: 100, fit: 'cover', rotation: 0,
  };
  return [bg, img];
};

export default function CardLayerStudio({ imageUrl, onClose, onAiEdit, onSaveToProject }) {
  const initial = useMemo(() => buildInitialLayers(imageUrl), [imageUrl]);

  // ── Слои + история ────────────────────────────────────────────
  const [layers, setLayers] = useState(initial);
  const layersRef = useRef(layers);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  const historyRef = useRef([cloneLayers(initial)]);
  const histIdxRef = useRef(0);
  const [, tick] = useState(0);
  const bump = () => tick((t) => t + 1);
  const canUndo = histIdxRef.current > 0;
  const canRedo = histIdxRef.current < historyRef.current.length - 1;

  const commit = useCallback((next) => {
    const snap = cloneLayers(next);
    const cut = historyRef.current.slice(0, histIdxRef.current + 1);
    cut.push(snap);
    while (cut.length > 60) cut.shift();
    historyRef.current = cut;
    histIdxRef.current = cut.length - 1;
    setLayers(next);
    bump();
  }, []);

  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current -= 1;
    setLayers(cloneLayers(historyRef.current[histIdxRef.current]));
    bump();
  }, []);
  const redo = useCallback(() => {
    if (histIdxRef.current >= historyRef.current.length - 1) return;
    histIdxRef.current += 1;
    setLayers(cloneLayers(historyRef.current[histIdxRef.current]));
    bump();
  }, []);
  const resetAll = useCallback(() => {
    const fresh = buildInitialLayers(imageUrl);
    historyRef.current = [cloneLayers(fresh)];
    histIdxRef.current = 0;
    setLayers(fresh);
    setCrop(null); setFlipH(false); setSelectedId(fresh[1].id);
    bump();
  }, [imageUrl]);

  // ── Selection / view ──────────────────────────────────────────
  const [selectedId, setSelectedId] = useState(initial[1].id);
  const selected = layers.find((l) => l.id === selectedId) || null;

  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [frame, setFrame] = useState({ w: 600, h: 800 }); // дизайн-размер сцены (px)
  const frameRef = useRef(frame);
  useEffect(() => { frameRef.current = frame; }, [frame]);
  const [imgReady, setImgReady] = useState(false);

  const [flipH, setFlipH] = useState(false);
  const [crop, setCrop] = useState(null);       // {x,y,w,h} в % или null
  const [cropMode, setCropMode] = useState(false);
  const [draftCrop, setDraftCrop] = useState(null);

  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);
  useEffect(() => { spaceRef.current = spaceDown; }, [spaceDown]);

  const [renaming, setRenaming] = useState(null); // id слоя в режиме переименования
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const viewportRef = useRef(null);
  const stageRef = useRef(null);
  const imageInputRef = useRef(null);

  // ── Загрузка базового изображения → размер сцены ──────────────
  useEffect(() => {
    if (!imageUrl) return;
    const im = new Image();
    im.onload = () => {
      const nw = im.naturalWidth || 600;
      const nh = im.naturalHeight || 800;
      // Ограничиваем дизайн-холст, сохраняя пропорции
      const cap = 1400;
      const scale = Math.min(1, cap / Math.max(nw, nh));
      setFrame({ w: Math.round(nw * scale), h: Math.round(nh * scale) });
      setImgReady(true);
    };
    im.onerror = () => { setFrame({ w: 600, h: 800 }); setImgReady(true); };
    im.src = imageUrl;
  }, [imageUrl]);

  // ── Fit-to-screen ─────────────────────────────────────────────
  const fitToScreen = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const pad = 48;
    const aw = vp.clientWidth - pad;
    const ah = vp.clientHeight - pad;
    const f = frameRef.current;
    const z = Math.min(aw / f.w, ah / f.h);
    setZoom(clamp(z, 0.05, 4));
    setPan({ x: 0, y: 0 });
  }, []);

  // Авто-fit когда стали известны размеры сцены
  const didFit = useRef(false);
  useEffect(() => {
    if (imgReady && !didFit.current && viewportRef.current) {
      didFit.current = true;
      fitToScreen();
    }
  }, [imgReady, fitToScreen]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (!didFit.current) fitToScreen(); });
    ro.observe(vp);
    return () => ro.disconnect();
  }, [fitToScreen]);

  // ── Zoom колесом (нативный non-passive listener: в React 19 onWheel пассивный) ──
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const handler = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((z) => clamp(z * factor, 0.05, 5));
    };
    vp.addEventListener('wheel', handler, { passive: false });
    return () => vp.removeEventListener('wheel', handler);
  }, []);

  // ── Pan (пробел / средняя кнопка) ─────────────────────────────
  const panRef = useRef(null);
  const onViewportPointerDown = (e) => {
    // Клик по пустому месту вне слоя — снять выделение
    const onLayer = e.target.closest?.('[data-layer]');
    const onPanel = e.target.closest?.('.cls-handle');
    if (cropMode) return;
    if (spaceRef.current || e.button === 1) {
      e.preventDefault();
      panRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
      window.addEventListener('pointermove', onPanMove);
      window.addEventListener('pointerup', onPanUp);
      return;
    }
    if (!onLayer && !onPanel) setSelectedId(null);
  };
  const onPanMove = (e) => {
    const p = panRef.current; if (!p) return;
    setPan({ x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) });
  };
  const onPanUp = () => {
    panRef.current = null;
    window.removeEventListener('pointermove', onPanMove);
    window.removeEventListener('pointerup', onPanUp);
  };

  // ── Перетаскивание / ресайз слоя ──────────────────────────────
  const dragRef = useRef(null);
  const startLayerDrag = (e, layer, mode) => {
    if (layer.locked || cropMode || spaceRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(layer.id);
    dragRef.current = {
      mode, id: layer.id, sx: e.clientX, sy: e.clientY,
      ox: layer.x, oy: layer.y, ow: layer.w, oh: layer.h, ofs: layer.fontSize,
      moved: false,
    };
    window.addEventListener('pointermove', onLayerDragMove);
    window.addEventListener('pointerup', onLayerDragEnd);
  };
  const onLayerDragMove = (e) => {
    const d = dragRef.current; if (!d) return;
    // Игнорируем микро-дрожь: пока не сдвинули >3px, это клик, а не перетаскивание
    if (!d.moved && Math.abs(e.clientX - d.sx) < 3 && Math.abs(e.clientY - d.sy) < 3) return;
    d.moved = true;
    const f = frameRef.current; const z = zoomRef.current;
    const sign = flipH ? -1 : 1; // при отражённом холсте горизонталь инвертируется
    const dxp = ((e.clientX - d.sx) / (f.w * z)) * 100 * sign;
    const dyp = ((e.clientY - d.sy) / (f.h * z)) * 100;
    setLayers((ls) => ls.map((l) => {
      if (l.id !== d.id) return l;
      if (d.mode === 'move') return { ...l, x: clamp(d.ox + dxp, -80, 100), y: clamp(d.oy + dyp, -80, 100) };
      if (d.mode === 'resize') return { ...l, w: clamp(d.ow + dxp, 3, 300), h: clamp(d.oh + dyp, 3, 300) };
      if (d.mode === 'fontsize') return { ...l, fontSize: clamp(Math.round(d.ofs + dyp * 1.4), 6, 400) };
      return l;
    }));
  };
  const onLayerDragEnd = () => {
    window.removeEventListener('pointermove', onLayerDragMove);
    window.removeEventListener('pointerup', onLayerDragEnd);
    const d = dragRef.current;
    dragRef.current = null;
    // Коммитим в историю только если реально перетаскивали (клик-выбор ≠ снимок)
    if (d?.moved) commit(layersRef.current);
  };

  // ── Изменение свойств слоя (live + commit) ────────────────────
  const patchLive = (id, patch) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const patchCommit = (id, patch) => commit(layersRef.current.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // ── Видимость / блокировка ────────────────────────────────────
  const toggleVisible = (id) => patchCommit(id, { visible: !layersRef.current.find((l) => l.id === id)?.visible });
  const toggleLock = (id) => patchCommit(id, { locked: !layersRef.current.find((l) => l.id === id)?.locked });

  // ── Добавление слоёв ──────────────────────────────────────────
  const addText = () => {
    const l = {
      id: uid(), name: 'Текст', type: 'text', visible: true, locked: false, opacity: 1, blendMode: 'normal',
      text: 'Ваш текст', x: 18, y: 40, w: 64, rotation: 0,
      fontSize: Math.round(frame.h * 0.07), fontFamily: FONTS[0].v, color: '#1a1a1a',
      align: 'center', bold: true, italic: false, strokeColor: '#ffffff', strokeWidth: 0,
    };
    commit([...layersRef.current, l]); setSelectedId(l.id);
  };
  const addWatermark = () => {
    const l = {
      id: uid(), name: 'Водяной знак', type: 'watermark', visible: true, locked: false, opacity: 0.45, blendMode: 'normal',
      text: '© Ваш бренд', x: 10, y: 88, w: 80, rotation: 0,
      fontSize: Math.round(frame.h * 0.035), fontFamily: FONTS[1].v, color: '#ffffff',
      align: 'center', bold: false, italic: false, strokeColor: '#000000', strokeWidth: 1,
    };
    commit([...layersRef.current, l]); setSelectedId(l.id);
  };
  const addShape = () => {
    const l = {
      id: uid(), name: 'Фигура', type: 'shape', visible: true, locked: false, opacity: 1, blendMode: 'normal',
      shape: 'rect', x: 30, y: 35, w: 40, h: 30, rotation: 0, fill: '#D4A843', radius: 16,
    };
    commit([...layersRef.current, l]); setSelectedId(l.id);
  };
  const addImageFromFile = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast('⚠️ Файл больше 10MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const l = {
        id: uid(), name: file.name.slice(0, 18) || 'Картинка', type: 'image',
        visible: true, locked: false, opacity: 1, blendMode: 'normal',
        src: reader.result, x: 25, y: 25, w: 50, h: 50, fit: 'contain', rotation: 0,
      };
      commit([...layersRef.current, l]); setSelectedId(l.id);
    };
    reader.readAsDataURL(file);
  };

  // ── Дублирование / удаление ───────────────────────────────────
  // Все мутаторы читают layersRef.current (а не closure-копию layers),
  // чтобы клавиатурные/эффектные вызовы не писали устаревший массив.
  const duplicateLayer = (id) => {
    const cur = layersRef.current;
    const src = cur.find((l) => l.id === id); if (!src) return;
    const copy = { ...src, id: uid(), name: `${src.name} копия`, x: (src.x ?? 0) + 4, y: (src.y ?? 0) + 4 };
    const idx = cur.findIndex((l) => l.id === id);
    const next = [...cur]; next.splice(idx + 1, 0, copy);
    commit(next); setSelectedId(copy.id);
  };
  const deleteLayer = (id) => {
    const cur = layersRef.current;
    const lyr = cur.find((l) => l.id === id);
    if (!lyr) return;
    if (lyr.type === 'background') { showToast('Фон удалить нельзя — спрячьте через 👁'); return; }
    if (!window.confirm(`Удалить слой «${lyr.name}»?`)) return;
    commit(cur.filter((l) => l.id !== id));
    setSelectedId((sid) => (sid === id ? null : sid));
  };

  // ── Reorder (drag-and-drop + кнопки) ──────────────────────────
  const dragIdxRef = useRef(null);
  const reorder = (from, to) => {
    if (from == null || to == null || from === to) return;
    const next = [...layersRef.current];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    commit(next);
  };
  const moveZ = (id, dir) => {
    const cur = layersRef.current;
    const i = cur.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    reorder(i, j);
  };

  // ── AI-перерисовка слоя-изображения (Reve) ────────────────────
  const runAiEdit = async () => {
    if (!onAiEdit || !selected || selected.type !== 'image' || !aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const newSrc = await onAiEdit(aiPrompt.trim(), selected.src);
      if (newSrc) { patchCommit(selected.id, { src: newSrc }); setAiPrompt(''); showToast('✨ Слой перерисован'); }
    } catch (err) {
      showToast(`⚠️ ${err.message || 'Ошибка AI'}`);
    } finally { setAiBusy(false); }
  };

  // ── Crop ──────────────────────────────────────────────────────
  const cropDragRef = useRef(null);
  const startCropDraw = (e) => {
    if (!cropMode) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    cropDragRef.current = { x, y };
    setDraftCrop({ x, y, w: 0, h: 0 });
    window.addEventListener('pointermove', cropDrawMove);
    window.addEventListener('pointerup', cropDrawUp);
  };
  const cropDrawMove = (e) => {
    const s = cropDragRef.current; if (!s) return;
    const rect = stageRef.current.getBoundingClientRect();
    const cx = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const cy = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
    setDraftCrop({ x: Math.min(s.x, cx), y: Math.min(s.y, cy), w: Math.abs(cx - s.x), h: Math.abs(cy - s.y) });
  };
  const cropDrawUp = () => {
    window.removeEventListener('pointermove', cropDrawMove);
    window.removeEventListener('pointerup', cropDrawUp);
    cropDragRef.current = null;
  };
  const applyCrop = () => {
    if (draftCrop && draftCrop.w > 3 && draftCrop.h > 3) setCrop(draftCrop);
    setDraftCrop(null); setCropMode(false);
  };
  const cancelCrop = () => { setDraftCrop(null); setCropMode(false); };

  // ── Export ────────────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);
  const [ex, setEx] = useState({ format: 'png', quality: 92, size: 'original', cw: 1200, ch: 1600, watermark: true, forceWhite: false });
  const [exporting, setExporting] = useState(false);

  const exDims = () => {
    const cw = crop ? (crop.w / 100) * frame.w : frame.w;
    const ch = crop ? (crop.h / 100) * frame.h : frame.h;
    if (ex.size === 'wb') return [1200, 1600];
    if (ex.size === '900') return [900, 1200];
    if (ex.size === 'custom') return [clamp(+ex.cw || 16, 16, 4096), clamp(+ex.ch || 16, 16, 4096)];
    return [Math.round(cw), Math.round(ch)];
  };

  const doExport = async (download) => {
    const node = stageRef.current;
    if (!node) return;
    setExporting(true);
    const keepSel = selectedId;
    setSelectedId(null);
    try {
      const { toCanvas } = await import('html-to-image');
      await nextFrame();
      const opts = {
        pixelRatio: 2,
        backgroundColor: ex.forceWhite ? '#ffffff' : undefined,
        filter: (n) => {
          const t = n?.dataset?.layerType;
          if (!ex.watermark && t === 'watermark') return false;
          if (n?.dataset?.uiSkip === '1') return false;
          return true;
        },
      };
      // Встраивание шрифтов иногда падает на cross-origin CSS — тогда рендерим без него
      let src;
      try {
        src = await toCanvas(node, opts);
      } catch (fontErr) {
        console.warn('[CardLayerStudio] font embed failed, retrying without:', fontErr);
        src = await toCanvas(node, { ...opts, skipFonts: true });
      }
      const [tw, th] = exDims();
      const out = document.createElement('canvas');
      out.width = tw; out.height = th;
      const ctx = out.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (ex.forceWhite) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th); }
      const sx = crop ? (crop.x / 100) * src.width : 0;
      const sy = crop ? (crop.y / 100) * src.height : 0;
      const sw = crop ? (crop.w / 100) * src.width : src.width;
      const sh = crop ? (crop.h / 100) * src.height : src.height;
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, tw, th);
      const mime = ex.format === 'png' ? 'image/png' : ex.format === 'webp' ? 'image/webp' : 'image/jpeg';
      const dataUrl = out.toDataURL(mime, ex.format === 'png' ? undefined : clamp(ex.quality, 60, 100) / 100);
      if (download) {
        const a = document.createElement('a');
        a.download = `card-${Date.now()}.${ex.format}`;
        a.href = dataUrl;
        a.click();
        showToast('💾 Карточка скачана!');
      } else {
        if (onSaveToProject) await onSaveToProject(dataUrl, { format: ex.format, w: tw, h: th });
        showToast('✅ Сохранено в проект!');
      }
      setShowExport(false);
    } catch (err) {
      console.error('[CardLayerStudio] export error:', err);
      showToast(`⚠️ Ошибка экспорта: ${err.message || err}`);
    } finally {
      setSelectedId(keepSel);
      setExporting(false);
    }
  };

  // ── Клавиатура ────────────────────────────────────────────────
  useEffect(() => {
    const isField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const onKey = (e) => {
      if (e.key === ' ' && !isField(e.target)) { setSpaceDown(true); e.preventDefault(); }
      // Undo/redo не перехватываем, пока пользователь печатает в поле (родная отмена текста)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isField(e.target)) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !isField(e.target)) { e.preventDefault(); redo(); return; }
      if (e.key === 'Escape') {
        if (showExport) setShowExport(false);
        else if (cropMode) cancelCrop();
        else setSelectedId(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isField(e.target) && selectedId) {
        e.preventDefault(); deleteLayer(selectedId);
      }
    };
    const onKeyUp = (e) => { if (e.key === ' ') setSpaceDown(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [undo, redo, showExport, cropMode, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ═══════════════════════════════════════════════════════════════
  //  RENDER HELPERS
  // ═══════════════════════════════════════════════════════════════
  const renderLayerNode = (layer, z) => {
    const common = {
      opacity: layer.opacity,
      mixBlendMode: layer.blendMode,
      zIndex: z,
      visibility: layer.visible ? 'visible' : 'hidden',
      pointerEvents: layer.locked || cropMode ? 'none' : 'auto',
    };
    const isSel = layer.id === selectedId && !cropMode;

    if (layer.type === 'background') {
      const bg = layer.bgType === 'gradient'
        ? `linear-gradient(${layer.gradAngle}deg, ${layer.gradFrom}, ${layer.gradTo})`
        : layer.bgColor;
      return (
        <div key={layer.id} data-layer data-layer-type="background"
          className="cls-layer cls-layer-bg"
          style={{ position: 'absolute', inset: 0, background: bg, ...common, pointerEvents: 'none' }} />
      );
    }

    if (layer.type === 'image') {
      return (
        <div key={layer.id} data-layer data-layer-type="image"
          className={`cls-layer cls-layer-img ${isSel ? 'sel' : ''}`}
          style={{ position: 'absolute', left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.w}%`, height: `${layer.h}%`, ...common }}
          onPointerDown={(e) => startLayerDrag(e, layer, 'move')}>
          <img src={layer.src} alt={layer.name} draggable={false}
            style={{ width: '100%', height: '100%', objectFit: layer.fit, display: 'block', userSelect: 'none', pointerEvents: 'none' }} />
          {isSel && !layer.locked && (
            <span className="cls-handle cls-handle-br" data-ui-skip="1"
              onPointerDown={(e) => startLayerDrag(e, layer, 'resize')} />
          )}
        </div>
      );
    }

    if (layer.type === 'shape') {
      return (
        <div key={layer.id} data-layer data-layer-type="shape"
          className={`cls-layer cls-layer-shape ${isSel ? 'sel' : ''}`}
          style={{ position: 'absolute', left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.w}%`, height: `${layer.h}%`, ...common }}
          onPointerDown={(e) => startLayerDrag(e, layer, 'move')}>
          <div style={{ width: '100%', height: '100%', background: layer.fill, borderRadius: layer.shape === 'ellipse' ? '50%' : `${layer.radius}px` }} />
          {isSel && !layer.locked && (
            <span className="cls-handle cls-handle-br" data-ui-skip="1"
              onPointerDown={(e) => startLayerDrag(e, layer, 'resize')} />
          )}
        </div>
      );
    }

    // text / watermark
    return (
      <div key={layer.id} data-layer data-layer-type={layer.type}
        className={`cls-layer cls-layer-text ${isSel ? 'sel' : ''}`}
        style={{
          position: 'absolute', left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.w}%`,
          textAlign: layer.align, ...common,
        }}
        onPointerDown={(e) => startLayerDrag(e, layer, 'move')}>
        <span style={{
          display: 'inline-block', width: layer.align === 'center' ? '100%' : 'auto',
          fontFamily: layer.fontFamily, fontSize: `${layer.fontSize}px`, color: layer.color,
          fontWeight: layer.bold ? 800 : 400, fontStyle: layer.italic ? 'italic' : 'normal',
          lineHeight: 1.12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          WebkitTextStrokeWidth: layer.strokeWidth ? `${layer.strokeWidth}px` : undefined,
          WebkitTextStrokeColor: layer.strokeWidth ? layer.strokeColor : undefined,
        }}>{layer.text}</span>
        {isSel && !layer.locked && (
          <span className="cls-handle cls-handle-br" data-ui-skip="1" title="Размер шрифта"
            onPointerDown={(e) => startLayerDrag(e, layer, 'fontsize')} />
        )}
      </div>
    );
  };

  const Thumb = ({ layer }) => {
    if (layer.type === 'image') return <img className="cls-thumb-img" src={layer.src} alt="" draggable={false} />;
    if (layer.type === 'background') {
      const bg = layer.bgType === 'gradient' ? `linear-gradient(${layer.gradAngle}deg, ${layer.gradFrom}, ${layer.gradTo})` : layer.bgColor;
      return <span className="cls-thumb-swatch" style={{ background: bg }} />;
    }
    if (layer.type === 'shape') return <span className="cls-thumb-swatch" style={{ background: layer.fill, borderRadius: layer.shape === 'ellipse' ? '50%' : 6 }} />;
    return <span className="cls-thumb-text" style={{ color: layer.color, fontFamily: layer.fontFamily }}>{layer.type === 'watermark' ? '💧' : 'T'}</span>;
  };

  const reversed = layers.slice().reverse();

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <motion.div className="cls-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="cls-container">

        {/* HEADER */}
        <div className="cls-header">
          <div className="cls-header-left">
            <span className="cls-logo">✦ Студия карточки</span>
            <span className="cls-subtitle">{layers.length} слоёв · {Math.round(zoom * 100)}%</span>
          </div>
          <div className="cls-header-right">
            <button className="cls-btn cls-btn-export" onClick={() => setShowExport(true)}>⬇ Экспорт</button>
            <button className="cls-close" onClick={onClose} title="Закрыть (готово)">✕</button>
          </div>
        </div>

        {/* MAIN: canvas + layers */}
        <div className="cls-main">

          {/* LEFT — canvas */}
          <div className="cls-canvas-col">
            <div
              ref={viewportRef}
              className={`cls-viewport ${spaceDown ? 'panning' : ''} ${cropMode ? 'cropping' : ''}`}
              onPointerDown={onViewportPointerDown}
            >
              <div className="cls-stage-pan" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <div ref={stageRef} className="cls-stage" style={{ width: frame.w, height: frame.h }}>
                  <div className="cls-flip" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, transform: flipH ? 'scaleX(-1)' : 'none' }}>
                    {layers.map((l, i) => renderLayerNode(l, i))}
                  </div>

                  {/* CROP overlay */}
                  {(crop || cropMode) && (
                    <div className="cls-crop-overlay" data-ui-skip="1"
                      style={{ position: 'absolute', inset: 0, zIndex: 9999, cursor: cropMode ? 'crosshair' : 'default', pointerEvents: cropMode ? 'auto' : 'none' }}
                      onPointerDown={startCropDraw}>
                      {(() => {
                        const c = draftCrop || crop;
                        if (!c) return null;
                        return (
                          <>
                            <div className="cls-crop-dim" style={{ left: 0, top: 0, width: '100%', height: `${c.y}%` }} />
                            <div className="cls-crop-dim" style={{ left: 0, top: `${c.y + c.h}%`, width: '100%', bottom: 0 }} />
                            <div className="cls-crop-dim" style={{ left: 0, top: `${c.y}%`, width: `${c.x}%`, height: `${c.h}%` }} />
                            <div className="cls-crop-dim" style={{ left: `${c.x + c.w}%`, top: `${c.y}%`, right: 0, height: `${c.h}%` }} />
                            <div className="cls-crop-rect" style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%` }} />
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* zoom HUD */}
              <div className="cls-zoom-hud" data-ui-skip="1">
                <button onClick={() => setZoom((z) => clamp(z * 0.9, 0.05, 5))} title="Уменьшить">−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => clamp(z * 1.1, 0.05, 5))} title="Увеличить">+</button>
                <button onClick={fitToScreen} title="Вписать в экран">⤢</button>
              </div>

              {cropMode && (
                <div className="cls-crop-bar" data-ui-skip="1">
                  <span>Выделите область кадрирования</span>
                  <button className="cls-btn" onClick={applyCrop}>✓ Применить</button>
                  <button className="cls-btn ghost" onClick={cancelCrop}>Отмена</button>
                </div>
              )}
            </div>

            {/* BOTTOM TOOLBAR */}
            <div className="cls-toolbar">
              <button className="cls-tool" onClick={undo} disabled={!canUndo} title="Отменить (Ctrl+Z)">↩ Отменить</button>
              <button className="cls-tool" onClick={redo} disabled={!canRedo} title="Вернуть (Ctrl+Shift+Z)">↪ Вернуть</button>
              <span className="cls-tool-sep" />
              <button className="cls-tool" onClick={resetAll} title="Сбросить к исходной">⟲ Сброс</button>
              <button className={`cls-tool ${cropMode ? 'active' : ''}`} onClick={() => { setCropMode((v) => !v); setDraftCrop(null); }} title="Кадрировать">▢ Кадр</button>
              {crop && <button className="cls-tool" onClick={() => setCrop(null)} title="Сбросить кадр">▢⨯ Сброс кадра</button>}
              <button className={`cls-tool ${flipH ? 'active' : ''}`} onClick={() => setFlipH((v) => !v)} title="Отзеркалить">⇄ Зеркало</button>
            </div>
          </div>

          {/* RIGHT — layers panel */}
          <div className="cls-panel">
            <div className="cls-panel-head">
              <span className="cls-panel-title">📋 Слои</span>
              <div className="cls-add-row">
                <button className="cls-add" onClick={addText} title="Добавить текст">+ Текст</button>
                <button className="cls-add" onClick={() => imageInputRef.current?.click()} title="Добавить картинку">+ Фото</button>
                <button className="cls-add" onClick={addShape} title="Добавить фигуру">+ Фигура</button>
                <button className="cls-add" onClick={addWatermark} title="Добавить водяной знак">+ ©</button>
                <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                  onChange={(e) => { addImageFromFile(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            </div>

            <div className="cls-layers-list">
              {reversed.map((layer) => {
                const arrIdx = layers.indexOf(layer);
                const isSel = layer.id === selectedId;
                return (
                  <div key={layer.id}
                    className={`cls-layer-row ${isSel ? 'sel' : ''}`}
                    draggable
                    onDragStart={() => { dragIdxRef.current = arrIdx; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => reorder(dragIdxRef.current, arrIdx)}
                    onClick={() => setSelectedId(layer.id)}
                  >
                    <div className="cls-row-main">
                      <span className="cls-grip" title="Перетащите для порядка">⠿</span>
                      <span className="cls-thumb"><Thumb layer={layer} /></span>
                      {renaming === layer.id ? (
                        <input className="cls-name-input" autoFocus defaultValue={layer.name}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => { patchCommit(layer.id, { name: e.target.value || layer.name }); setRenaming(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setRenaming(null); }} />
                      ) : (
                        <span className="cls-row-name" onDoubleClick={(e) => { e.stopPropagation(); setRenaming(layer.id); }}>
                          <span className="cls-row-ico">{LAYER_ICON[layer.type]}</span>{layer.name}
                        </span>
                      )}
                      <button className={`cls-icobtn ${layer.visible ? '' : 'off'}`} title="Видимость"
                        onClick={(e) => { e.stopPropagation(); toggleVisible(layer.id); }}>{layer.visible ? '👁' : '🚫'}</button>
                      <button className={`cls-icobtn ${layer.locked ? 'on' : ''}`} title="Блокировка"
                        onClick={(e) => { e.stopPropagation(); toggleLock(layer.id); }}>{layer.locked ? '🔒' : '🔓'}</button>
                    </div>

                    {isSel && (
                      <div className="cls-row-edit" onClick={(e) => e.stopPropagation()}>
                        {/* opacity + blend (всем) */}
                        <div className="cls-field">
                          <label>Прозрачность <b>{Math.round(layer.opacity * 100)}%</b></label>
                          <input type="range" min="0" max="100" value={Math.round(layer.opacity * 100)}
                            onChange={(e) => patchLive(layer.id, { opacity: +e.target.value / 100 })}
                            onPointerUp={() => commit(layersRef.current)} />
                        </div>
                        <div className="cls-field">
                          <label>Режим наложения</label>
                          <select value={layer.blendMode} onChange={(e) => patchCommit(layer.id, { blendMode: e.target.value })}>
                            {BLEND_MODES.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
                          </select>
                        </div>

                        {/* background */}
                        {layer.type === 'background' && (
                          <>
                            <div className="cls-field cls-row2">
                              <button className={`cls-mini ${layer.bgType === 'color' ? 'on' : ''}`} onClick={() => patchCommit(layer.id, { bgType: 'color' })}>Цвет</button>
                              <button className={`cls-mini ${layer.bgType === 'gradient' ? 'on' : ''}`} onClick={() => patchCommit(layer.id, { bgType: 'gradient' })}>Градиент</button>
                            </div>
                            {layer.bgType === 'color' ? (
                              <div className="cls-field"><label>Цвет фона</label>
                                <input type="color" value={layer.bgColor} onChange={(e) => patchCommit(layer.id, { bgColor: e.target.value })} /></div>
                            ) : (
                              <div className="cls-field cls-row2">
                                <input type="color" value={layer.gradFrom} onChange={(e) => patchCommit(layer.id, { gradFrom: e.target.value })} />
                                <input type="color" value={layer.gradTo} onChange={(e) => patchCommit(layer.id, { gradTo: e.target.value })} />
                              </div>
                            )}
                          </>
                        )}

                        {/* text / watermark */}
                        {(layer.type === 'text' || layer.type === 'watermark') && (
                          <>
                            <div className="cls-field"><label>Текст</label>
                              <textarea rows={2} value={layer.text} onChange={(e) => patchLive(layer.id, { text: e.target.value })} onBlur={() => commit(layersRef.current)} /></div>
                            <div className="cls-field cls-row2">
                              <select value={layer.fontFamily} onChange={(e) => patchCommit(layer.id, { fontFamily: e.target.value })}>
                                {FONTS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
                              </select>
                              <input type="color" value={layer.color} onChange={(e) => patchCommit(layer.id, { color: e.target.value })} />
                            </div>
                            <div className="cls-field">
                              <label>Размер <b>{layer.fontSize}px</b></label>
                              <input type="range" min="8" max={Math.round(frame.h * 0.3)} value={layer.fontSize}
                                onChange={(e) => patchLive(layer.id, { fontSize: +e.target.value })} onPointerUp={() => commit(layersRef.current)} />
                            </div>
                            <div className="cls-field cls-row2">
                              {['left', 'center', 'right'].map((a) => (
                                <button key={a} className={`cls-mini ${layer.align === a ? 'on' : ''}`} onClick={() => patchCommit(layer.id, { align: a })}>
                                  {a === 'left' ? '⬅' : a === 'center' ? '⬌' : '➡'}
                                </button>
                              ))}
                              <button className={`cls-mini ${layer.bold ? 'on' : ''}`} onClick={() => patchCommit(layer.id, { bold: !layer.bold })}><b>Ж</b></button>
                              <button className={`cls-mini ${layer.italic ? 'on' : ''}`} onClick={() => patchCommit(layer.id, { italic: !layer.italic })}><i>К</i></button>
                            </div>
                            <div className="cls-field cls-row2">
                              <label className="cls-inline">Обводка</label>
                              <input type="range" min="0" max="12" value={layer.strokeWidth} onChange={(e) => patchLive(layer.id, { strokeWidth: +e.target.value })} onPointerUp={() => commit(layersRef.current)} />
                              <input type="color" value={layer.strokeColor} onChange={(e) => patchCommit(layer.id, { strokeColor: e.target.value })} />
                            </div>
                          </>
                        )}

                        {/* shape */}
                        {layer.type === 'shape' && (
                          <>
                            <div className="cls-field cls-row2">
                              <button className={`cls-mini ${layer.shape === 'rect' ? 'on' : ''}`} onClick={() => patchCommit(layer.id, { shape: 'rect' })}>▭</button>
                              <button className={`cls-mini ${layer.shape === 'ellipse' ? 'on' : ''}`} onClick={() => patchCommit(layer.id, { shape: 'ellipse' })}>⬭</button>
                              <input type="color" value={layer.fill} onChange={(e) => patchCommit(layer.id, { fill: e.target.value })} />
                            </div>
                            {layer.shape === 'rect' && (
                              <div className="cls-field"><label>Скругление <b>{layer.radius}px</b></label>
                                <input type="range" min="0" max="120" value={layer.radius} onChange={(e) => patchLive(layer.id, { radius: +e.target.value })} onPointerUp={() => commit(layersRef.current)} /></div>
                            )}
                          </>
                        )}

                        {/* image — AI re-draw */}
                        {layer.type === 'image' && onAiEdit && (
                          <div className="cls-field cls-ai">
                            <label>✦ AI-перерисовка слоя</label>
                            <textarea rows={2} placeholder="Опишите, что изменить…" value={aiPrompt}
                              onChange={(e) => setAiPrompt(e.target.value)} disabled={aiBusy} />
                            <button className="cls-btn cls-ai-btn" onClick={runAiEdit} disabled={aiBusy || !aiPrompt.trim()}>
                              {aiBusy ? '⏳ Reve рисует…' : '✨ Перерисовать (Reve)'}
                            </button>
                          </div>
                        )}

                        {/* per-layer actions */}
                        <div className="cls-row-actions">
                          <button onClick={() => moveZ(layer.id, +1)} title="Выше">▲</button>
                          <button onClick={() => moveZ(layer.id, -1)} title="Ниже">▼</button>
                          <button onClick={() => duplicateLayer(layer.id)} title="Дублировать">⧉</button>
                          {layer.type !== 'background' && <button className="danger" onClick={() => deleteLayer(layer.id)} title="Удалить">🗑</button>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="cls-panel-foot">
              💡 Колесо — зум · пробел+тащить — панорама · 2× клик по имени — переименовать
            </div>
          </div>
        </div>

        {/* EXPORT MODAL */}
        <AnimatePresence>
          {showExport && (
            <motion.div className="cls-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !exporting && setShowExport(false)}>
              <motion.div className="cls-modal" onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
                <div className="cls-modal-head"><span>⬇ Экспорт карточки</span>
                  <button className="cls-close" onClick={() => !exporting && setShowExport(false)}>✕</button></div>

                <div className="cls-modal-body">
                  <div className="cls-ex-field">
                    <label>Формат</label>
                    <div className="cls-seg">
                      {['png', 'jpg', 'webp'].map((f) => (
                        <button key={f} className={ex.format === f ? 'on' : ''} onClick={() => setEx((s) => ({ ...s, format: f }))}>{f.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>

                  {ex.format !== 'png' && (
                    <div className="cls-ex-field">
                      <label>Качество <b>{ex.quality}%</b></label>
                      <input type="range" min="60" max="100" value={ex.quality} onChange={(e) => setEx((s) => ({ ...s, quality: +e.target.value }))} />
                    </div>
                  )}

                  <div className="cls-ex-field">
                    <label>Размер</label>
                    <div className="cls-seg cls-seg-wrap">
                      <button className={ex.size === 'original' ? 'on' : ''} onClick={() => setEx((s) => ({ ...s, size: 'original' }))}>Оригинал</button>
                      <button className={ex.size === 'wb' ? 'on' : ''} onClick={() => setEx((s) => ({ ...s, size: 'wb' }))}>1200×1600 (WB)</button>
                      <button className={ex.size === '900' ? 'on' : ''} onClick={() => setEx((s) => ({ ...s, size: '900' }))}>900×1200</button>
                      <button className={ex.size === 'custom' ? 'on' : ''} onClick={() => setEx((s) => ({ ...s, size: 'custom' }))}>Свой</button>
                    </div>
                    {ex.size === 'custom' && (
                      <div className="cls-custom-size">
                        <input type="number" value={ex.cw} min="16" max="4096" onChange={(e) => setEx((s) => ({ ...s, cw: e.target.value }))} /> ×
                        <input type="number" value={ex.ch} min="16" max="4096" onChange={(e) => setEx((s) => ({ ...s, ch: e.target.value }))} />
                      </div>
                    )}
                  </div>

                  <label className="cls-check"><input type="checkbox" checked={ex.watermark} onChange={(e) => setEx((s) => ({ ...s, watermark: e.target.checked }))} /> С водяным знаком</label>
                  <label className="cls-check"><input type="checkbox" checked={ex.forceWhite} onChange={(e) => setEx((s) => ({ ...s, forceWhite: e.target.checked }))} /> Принудительно белый фон</label>
                </div>

                <div className="cls-modal-foot">
                  <button className="cls-btn ghost" disabled={exporting} onClick={() => doExport(false)}>💾 Сохранить в проект</button>
                  <button className="cls-btn cls-btn-export" disabled={exporting} onClick={() => doExport(true)}>
                    {exporting ? '⏳ Готовим…' : '⬇ Скачать'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TOAST */}
        <AnimatePresence>
          {toast && (
            <motion.div className="cls-toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
