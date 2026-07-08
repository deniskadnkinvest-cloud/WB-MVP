import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './SmartCardEditor.css';
import TerminalOfMagic from './TerminalOfMagic';

// ═══════════════════════════════════════════════════════════════
//  SmartCardEditor v3 — Редактор с панелью слоёв
//  Gemini Vision определяет все элементы + bounding boxes.
//  Справа — панель слоёв. Hover/Click → подсветка + редактирование.
// ═══════════════════════════════════════════════════════════════

const EDIT_MODES = {
  SELECT: 'select',
  BRUSH:  'brush',
};

// Иконка слоя по имени элемента
const getLayerIcon = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('заголов') || n.includes('headline')) return '🔤';
  if (n.includes('подзагол') || n.includes('subtitle') || n.includes('текст')) return '📝';
  if (n.includes('бейдж') || n.includes('badge') || n.includes('pill') || n.includes('характеристик')) return '🏷️';
  if (n.includes('фото') || n.includes('товар') || n.includes('product') || n.includes('изображ')) return '📦';
  if (n.includes('фон') || n.includes('background')) return '🖼️';
  if (n.includes('иконк') || n.includes('icon')) return '⭐';
  if (n.includes('тень') || n.includes('shadow') || n.includes('декор') || n.includes('эффект')) return '🎨';
  if (n.includes('цена') || n.includes('price')) return '💰';
  return '◆';
};

const QUICK_ACTIONS = [
  { id: 'text',       icon: '✏️', label: 'Изменить текст',   placeholder: 'Напишите новый текст...' },
  { id: 'color',      icon: '🎨', label: 'Изменить цвет',    placeholder: 'Например: сделай синим...' },
  { id: 'regenerate', icon: '🔄', label: 'Перегенерировать', placeholder: 'Опишите как должно выглядеть...' },
  { id: 'remove',     icon: '🗑️', label: 'Убрать элемент',   placeholder: '' },
];

export default function SmartCardEditor({ imageUrl, onClose, onEdit, getAuthToken }) {
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
      console.log('[SmartCardEditor] Starting element scan, image length:', imageUrl.length);
      const token = typeof getAuthToken === 'function' ? await getAuthToken() : null;
      const resp = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
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
        console.log('[SmartCardEditor] Scan response:', data.elements?.length || 0, 'elements');
        if (data.elements?.length) {
          setElements(data.elements);
        } else {
          console.warn('[SmartCardEditor] No elements detected');
          setScanError(true);
        }
      } else {
        const errText = await resp.text().catch(() => 'unknown');
        console.error('[SmartCardEditor] Scan HTTP error:', resp.status, errText.substring(0, 200));
        setScanError(true);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[SmartCardEditor] scan error:', err);
      setScanError(true);
    } finally {
      setIsScanning(false);
    }
  }, [imageUrl, getAuthToken]);
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

          {/* RIGHT: Layers Panel */}
          <div className="sce-layers-panel">
            <div className="sce-layers-header">
              <span className="sce-layers-title">📋 Слои</span>
              <span className="sce-layers-count">
                {isScanning ? '...' : `${elements.length} элементов`}
              </span>
            </div>

            <div className="sce-layers-list">
              {isScanning && (
                <div className="sce-layers-scanning">
                  <div className="sce-mini-spinner" />
                  <span>Сканируем слои...</span>
                </div>
              )}

              {!isScanning && elements.length === 0 && !scanError && (
                <div className="sce-layers-empty">
                  <span>🔍</span>
                  <span>Элементы не найдены</span>
                  <button className="sce-rescan-btn" onClick={scanElements}>Сканировать</button>
                </div>
              )}

              {!isScanning && scanError && (
                <div className="sce-layers-empty">
                  <span>⚠️</span>
                  <span>Ошибка сканирования</span>
                  <button className="sce-rescan-btn" onClick={scanElements}>Повторить</button>
                </div>
              )}

              {elements.map((el, i) => {
                const isSelected = selectedIdx === i;
                const isHovered = hoveredIdx === i;
                return (
                  <div key={i} className="sce-layer-item-wrap">
                    <div
                      className={`sce-layer-item ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
                      onClick={() => handleLayerClick(i)}
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => { if (hoveredIdx === i) setHoveredIdx(null); }}
                    >
                      <span className="sce-layer-icon">{getLayerIcon(el.name)}</span>
                      <span className="sce-layer-name">{el.name}</span>
                      <span className="sce-layer-eye">👁</span>
                    </div>

                    {/* Inline editor for selected layer */}
                    <AnimatePresence>
                      {isSelected && !isProcessing && mode === EDIT_MODES.SELECT && (
                        <motion.div className="sce-layer-editor"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.5 }}>

                          {!selectedAction && (
                            <div className="sce-layer-actions">
                              {QUICK_ACTIONS.map(a => (
                                <button key={a.id} className="sce-layer-action-btn"
                                  onClick={(e) => { e.stopPropagation(); setSelectedAction(a); if (a.id === 'remove') setEditPrompt('remove'); }}>
                                  <span>{a.icon}</span>
                                  <span>{a.label}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {selectedAction && selectedAction.id !== 'remove' && (
                            <div className="sce-layer-edit-form">
                              <div className="sce-layer-edit-label">{selectedAction.icon} {selectedAction.label}</div>
                              <textarea className="sce-edit-input" placeholder={selectedAction.placeholder}
                                value={editPrompt} onChange={e => setEditPrompt(e.target.value)} autoFocus rows={2}
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitEdit(); }}} />
                              <div className="sce-layer-edit-footer">
                                <button className="sce-back-btn" onClick={(e) => { e.stopPropagation(); setSelectedAction(null); }}>← Назад</button>
                                <button className="sce-submit-btn" onClick={(e) => { e.stopPropagation(); handleSubmitEdit(); }}
                                  disabled={!editPrompt.trim()}>✨ Применить</button>
                              </div>
                            </div>
                          )}

                          {selectedAction?.id === 'remove' && (
                            <div className="sce-layer-edit-form">
                              <div className="sce-layer-edit-label sce-danger">🗑️ Убрать «{el.name}»?</div>
                              <p className="sce-remove-desc">ИИ уберёт элемент и заполнит область фоном</p>
                              <div className="sce-layer-edit-footer">
                                <button className="sce-back-btn" onClick={(e) => { e.stopPropagation(); setSelectedAction(null); }}>← Отмена</button>
                                <button className="sce-submit-btn sce-danger-btn" onClick={(e) => { e.stopPropagation(); handleSubmitEdit(); }}>🗑️ Убрать</button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Brush fallback */}
            <div className="sce-layers-footer">
              <div className="sce-layers-tip">
                💡 Не нашли нужный элемент? Переключитесь на кисть ✒ и выделите вручную.
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="sce-footer">
          <span className="sce-footer-tip">
            {mode === EDIT_MODES.SELECT
              ? '💡 Выберите слой справа или наведите мышку на элемент на картинке.'
              : '💡 Закрасьте область кистью, затем опишите что изменить. Ctrl+Z — отменить.'}
          </span>
          <span className="sce-shortcut-hint">Esc — закрыть · Ctrl+Z — отменить</span>
        </div>
      </div>
    </motion.div>
  );
}
