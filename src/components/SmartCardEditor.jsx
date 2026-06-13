import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './SmartCardEditor.css';

// ═══════════════════════════════════════════════════════════════
//  SmartCardEditor — Умный редактор карточки маркетплейса
//  Аналог Reve Editor, но лучше: русский интерфейс, плавающий
//  попап, AI-контекстные подсказки, brush-режим.
// ═══════════════════════════════════════════════════════════════

const EDIT_MODES = {
  SELECT: 'select',   // Умный выбор — наводишь, кликаешь
  BRUSH:  'brush',    // Ручная кисть
};

const QUICK_ACTIONS = [
  { id: 'text',        icon: '✏️', label: 'Изменить текст',      placeholder: 'Напишите новый текст...' },
  { id: 'color',       icon: '🎨', label: 'Изменить цвет',       placeholder: 'Например: сделай синим...' },
  { id: 'regenerate',  icon: '🔄', label: 'Перегенерировать',    placeholder: 'Опишите как должно выглядеть...' },
  { id: 'remove',      icon: '🗑️', label: 'Убрать элемент',      placeholder: 'Элемент будет удалён...' },
];

export default function SmartCardEditor({ imageUrl, onClose, onEdit }) {
  const containerRef     = useRef(null);
  const imageRef         = useRef(null);
  const overlayCanvasRef = useRef(null);  // Hover-подсветка
  const maskCanvasRef    = useRef(null);  // Маска кисти

  // ── Состояния редактора ──────────────────────────────────────
  const [mode, setMode]               = useState(EDIT_MODES.SELECT);
  const [isDrawing, setIsDrawing]     = useState(false);
  const [brushSize, setBrushSize]     = useState(40);
  const [paths, setPaths]             = useState([]);
  const [currentPath, setCurrentPath] = useState(null);

  // Клик / попап
  const [clickPoint, setClickPoint]         = useState(null);     // {x, y} в px на картинке
  const [popupVisible, setPopupVisible]     = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);     // QUICK_ACTIONS[id]
  const [editPrompt, setEditPrompt]         = useState('');
  const [aiHint, setAiHint]                 = useState('');       // Gemini-подсказка об элементе
  const [isDetecting, setIsDetecting]       = useState(false);    // Gemini запрос идёт
  const [isProcessing, setIsProcessing]     = useState(false);    // Reve Edit запрос идёт

  // Hover-трекинг
  const [hoverPos, setHoverPos] = useState(null);

  // ── Вычисляем размеры картинки ───────────────────────────────
  const getImageRect = useCallback(() => {
    if (!imageRef.current) return null;
    return imageRef.current.getBoundingClientRect();
  }, []);

  // ── Отрисовка hover-кружка на overlay canvas ────────────────
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;
    if (!img) return;

    canvas.width  = img.offsetWidth;
    canvas.height = img.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (mode === EDIT_MODES.SELECT && hoverPos) {
      // Рисуем spotlight-кружок вокруг курсора
      const r = 50;
      const gradient = ctx.createRadialGradient(
        hoverPos.x, hoverPos.y, 0,
        hoverPos.x, hoverPos.y, r,
      );
      gradient.addColorStop(0,   'rgba(99, 179, 255, 0.12)');
      gradient.addColorStop(0.6, 'rgba(99, 179, 255, 0.06)');
      gradient.addColorStop(1,   'rgba(99, 179, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(hoverPos.x, hoverPos.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Контурный обводка
      ctx.strokeStyle = 'rgba(99, 179, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(hoverPos.x, hoverPos.y, r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [hoverPos, mode]);

  // ── Отрисовка маски кисти ────────────────────────────────────
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const img = imageRef.current;
    if (!img) return;
    canvas.width  = img.offsetWidth;
    canvas.height = img.offsetHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    const drawPath = (path) => {
      if (!path?.points?.length) return;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(99, 179, 255, 0.55)';
      ctx.lineWidth   = path.size;
      path.points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
    };

    paths.forEach(drawPath);
    if (currentPath) drawPath(currentPath);
  }, [paths, currentPath]);

  // ── Координаты курсора относительно картинки ─────────────────
  const getCoordsOnImage = (e) => {
    const img = imageRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth  / img.offsetWidth;
    const scaleY = img.naturalHeight / img.offsetHeight;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left),
      y: (clientY - rect.top),
      // Координаты в натуральных пикселях для маски
      nx: (clientX - rect.left) * scaleX,
      ny: (clientY - rect.top)  * scaleY,
    };
  };

  // ── Hover ─────────────────────────────────────────────────────
  const handleMouseMove = (e) => {
    const { x, y } = getCoordsOnImage(e);
    setHoverPos({ x, y });

    if (mode === EDIT_MODES.BRUSH && isDrawing) {
      setCurrentPath(prev => ({
        ...prev,
        points: [...(prev?.points || []), { x, y }],
      }));
    }
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
    if (mode === EDIT_MODES.BRUSH && isDrawing) stopDrawing();
  };

  // ── Клик (SELECT режим) ───────────────────────────────────────
  const handleClick = async (e) => {
    if (mode !== EDIT_MODES.SELECT) return;
    const { x, y } = getCoordsOnImage(e);

    setClickPoint({ x, y });
    setSelectedAction(null);
    setEditPrompt('');
    setAiHint('');
    setPopupVisible(true);

    // Запрашиваем Gemini Vision — что за элемент?
    detectElement(x, y);
  };

  // ── Определение элемента через Gemini ────────────────────────
  const detectElement = async (x, y) => {
    setIsDetecting(true);
    setAiHint('Анализирую элемент...');
    try {
      // Вырезаем 200×200 вокруг клика для анализа
      const img = imageRef.current;
      const cropCanvas = document.createElement('canvas');
      const cropSize = 200;
      cropCanvas.width = cropSize;
      cropCanvas.height = cropSize;
      const ctx = cropCanvas.getContext('2d');

      const scaleX = img.naturalWidth  / img.offsetWidth;
      const scaleY = img.naturalHeight / img.offsetHeight;

      ctx.drawImage(
        img,
        Math.max(0, (x - cropSize / 2) * scaleX), Math.max(0, (y - cropSize / 2) * scaleY),
        cropSize * scaleX, cropSize * scaleY,
        0, 0, cropSize, cropSize,
      );

      const cropBase64 = cropCanvas.toDataURL('image/jpeg', 0.8);

      const resp = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'identify-element',
          imageBase64: cropBase64,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.hint) setAiHint(data.hint);
        else setAiHint('Выберите действие для редактирования');
      } else {
        setAiHint('Нажмите на действие для редактирования');
      }
    } catch {
      setAiHint('Нажмите на действие для редактирования');
    } finally {
      setIsDetecting(false);
    }
  };

  // ── Brush режим ───────────────────────────────────────────────
  const startDrawing = (e) => {
    if (mode !== EDIT_MODES.BRUSH) return;
    e.preventDefault();
    const { x, y } = getCoordsOnImage(e);
    setIsDrawing(true);
    setCurrentPath({ points: [{ x, y }], size: brushSize });
    setPopupVisible(false);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath?.points?.length) {
      setPaths(prev => [...prev, currentPath]);
      setPopupVisible(true);
      setClickPoint(hoverPos);
      setSelectedAction(null);
      setEditPrompt('');
      setAiHint('Нарисовали область — что нужно изменить?');
    }
    setCurrentPath(null);
  };

  // ── Генерация черно-белой маски ───────────────────────────────
  const generateMask = () => {
    const img = imageRef.current;
    if (!img) return null;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width  = img.naturalWidth;
    maskCanvas.height = img.naturalHeight;
    const ctx = maskCanvas.getContext('2d');

    const scaleX = img.naturalWidth  / img.offsetWidth;
    const scaleY = img.naturalHeight / img.offsetHeight;

    // Черный фон
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    if (mode === EDIT_MODES.BRUSH && paths.length) {
      // Рисуем белым пути кисти (в натуральных пикселях)
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#fff';
      paths.forEach(path => {
        ctx.beginPath();
        ctx.lineWidth = path.size * scaleX;
        path.points.forEach((pt, i) =>
          i === 0 ? ctx.moveTo(pt.x * scaleX, pt.y * scaleY) : ctx.lineTo(pt.x * scaleX, pt.y * scaleY)
        );
        ctx.stroke();
      });
    } else if (clickPoint) {
      // Рисуем белый эллипс вокруг клика
      const rX = 120 * scaleX;
      const rY = 80  * scaleY;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(
        clickPoint.x * scaleX, clickPoint.y * scaleY,
        rX, rY, 0, 0, Math.PI * 2,
      );
      ctx.fill();
    }

    return maskCanvas.toDataURL('image/png');
  };

  // ── Отправка редактирования ───────────────────────────────────
  const handleSubmitEdit = async () => {
    if (!editPrompt.trim() && selectedAction?.id !== 'remove') return;

    setIsProcessing(true);
    setPopupVisible(false);

    try {
      const maskBase64 = generateMask();

      // Строим умный промпт на основе действия
      let finalPrompt = editPrompt;
      if (selectedAction?.id === 'remove')      finalPrompt = `Remove this element completely. Fill the area naturally to match the surrounding background.`;
      if (selectedAction?.id === 'color')       finalPrompt = `Change the color of this element: ${editPrompt}`;
      if (selectedAction?.id === 'regenerate')  finalPrompt = editPrompt || `Regenerate this element with better quality, keeping the same style and purpose.`;

      await onEdit(finalPrompt, maskBase64);

      // Сброс после успеха
      setPaths([]);
      setClickPoint(null);
      setSelectedAction(null);
      setEditPrompt('');
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Клавиатурные шорткаты ────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setPopupVisible(false); setClickPoint(null); }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) setPaths(prev => prev.slice(0, -1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Скачать результат ────────────────────────────────────────
  const handleDownload = () => {
    const link = document.createElement('a');
    link.download = `marketplace-card-${Date.now()}.png`;
    link.href = imageUrl;
    link.click();
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <motion.div
      className="sce-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="sce-container">

        {/* ── HEADER ────────────────────────────────────────── */}
        <div className="sce-header">
          <div className="sce-header-left">
            <span className="sce-logo">✦ Умный Редактор</span>
            <span className="sce-subtitle">Кликните на элемент карточки чтобы изменить его</span>
          </div>
          <div className="sce-header-tools">
            {/* Режим */}
            <div className="sce-mode-toggle">
              <button
                className={`sce-mode-btn ${mode === EDIT_MODES.SELECT ? 'active' : ''}`}
                onClick={() => { setMode(EDIT_MODES.SELECT); setPaths([]); }}
                title="Умный выбор — наведи и кликни"
              >
                ◎ Выбор
              </button>
              <button
                className={`sce-mode-btn ${mode === EDIT_MODES.BRUSH ? 'active' : ''}`}
                onClick={() => { setMode(EDIT_MODES.BRUSH); setPopupVisible(false); }}
                title="Кисть — нарисуй область вручную"
              >
                ✒ Кисть
              </button>
            </div>

            {/* Brush size */}
            {mode === EDIT_MODES.BRUSH && (
              <div className="sce-brush-control">
                <span>Размер:</span>
                <input
                  type="range" min="10" max="100" value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                />
                <span className="sce-brush-size-label">{brushSize}px</span>
              </div>
            )}

            {/* Undo */}
            <button
              className="sce-icon-btn"
              onClick={() => setPaths(prev => prev.slice(0, -1))}
              disabled={paths.length === 0}
              title="Отменить (Ctrl+Z)"
            >↩ Отменить</button>

            {/* Download */}
            <button className="sce-icon-btn sce-download-btn" onClick={handleDownload} title="Скачать">
              ⬇ Скачать
            </button>

            {/* Close */}
            <button className="sce-close-btn" onClick={onClose} title="Закрыть">✕</button>
          </div>
        </div>

        {/* ── WORKSPACE ─────────────────────────────────────── */}
        <div className="sce-workspace">
          <div
            className={`sce-image-zone ${mode === EDIT_MODES.BRUSH ? 'brush-cursor' : 'select-cursor'} ${isProcessing ? 'processing' : ''}`}
            ref={containerRef}
          >
            {/* Базовое изображение */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Карточка маркетплейса"
              className="sce-base-image"
              draggable={false}
            />

            {/* Hover-подсветка canvas */}
            <canvas
              ref={overlayCanvasRef}
              className="sce-overlay-canvas"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
            />

            {/* Кисть-маска canvas */}
            <canvas
              ref={maskCanvasRef}
              className="sce-mask-canvas"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onMouseDown={startDrawing}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={(e) => { e.preventDefault(); handleMouseMove(e); }}
              onTouchEnd={stopDrawing}
              style={{ display: mode === EDIT_MODES.BRUSH ? 'block' : 'none' }}
            />

            {/* Spinner при обработке */}
            <AnimatePresence>
              {isProcessing && (
                <motion.div
                  className="sce-processing-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="sce-spinner" />
                  <span>Reve перерисовывает область...</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Маркер клика */}
            {clickPoint && mode === EDIT_MODES.SELECT && !isProcessing && (
              <div
                className="sce-click-marker"
                style={{ left: clickPoint.x, top: clickPoint.y }}
              />
            )}
          </div>

          {/* ── ПЛАВАЮЩИЙ ПОПАП ─────────────────────────────── */}
          <AnimatePresence>
            {popupVisible && clickPoint && !isProcessing && (
              <motion.div
                className="sce-popup"
                style={{
                  left: Math.min(clickPoint.x + 20, (imageRef.current?.offsetWidth || 400) - 320),
                  top:  Math.max(clickPoint.y - 180, 10),
                }}
                initial={{ opacity: 0, scale: 0.85, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25, mass: 0.5 }}
              >
                {/* AI-подсказка */}
                <div className="sce-popup-hint">
                  <span className="sce-hint-dot" />
                  <span>{isDetecting ? '🔍 Анализирую...' : (aiHint || 'Выберите действие')}</span>
                </div>

                {/* Кнопки-действия */}
                {!selectedAction && (
                  <div className="sce-popup-actions">
                    {QUICK_ACTIONS.map(action => (
                      <button
                        key={action.id}
                        className="sce-action-btn"
                        onClick={() => {
                          setSelectedAction(action);
                          if (action.id === 'remove') setEditPrompt('remove');
                        }}
                      >
                        <span className="sce-action-icon">{action.icon}</span>
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Поле ввода после выбора действия */}
                {selectedAction && selectedAction.id !== 'remove' && (
                  <div className="sce-popup-input-area">
                    <div className="sce-action-label">
                      {selectedAction.icon} {selectedAction.label}
                    </div>
                    <textarea
                      className="sce-edit-input"
                      placeholder={selectedAction.placeholder}
                      value={editPrompt}
                      onChange={e => setEditPrompt(e.target.value)}
                      autoFocus
                      rows={2}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitEdit(); } }}
                    />
                    <div className="sce-popup-footer">
                      <button className="sce-back-btn" onClick={() => setSelectedAction(null)}>← Назад</button>
                      <button
                        className="sce-submit-btn"
                        onClick={handleSubmitEdit}
                        disabled={!editPrompt.trim()}
                      >
                        ✨ Применить
                      </button>
                    </div>
                  </div>
                )}

                {/* Подтверждение удаления */}
                {selectedAction?.id === 'remove' && (
                  <div className="sce-popup-input-area">
                    <div className="sce-action-label sce-danger">
                      🗑️ Убрать элемент?
                    </div>
                    <p className="sce-remove-desc">ИИ убёрет этот элемент и естественно заполнит область</p>
                    <div className="sce-popup-footer">
                      <button className="sce-back-btn" onClick={() => setSelectedAction(null)}>← Отмена</button>
                      <button className="sce-submit-btn sce-danger-btn" onClick={handleSubmitEdit}>
                        🗑️ Убрать
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── FOOTER ────────────────────────────────────────── */}
        <div className="sce-footer">
          <span className="sce-footer-tip">
            {mode === EDIT_MODES.SELECT
              ? '💡 Наведи мышку на элемент карточки и кликни, чтобы изменить его'
              : '💡 Закрась нужную область кистью, затем опиши что изменить · Ctrl+Z — отменить'}
          </span>
          <span className="sce-shortcut-hint">Esc — закрыть попап · Ctrl+Z — отменить</span>
        </div>

      </div>
    </motion.div>
  );
}
