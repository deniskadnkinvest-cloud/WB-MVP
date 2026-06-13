import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './SmartCardEditor.css';

// ═══════════════════════════════════════════════════════════════
//  SmartCardEditor v2 — Умный редактор с автодетекцией элементов
//  Gemini Vision определяет все элементы + bounding boxes.
//  Hover → подсветка элемента. Click → попап редактирования.
// ═══════════════════════════════════════════════════════════════

const EDIT_MODES = {
  SELECT: 'select',
  BRUSH:  'brush',
};

const QUICK_ACTIONS = [
  { id: 'text',       icon: '✏️', label: 'Изменить текст',   placeholder: 'Напишите новый текст...' },
  { id: 'color',      icon: '🎨', label: 'Изменить цвет',    placeholder: 'Например: сделай синим...' },
  { id: 'regenerate', icon: '🔄', label: 'Перегенерировать', placeholder: 'Опишите как должно выглядеть...' },
  { id: 'remove',     icon: '🗑️', label: 'Убрать элемент',   placeholder: '' },
];

export default function SmartCardEditor({ imageUrl, onClose, onEdit }) {
  const imageRef         = useRef(null);
  const maskCanvasRef    = useRef(null);

  // ── Состояния ────────────────────────────────────────────────
  const [mode, setMode]           = useState(EDIT_MODES.SELECT);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Автодетекция элементов (Gemini Vision bounding boxes)
  const [elements, setElements]         = useState([]);       // [{name, bbox:[x%,y%,w%,h%]}]
  const [isScanning, setIsScanning]     = useState(false);
  const [scanError, setScanError]       = useState(false);
  const [hoveredIdx, setHoveredIdx]     = useState(null);     // Индекс элемента под курсором
  const [selectedIdx, setSelectedIdx]   = useState(null);     // Индекс выбранного элемента

  // Попап
  const [selectedAction, setSelectedAction] = useState(null);
  const [editPrompt, setEditPrompt]         = useState('');
  const [isProcessing, setIsProcessing]     = useState(false);

  // Brush
  const [isDrawing, setIsDrawing]     = useState(false);
  const [brushSize, setBrushSize]     = useState(40);
  const [paths, setPaths]             = useState([]);
  const [currentPath, setCurrentPath] = useState(null);
  const [brushPopup, setBrushPopup]   = useState(false);
  const rafRef = useRef(null);

  // ── Сканирование элементов через Gemini Vision ───────────────
  const scanElements = useCallback(async (signal) => {
    if (!imageUrl) return;
    setIsScanning(true);
    setScanError(false);
    try {
      const resp = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'detect-elements',
          imageBase64: imageUrl,
        }),
        signal,
      });
      if (signal?.aborted) return;
      if (resp.ok) {
        const data = await resp.json();
        if (signal?.aborted) return;
        if (data.elements?.length) {
          setElements(data.elements);
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[SmartCardEditor] scan error:', err);
      setScanError(true);
    } finally {
      setIsScanning(false);
    }
  }, [imageUrl]);

  // Запускаем сканирование при загрузке картинки
  useEffect(() => {
    if (!imgLoaded || !imageUrl) return;
    const controller = new AbortController();
    scanElements(controller.signal);
    return () => controller.abort();
  }, [imgLoaded, imageUrl, scanElements]);

  // ── Определяем какой элемент под курсором ────────────────────
  const getElementAtPoint = (clientX, clientY) => {
    const img = imageRef.current;
    if (!img || !elements.length) return -1;
    const rect = img.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * 100;
    const py = ((clientY - rect.top) / rect.height) * 100;

    // Ищем самый маленький элемент, содержащий точку (приоритет мелким)
    let bestIdx = -1;
    let bestArea = Infinity;
    elements.forEach((el, i) => {
      const [ex, ey, ew, eh] = el.bbox;
      if (px >= ex && px <= ex + ew && py >= ey && py <= ey + eh) {
        const area = ew * eh;
        if (area < bestArea) { bestArea = area; bestIdx = i; }
      }
    });
    return bestIdx;
  };

  // ── Mouse handlers (SELECT mode) ─────────────────────────────
  const handleMouseMove = (e) => {
    if (mode !== EDIT_MODES.SELECT) return;
    if (rafRef.current) return; // skip if pending
    const clientX = e.clientX;
    const clientY = e.clientY;
    rafRef.current = requestAnimationFrame(() => {
      const idx = getElementAtPoint(clientX, clientY);
      setHoveredIdx(idx);
      rafRef.current = null;
    });
  };

  const handleClick = (e) => {
    if (mode !== EDIT_MODES.SELECT) return;
    const idx = getElementAtPoint(e.clientX, e.clientY);
    if (idx >= 0) {
      setSelectedIdx(idx);
      setSelectedAction(null);
      setEditPrompt('');
    } else {
      setSelectedIdx(null);
    }
  };

  // ── Brush handlers ───────────────────────────────────────────
  const getCoordsOnImage = (e) => {
    const img = imageRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  };

  const startDrawing = (e) => {
    if (mode !== EDIT_MODES.BRUSH) return;
    e.preventDefault();
    const { x, y } = getCoordsOnImage(e);
    setIsDrawing(true);
    setCurrentPath({ points: [{ x, y }], size: brushSize });
  };

  const moveDrawing = (e) => {
    if (mode === EDIT_MODES.BRUSH && isDrawing) {
      const { x, y } = getCoordsOnImage(e);
      setCurrentPath(prev => ({
        ...prev,
        points: [...(prev?.points || []), { x, y }],
      }));
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath?.points?.length) {
      setPaths(prev => [...prev, currentPath]);
      setBrushPopup(true);
    }
    setCurrentPath(null);
  };

  // Отрисовка brush на canvas
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imgLoaded) return;
    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const draw = (path) => {
      if (!path?.points?.length) return;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(99, 179, 255, 0.5)';
      ctx.lineWidth = path.size;
      path.points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
    };
    paths.forEach(draw);
    if (currentPath) draw(currentPath);
  }, [paths, currentPath, imgLoaded]);

  // ── Генерация маски ──────────────────────────────────────────
  const generateMask = () => {
    const img = imageRef.current;
    if (!img) return null;
    const mc = document.createElement('canvas');
    mc.width = img.naturalWidth;
    mc.height = img.naturalHeight;
    const ctx = mc.getContext('2d');
    const sx = img.naturalWidth / img.offsetWidth;
    const sy = img.naturalHeight / img.offsetHeight;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, mc.width, mc.height);
    ctx.fillStyle = '#fff';

    if (mode === EDIT_MODES.BRUSH && paths.length) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#fff';
      paths.forEach(p => {
        ctx.beginPath();
        ctx.lineWidth = p.size * sx;
        p.points.forEach((pt, i) =>
          i === 0 ? ctx.moveTo(pt.x * sx, pt.y * sy) : ctx.lineTo(pt.x * sx, pt.y * sy)
        );
        ctx.stroke();
      });
    } else if (selectedIdx !== null && elements[selectedIdx]) {
      const [ex, ey, ew, eh] = elements[selectedIdx].bbox;
      const rx = (ex / 100) * mc.width;
      const ry = (ey / 100) * mc.height;
      const rw = (ew / 100) * mc.width;
      const rh = (eh / 100) * mc.height;
      // Скругленный прямоугольник для маски
      const r = Math.min(rw, rh) * 0.08;
      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + rw - r, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
      ctx.lineTo(rx + rw, ry + rh - r);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
      ctx.lineTo(rx + r, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
      ctx.lineTo(rx, ry + r);
      ctx.quadraticCurveTo(rx, ry, rx + r, ry);
      ctx.fill();
    }
    return mc.toDataURL('image/png');
  };

  // ── Отправка редактирования ──────────────────────────────────
  const handleSubmitEdit = async () => {
    if (!editPrompt.trim() && selectedAction?.id !== 'remove') return;
    setIsProcessing(true);
    try {
      const maskBase64 = generateMask();
      if (!maskBase64) {
        alert('Не удалось создать маску. Попробуйте снова.');
        setIsProcessing(false);
        return;
      }
      let finalPrompt = editPrompt;
      if (selectedAction?.id === 'remove')     finalPrompt = 'Remove this element completely. Fill area naturally with surrounding background.';
      if (selectedAction?.id === 'color')      finalPrompt = `Change the color: ${editPrompt}`;
      if (selectedAction?.id === 'regenerate') finalPrompt = editPrompt || 'Regenerate this element with better quality.';

      await onEdit(finalPrompt, maskBase64);
      setPaths([]);
      setSelectedIdx(null);
      setSelectedAction(null);
      setEditPrompt('');
      setBrushPopup(false);
      // Пересканируем после редактирования
      scanElements();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') { setSelectedIdx(null); setBrushPopup(false); }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) setPaths(p => p.slice(0, -1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.download = `card-${Date.now()}.png`;
    a.href = imageUrl;
    a.click();
  };

  // ── Вычисляем позицию попапа для выбранного элемента ─────────
  const getPopupPos = () => {
    if (selectedIdx === null || !elements[selectedIdx] || !imageRef.current) return {};
    const [ex, ey, ew, eh] = elements[selectedIdx].bbox;
    const img = imageRef.current;
    const px = ((ex + ew) / 100) * img.offsetWidth + 12;
    const py = ((ey) / 100) * img.offsetHeight;
    return {
      left: Math.min(px, img.offsetWidth - 280),
      top: Math.max(py, 10),
    };
  };

  // ═════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════
  return (
    <motion.div className="sce-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="sce-container">

        {/* HEADER */}
        <div className="sce-header">
          <div className="sce-header-left">
            <span className="sce-logo">✦ Умный Редактор</span>
            <span className="sce-subtitle">
              {isScanning ? '🔍 Сканирую элементы...' :
               scanError ? '⚠️ Не удалось определить элементы. Используйте кисть или пересканируйте.' :
               elements.length ? `Найдено ${elements.length} элементов — наведите и кликните` :
               'Кликните на элемент для редактирования'}
            </span>
          </div>
          <div className="sce-header-tools">
            <div className="sce-mode-toggle">
              <button className={`sce-mode-btn ${mode === EDIT_MODES.SELECT ? 'active' : ''}`}
                onClick={() => { setMode(EDIT_MODES.SELECT); setPaths([]); setBrushPopup(false); }}>
                ◎ Выбор
              </button>
              <button className={`sce-mode-btn ${mode === EDIT_MODES.BRUSH ? 'active' : ''}`}
                onClick={() => { setMode(EDIT_MODES.BRUSH); setSelectedIdx(null); }}>
                ✒ Кисть
              </button>
            </div>
            {mode === EDIT_MODES.BRUSH && (
              <div className="sce-brush-control">
                <span>Размер:</span>
                <input type="range" min="10" max="100" value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))} />
                <span className="sce-brush-size-label">{brushSize}px</span>
              </div>
            )}
            <button className="sce-icon-btn" onClick={() => setPaths(p => p.slice(0, -1))}
              disabled={paths.length === 0}>↩ Отменить</button>
            {elements.length > 0 && (
              <button className="sce-icon-btn" onClick={scanElements} disabled={isScanning}>
                🔄 Пересканировать
              </button>
            )}
            <button className="sce-icon-btn sce-download-btn" onClick={handleDownload}>⬇ Скачать</button>
            <button className="sce-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* WORKSPACE */}
        <div className="sce-workspace">
          <div className={`sce-image-zone ${isProcessing ? 'processing' : ''}`}>

            {/* Картинка */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Карточка"
              className="sce-base-image"
              draggable={false}
              onLoad={() => setImgLoaded(true)}
            />

            {/* Bounding boxes overlay (SELECT mode) */}
            {mode === EDIT_MODES.SELECT && imgLoaded && (
              <div
                className="sce-bbox-layer"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={handleClick}
              >
                {elements.map((el, i) => {
                  const [ex, ey, ew, eh] = el.bbox;
                  const isHovered = hoveredIdx === i;
                  const isSelected = selectedIdx === i;
                  return (
                    <div key={i}
                      className={`sce-bbox ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
                      style={{
                        left: `${ex}%`, top: `${ey}%`,
                        width: `${ew}%`, height: `${eh}%`,
                      }}
                    >
                      {/* Метка элемента */}
                      {(isHovered || isSelected) && (
                        <div className="sce-bbox-label">
                          {el.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Brush canvas */}
            {mode === EDIT_MODES.BRUSH && (
              <canvas
                ref={maskCanvasRef}
                className="sce-mask-canvas"
                onMouseDown={startDrawing}
                onMouseMove={moveDrawing}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={(e) => { e.preventDefault(); moveDrawing(e); }}
                onTouchEnd={stopDrawing}
              />
            )}

            {/* Scanning overlay */}
            {isScanning && (
              <div className="sce-scanning-overlay">
                <div className="sce-scan-line" />
                <span>🔍 Анализирую элементы карточки...</span>
              </div>
            )}

            {/* Processing overlay */}
            <AnimatePresence>
              {isProcessing && (
                <motion.div className="sce-processing-overlay"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="sce-spinner" />
                  <span>Reve перерисовывает элемент...</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* POPUP для выбранного элемента (SELECT mode) */}
            <AnimatePresence>
              {selectedIdx !== null && !isProcessing && mode === EDIT_MODES.SELECT && (
                <motion.div className="sce-popup" style={getPopupPos()}
                  initial={{ opacity: 0, scale: 0.85, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: 10 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25, mass: 0.5 }}>

                  <div className="sce-popup-hint">
                    <span className="sce-hint-dot" />
                    <span>{elements[selectedIdx]?.name || 'Элемент'}</span>
                  </div>

                  {!selectedAction && (
                    <div className="sce-popup-actions">
                      {QUICK_ACTIONS.map(a => (
                        <button key={a.id} className="sce-action-btn"
                          onClick={() => { setSelectedAction(a); if (a.id === 'remove') setEditPrompt('remove'); }}>
                          <span className="sce-action-icon">{a.icon}</span>
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedAction && selectedAction.id !== 'remove' && (
                    <div className="sce-popup-input-area">
                      <div className="sce-action-label">{selectedAction.icon} {selectedAction.label}</div>
                      <textarea className="sce-edit-input" placeholder={selectedAction.placeholder}
                        value={editPrompt} onChange={e => setEditPrompt(e.target.value)} autoFocus rows={2}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitEdit(); }}} />
                      <div className="sce-popup-footer">
                        <button className="sce-back-btn" onClick={() => setSelectedAction(null)}>← Назад</button>
                        <button className="sce-submit-btn" onClick={handleSubmitEdit}
                          disabled={!editPrompt.trim()}>✨ Применить</button>
                      </div>
                    </div>
                  )}

                  {selectedAction?.id === 'remove' && (
                    <div className="sce-popup-input-area">
                      <div className="sce-action-label sce-danger">🗑️ Убрать «{elements[selectedIdx]?.name}»?</div>
                      <p className="sce-remove-desc">ИИ уберёт элемент и заполнит область фоном</p>
                      <div className="sce-popup-footer">
                        <button className="sce-back-btn" onClick={() => setSelectedAction(null)}>← Отмена</button>
                        <button className="sce-submit-btn sce-danger-btn" onClick={handleSubmitEdit}>🗑️ Убрать</button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* POPUP для brush mode */}
            <AnimatePresence>
              {brushPopup && mode === EDIT_MODES.BRUSH && !isProcessing && (
                <motion.div className="sce-popup" style={{ right: 20, top: 20, left: 'auto' }}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25, mass: 0.5 }}>
                  <div className="sce-popup-hint">
                    <span className="sce-hint-dot" />
                    <span>Область выделена — что изменить?</span>
                  </div>
                  <textarea className="sce-edit-input" placeholder="Опишите что изменить..."
                    value={editPrompt} onChange={e => setEditPrompt(e.target.value)} autoFocus rows={2}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitEdit(); }}} />
                  <div className="sce-popup-footer">
                    <button className="sce-back-btn" onClick={() => { setBrushPopup(false); setPaths([]); }}>← Сбросить</button>
                    <button className="sce-submit-btn" onClick={handleSubmitEdit}
                      disabled={!editPrompt.trim()}>✨ Применить</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* FOOTER */}
        <div className="sce-footer">
          <span className="sce-footer-tip">
            {mode === EDIT_MODES.SELECT
              ? '💡 Наведите мышку на элемент — он подсветится. Кликните чтобы редактировать.'
              : '💡 Закрасьте область кистью, затем опишите что изменить. Ctrl+Z — отменить.'}
          </span>
          <span className="sce-shortcut-hint">Esc — закрыть · Ctrl+Z — отменить</span>
        </div>
      </div>
    </motion.div>
  );
}
