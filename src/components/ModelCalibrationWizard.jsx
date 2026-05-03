import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ModelCalibrationWizard.css';

/**
 * ModelCalibrationWizard — пошаговый визард калибровки ИИ-модели.
 * 
 * Генерирует 3 референсных фото (анфас, 3/4 слева, 3/4 справа)
 * для максимально консистентного результата при фотосессиях.
 *
 * Flow:
 *  1. Intro → пользователь соглашается
 *  2. Step FRONT → генерация анфас, фиксация лица
 *  3. Step LEFT34 → генерация 3/4 слева (batch 5), выбор лучшего
 *  4. Step RIGHT34 → генерация 3/4 справа (batch 5), выбор лучшего
 *  5. Review → финальный просмотр 3 фото + имя модели → сохранение
 */

const STEPS = [
  { id: 'intro', label: 'Начало' },
  { id: 'front', label: 'Анфас', icon: '👤', angle: 'front', posePrompt: 'standing straight, facing the camera DIRECTLY with BOTH eyes equally visible, looking STRAIGHT into the lens, symmetrical front-facing portrait, neutral expression', cameraPrompt: 'close-up portrait, head and shoulders, camera DIRECTLY in front of the face, perfectly centered symmetrical framing' },
  { id: 'left34', label: '3/4 слева', icon: '◀️', angle: 'left34', posePrompt: 'CRITICAL DIRECTION: The model\'s face and body are rotated so the LEFT CHEEK is more visible to the camera. The nose tip points toward the LEFT edge of the image. The RIGHT ear should be partially hidden. The LEFT ear is fully visible. This is a classic 3/4 view showing the LEFT side of the face. Chin slightly up, elegant posing', cameraPrompt: 'portrait shot, camera is positioned to the RIGHT of the model (shooting from the model\'s right), capturing the model\'s LEFT facial profile at exactly 3/4 angle (~45 degrees). Head and shoulders framing' },
  { id: 'right34', label: '3/4 справа', icon: '▶️', angle: 'right34', posePrompt: 'CRITICAL DIRECTION: The model\'s face and body are rotated so the RIGHT CHEEK is more visible to the camera. The nose tip points toward the RIGHT edge of the image. The LEFT ear should be partially hidden. The RIGHT ear is fully visible. This is a classic 3/4 view showing the RIGHT side of the face. Chin slightly up, elegant posing', cameraPrompt: 'portrait shot, camera is positioned to the LEFT of the model (shooting from the model\'s left), capturing the model\'s RIGHT facial profile at exactly 3/4 angle (~45 degrees). Head and shoulders framing' },
  { id: 'review', label: 'Обзор' },
];

const BATCH_SIZE = 3;

export default function ModelCalibrationWizard({
  show,
  onClose,
  onSave,
  modelPrompt,       // текущий промпт модели (из выбранного пресета + детали)
  modelRefImages,     // существующие референсные изображения (если есть)
}) {
  const [step, setStep] = useState(0); // index in STEPS
  const [lockedImages, setLockedImages] = useState({ front: null, left34: null, right34: null });
  const [currentImage, setCurrentImage] = useState(null);
  const [batchImages, setBatchImages] = useState([]);
  const [selectedBatchIdx, setSelectedBatchIdx] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationCount, setGenerationCount] = useState(0);
  const [modelName, setModelName] = useState('');
  const [error, setError] = useState('');

  // Lightbox (long-press fullscreen)
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const longPressTimer = useRef(null);
  const isLongPress = useRef(false);

  // Close confirmation
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const currentStep = STEPS[step];

  // ═══════════════════════════════════════════
  //  GENERATE SINGLE PORTRAIT
  // ═══════════════════════════════════════════
  const generatePortrait = useCallback(async (stepDef, existingRefs = []) => {
    const body = {
      isCalibration: true,
      garmentImagesBase64: [],
      modelPreset: modelPrompt + '. Generate an ultra-realistic fashion model portrait wearing a plain white t-shirt. The portrait MUST have photographic-level skin detail: visible pores, natural skin texture variations, micro-imperfections, authentic asymmetry, and zero AI smoothing or plastic artifacts. Render as if captured by a Canon EOS R5 with an 85mm f/1.4 lens.',
      posePreset: stepDef.posePrompt,
      cameraAngle: stepDef.cameraPrompt,
      backgroundPreset: 'clean soft grey studio background, professional fashion photography lighting with subtle rim light',
      aspectRatio: '1:1',
      modelReferenceImages: existingRefs.length > 0 ? existingRefs : (modelRefImages || []),
    };

    const resp = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Safe parse: Vercel may return HTML on timeout instead of JSON
    let data;
    const rawText = await resp.text();
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error('⚠️ Non-JSON response:', rawText.substring(0, 200));
      if (rawText.includes('FUNCTION_INVOCATION_TIMEOUT') || rawText.includes('An error occurred')) {
        throw new Error('Сервер не успел ответить (таймаут). Попробуйте ещё раз.');
      }
      throw new Error('Сервер вернул некорректный ответ. Попробуйте позже.');
    }

    if (data.success) {
      return `data:image/jpeg;base64,${data.imageBase64}`;
    }
    throw new Error(data.details || data.error || 'Ошибка генерации');
  }, [modelPrompt, modelRefImages]);

  // handleGenerateSingle removed — front now uses batch mode too

  // ═══════════════════════════════════════════
  //  GENERATE BATCH (for LEFT34 / RIGHT34 steps)
  // ═══════════════════════════════════════════
  const handleGenerateBatch = async () => {
    setIsGenerating(true);
    setError('');
    setBatchImages([]);
    setSelectedBatchIdx(null);

    // For left34/right34, use locked front as reference
    const refs = [];
    if (lockedImages.front) refs.push(lockedImages.front);
    if (currentStep.id === 'right34' && lockedImages.left34) refs.push(lockedImages.left34);

    // Also include original model refs
    if (modelRefImages) refs.push(...modelRefImages);

    const results = new Array(BATCH_SIZE).fill(null);

    try {
      // Generate in parallel
      const promises = Array.from({ length: BATCH_SIZE }, async (_, i) => {
        try {
          const img = await generatePortrait(currentStep, refs);
          results[i] = img;
          setBatchImages([...results]);
        } catch (err) {
          results[i] = null;
          throw err; // Re-throw to be caught by Promise.all
        }
      });

      await Promise.all(promises);
      setBatchImages([...results]);
      setGenerationCount(prev => prev + BATCH_SIZE);
    } catch (err) {
      setError(err.message || 'Произошла ошибка при генерации варианта.');
      setBatchImages([]); // Reset so it doesn't show infinite spinners
    } finally {
      setIsGenerating(false);
    }
  };

  // ═══════════════════════════════════════════
  //  LOCK CURRENT IMAGE
  // ═══════════════════════════════════════════

  const handleLockBatch = () => {
    if (selectedBatchIdx === null || !batchImages[selectedBatchIdx]) return;
    const angle = currentStep.id; // 'front', 'left34' or 'right34'
    const newLocked = { ...lockedImages, [angle]: batchImages[selectedBatchIdx] };
    setLockedImages(newLocked);
    setBatchImages([]);
    setSelectedBatchIdx(null);

    // If all 3 angles are now locked (re-gen from review), go back to review
    if (newLocked.front && newLocked.left34 && newLocked.right34) {
      setStep(4); // → review
    } else if (angle === 'front') {
      setStep(2); // → left34
    } else if (angle === 'left34') {
      setStep(3); // → right34
    } else {
      setStep(4); // → review
    }
  };

  // ═══════════════════════════════════════════
  //  SAVE MODEL
  // ═══════════════════════════════════════════
  const handleSave = () => {
    if (!modelName.trim()) {
      setError('Введите имя модели');
      return;
    }
    if (!lockedImages.front) {
      setError('Необходимо зафиксировать фото анфас');
      return;
    }

    const photos = {
      front: lockedImages.front,
      left34: lockedImages.left34,
      right34: lockedImages.right34,
    };

    onSave(modelName.trim(), photos, modelPrompt);
  };

  // ═══════════════════════════════════════════
  //  RESET
  // ═══════════════════════════════════════════
  const handleClose = () => {
    setStep(0);
    setLockedImages({ front: null, left34: null, right34: null });
    setCurrentImage(null);
    setBatchImages([]);
    setSelectedBatchIdx(null);
    setGenerationCount(0);
    setModelName('');
    setError('');
    setShowCloseConfirm(false);
    setLightboxSrc(null);
    onClose();
  };

  // Close with confirmation (only when progress exists)
  const handleAttemptClose = () => {
    if (step === 0) {
      handleClose(); // No progress yet, close immediately
    } else {
      setShowCloseConfirm(true);
    }
  };

  // ═══════════════════════════════════════════
  //  LONG PRESS → LIGHTBOX
  // ═══════════════════════════════════════════
  const handlePointerDown = (imgSrc) => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setLightboxSrc(imgSrc);
    }, 400);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleBatchClick = (img, i) => {
    if (isLongPress.current) {
      isLongPress.current = false;
      return; // Don't select — it was a long press
    }
    if (img) setSelectedBatchIdx(i);
  };

  if (!show) return null;

  return (
    <motion.div
      className="calib-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="calib-modal"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* ═══ PROGRESS BAR ═══ */}
        <div className="calib-progress">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`calib-progress-step ${i <= step ? 'active' : ''} ${i === step ? 'current' : ''}`}>
              <div className="calib-progress-dot" />
              <span className="calib-progress-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ═══ STEP: INTRO ═══ */}
        {currentStep.id === 'intro' && (
          <div className="calib-step">
            <div className="calib-step-icon">🎯</div>
            <h2 className="calib-title">Калибровка модели</h2>
            <p className="calib-desc">
              Для <strong>максимально реалистичной фотосессии</strong> нам нужно зафиксировать внешность модели с трёх ракурсов:
            </p>
            <div className="calib-angles-preview">
              <div className="calib-angle-card">
                <span className="calib-angle-icon">👤</span>
                <span>Анфас</span>
              </div>
              <div className="calib-angle-card">
                <span className="calib-angle-icon">◀️</span>
                <span>3/4 слева</span>
              </div>
              <div className="calib-angle-card">
                <span className="calib-angle-icon">▶️</span>
                <span>3/4 справа</span>
              </div>
            </div>
            <p className="calib-hint">
              Это займёт ~2-3 минуты, но в результате все фотографии будут показывать <strong>одного и того же человека</strong>.
            </p>
            <div className="calib-actions">
              <button className="calib-btn-secondary" onClick={handleClose}>Отмена</button>
              <button className="calib-btn-primary" onClick={() => setStep(1)}>
                🚀 Начать калибровку
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP: FRONT (batch mode, same as left34/right34) ═══ */}
        {currentStep.id === 'front' && (
          <div className="calib-step">
            <h2 className="calib-title">
              <span className="calib-step-badge">1/3</span>
              👤 Анфас — фиксируем лицо
            </h2>
            <p className="calib-desc">
              Сгенерируем {BATCH_SIZE} вариантов анфас. Выберите тот, который вас <strong>устраивает больше всего</strong>.
            </p>

            {/* Batch images */}
            <div className="calib-image-area">
              {isGenerating && batchImages.filter(Boolean).length === 0 && (
                <div className="calib-generating">
                  <div className="processing-spinner" />
                  <p>Генерируем {BATCH_SIZE} вариантов анфас...</p>
                </div>
              )}
              {batchImages.length > 0 && (
                <div className="calib-batch-grid">
                  {batchImages.map((img, i) => (
                    <div
                      key={i}
                      className={`calib-batch-item ${selectedBatchIdx === i ? 'selected' : ''} ${!img ? 'loading' : ''}`}
                      onClick={() => handleBatchClick(img, i)}
                      onPointerDown={() => img && handlePointerDown(img)}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      onContextMenu={e => e.preventDefault()}
                    >
                      {img ? (
                        <>
                          <img src={img} alt={`Вариант ${i + 1}`} draggable={false} />
                          <span className="calib-batch-num">{i + 1}</span>
                          {selectedBatchIdx === i && <div className="calib-batch-check">✅</div>}
                        </>
                      ) : (
                        <div className="calib-batch-loading">
                          <div className="processing-spinner" style={{ width: 20, height: 20 }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!isGenerating && batchImages.length === 0 && (
                <div className="calib-placeholder">
                  <span>👤</span>
                  <p>Нажмите «Сгенерировать {BATCH_SIZE} вариантов»</p>
                </div>
              )}
            </div>
            {batchImages.filter(Boolean).length > 0 && (
              <p className="calib-longpress-hint">💡 Зажмите фото для просмотра во весь экран</p>
            )}

            <div className="calib-actions">
              <button
                className="calib-btn-secondary"
                onClick={handleGenerateBatch}
                disabled={isGenerating}
              >
                {batchImages.length > 0 ? `🔄 Перегенерировать ${BATCH_SIZE}` : `✨ Сгенерировать ${BATCH_SIZE} вариантов`}
              </button>

              {selectedBatchIdx !== null && batchImages[selectedBatchIdx] && (
                <button className="calib-btn-primary" onClick={handleLockBatch}>
                  ✅ Фиксируем лицо (вариант {selectedBatchIdx + 1})
                </button>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP: LEFT34 / RIGHT34 (batch mode) ═══ */}
        {(currentStep.id === 'left34' || currentStep.id === 'right34') && !isNaN(step) && (
          <div className="calib-step">
            <h2 className="calib-title">
              <span className="calib-step-badge">{currentStep.id === 'left34' ? '2/3' : '3/3'}</span>
              {currentStep.icon} {currentStep.label}
            </h2>
            <p className="calib-desc">
              Сгенерируем {BATCH_SIZE} вариантов. Выберите тот, который <strong>максимально похож</strong> на зафиксированное лицо.
            </p>

            {/* Locked front reference */}
            <div className="calib-ref-strip">
              <div className="calib-ref-item">
                <img src={lockedImages.front} alt="Зафиксированный анфас" />
                <span>Анфас ✅</span>
              </div>
              {currentStep.id === 'right34' && lockedImages.left34 && (
                <div className="calib-ref-item">
                  <img src={lockedImages.left34} alt="3/4 слева" />
                  <span>3/4 слева ✅</span>
                </div>
              )}
            </div>

            {/* Batch images */}
            <div className="calib-image-area">
              {isGenerating && batchImages.filter(Boolean).length === 0 && (
                <div className="calib-generating">
                  <div className="processing-spinner" />
                  <p>Генерируем {BATCH_SIZE} вариантов {currentStep.label}...</p>
                </div>
              )}
              {batchImages.length > 0 && (
                <div className="calib-batch-grid">
                  {batchImages.map((img, i) => (
                    <div
                      key={i}
                      className={`calib-batch-item ${selectedBatchIdx === i ? 'selected' : ''} ${!img ? 'loading' : ''}`}
                      onClick={() => handleBatchClick(img, i)}
                      onPointerDown={() => img && handlePointerDown(img)}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      onContextMenu={e => e.preventDefault()}
                    >
                      {img ? (
                        <>
                          <img src={img} alt={`Вариант ${i + 1}`} draggable={false} />
                          <span className="calib-batch-num">{i + 1}</span>
                          {selectedBatchIdx === i && <div className="calib-batch-check">✅</div>}
                        </>
                      ) : (
                        <div className="calib-batch-loading">
                          <div className="processing-spinner" style={{ width: 20, height: 20 }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!isGenerating && batchImages.length === 0 && (
                <div className="calib-placeholder">
                  <span>{currentStep.icon}</span>
                  <p>Нажмите «Сгенерировать {BATCH_SIZE} вариантов»</p>
                </div>
              )}
            </div>
            {batchImages.filter(Boolean).length > 0 && (
              <p className="calib-longpress-hint">💡 Зажмите фото для просмотра во весь экран</p>
            )}

            <div className="calib-actions">
              <button
                className="calib-btn-secondary"
                onClick={handleGenerateBatch}
                disabled={isGenerating}
              >
                {batchImages.length > 0 ? `🔄 Перегенерировать ${BATCH_SIZE}` : `✨ Сгенерировать ${BATCH_SIZE} вариантов`}
              </button>

              {selectedBatchIdx !== null && batchImages[selectedBatchIdx] && (
                <button className="calib-btn-primary" onClick={handleLockBatch}>
                  ✅ Выбрать вариант {selectedBatchIdx + 1}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP: REVIEW ═══ */}
        {currentStep.id === 'review' && (
          <div className="calib-step">
            <h2 className="calib-title">🎉 Калибровка завершена!</h2>
            <p className="calib-desc">
              Нажмите 🔄 на любом кадре, чтобы перегенерировать только его.
            </p>

            <div className="calib-review-grid">
              {['front', 'left34', 'right34'].map(angle => {
                const stepDef = STEPS.find(s => s.id === angle);
                const labels = { front: '👤 Анфас', left34: '◀️ 3/4 слева', right34: '▶️ 3/4 справа' };
                return (
                  <div key={angle} className="calib-review-item">
                    {lockedImages[angle] ? (
                      <div style={{position:'relative'}}>
                        <img src={lockedImages[angle]} alt={angle} />
                        <button
                          className="calib-regen-single"
                          disabled={isGenerating}
                          title="Перегенерировать этот ракурс"
                          onClick={() => {
                            // Jump to that step to regenerate just this angle
                            const stepIdx = STEPS.findIndex(s => s.id === angle);
                            if (stepIdx >= 0) {
                              setBatchImages([]);
                              setSelectedBatchIdx(null);
                              setStep(stepIdx);
                            }
                          }}
                        >🔄</button>
                      </div>
                    ) : (
                      <div className="calib-review-empty">—</div>
                    )}
                    <span>{labels[angle]}</span>
                  </div>
                );
              })}
            </div>

            <input
              className="calib-name-input"
              placeholder="Имя модели (напр. Алина, Дмитрий)"
              value={modelName}
              onChange={e => setModelName(e.target.value)}
            />

            <div className="calib-actions">
              <button className="calib-btn-secondary" onClick={() => { setStep(1); setLockedImages({ front: null, left34: null, right34: null }); }}>
                🔄 Начать заново
              </button>
              <button
                className="calib-btn-primary"
                onClick={handleSave}
                disabled={!modelName.trim() || !lockedImages.front}
              >
                💾 Сохранить модель
              </button>
            </div>
          </div>
        )}

        {/* ═══ ERROR ═══ */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="calib-error"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              ⚠️ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ CLOSE BUTTON ═══ */}
        <button className="calib-close" onClick={handleAttemptClose}>✕</button>

        {/* ═══ CLOSE CONFIRMATION DIALOG ═══ */}
        <AnimatePresence>
          {showCloseConfirm && (
            <motion.div
              className="calib-confirm-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCloseConfirm(false)}
            >
              <motion.div
                className="calib-confirm-dialog"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                onClick={e => e.stopPropagation()}
              >
                <div className="calib-confirm-icon">⚠️</div>
                <h3>Закрыть калибровку?</h3>
                <p>Весь прогресс будет потерян. Вы уверены?</p>
                <div className="calib-confirm-actions">
                  <button className="calib-btn-secondary" onClick={() => setShowCloseConfirm(false)}>Отмена</button>
                  <button className="calib-btn-danger" onClick={handleClose}>Да, закрыть</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══ LIGHTBOX (fullscreen preview) ═══ */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            className="calib-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxSrc(null)}
          >
            <img src={lightboxSrc} alt="Полноэкранный просмотр" />
            <button className="calib-lightbox-close" onClick={() => setLightboxSrc(null)}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
