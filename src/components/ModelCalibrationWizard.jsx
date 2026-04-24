import React, { useState, useCallback } from 'react';
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
  { id: 'front', label: 'Анфас', icon: '👤', angle: 'front', posePrompt: 'standing straight, facing the camera directly, neutral expression, head slightly tilted, fashion model portrait', cameraPrompt: 'close-up portrait, head and shoulders, front-facing' },
  { id: 'left34', label: '3/4 слева', icon: '◀️', angle: 'left34', posePrompt: 'elegant 3/4 view from the left side, face turned slightly to the right, chin slightly up, model posing naturally', cameraPrompt: 'portrait 3/4 view from left, head and shoulders' },
  { id: 'right34', label: '3/4 справа', icon: '▶️', angle: 'right34', posePrompt: 'elegant 3/4 view from the right side, face turned slightly to the left, chin slightly up, model posing naturally', cameraPrompt: 'portrait 3/4 view from right, head and shoulders' },
  { id: 'review', label: 'Обзор' },
];

const BATCH_SIZE = 5;

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

  const currentStep = STEPS[step];

  // ═══════════════════════════════════════════
  //  GENERATE SINGLE PORTRAIT
  // ═══════════════════════════════════════════
  const generatePortrait = useCallback(async (stepDef, existingRefs = []) => {
    const body = {
      garmentImagesBase64: [],
      previewMode: true,
      modelPreset: modelPrompt + '. Generate a fashion model portrait wearing simple casual clothing (plain white t-shirt).',
      posePreset: stepDef.posePrompt,
      cameraAngle: stepDef.cameraPrompt,
      backgroundPreset: 'clean soft grey studio background, professional fashion photography lighting',
      aspectRatio: '1:1',
      modelReferenceImages: existingRefs.length > 0 ? existingRefs : (modelRefImages || []),
    };

    const resp = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (data.success) {
      return `data:image/jpeg;base64,${data.imageBase64}`;
    }
    throw new Error(data.details || data.error || 'Ошибка генерации');
  }, [modelPrompt, modelRefImages]);

  // ═══════════════════════════════════════════
  //  GENERATE SINGLE (for FRONT step)
  // ═══════════════════════════════════════════
  const handleGenerateSingle = async () => {
    setIsGenerating(true);
    setError('');
    setCurrentImage(null);
    try {
      const img = await generatePortrait(currentStep);
      setCurrentImage(img);
      setGenerationCount(prev => prev + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

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
      const promises = Array.from({ length: BATCH_SIZE }, (_, i) =>
        generatePortrait(currentStep, refs)
          .then(img => {
            results[i] = img;
            // Update incrementally
            setBatchImages([...results]);
          })
          .catch(() => {
            results[i] = null;
          })
      );

      await Promise.all(promises);
      setBatchImages([...results]);
      setGenerationCount(prev => prev + BATCH_SIZE);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ═══════════════════════════════════════════
  //  LOCK CURRENT IMAGE
  // ═══════════════════════════════════════════
  const handleLockFront = () => {
    if (!currentImage) return;
    setLockedImages(prev => ({ ...prev, front: currentImage }));
    setCurrentImage(null);
    setStep(2); // → left34
  };

  const handleLockBatch = () => {
    if (selectedBatchIdx === null || !batchImages[selectedBatchIdx]) return;
    const angle = currentStep.id; // 'left34' or 'right34'
    setLockedImages(prev => ({ ...prev, [angle]: batchImages[selectedBatchIdx] }));
    setBatchImages([]);
    setSelectedBatchIdx(null);

    if (angle === 'left34') {
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
    onClose();
  };

  if (!show) return null;

  return (
    <motion.div
      className="calib-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleClose}
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

        {/* ═══ STEP: FRONT ═══ */}
        {currentStep.id === 'front' && (
          <div className="calib-step">
            <h2 className="calib-title">
              <span className="calib-step-badge">1/3</span>
              👤 Анфас — фиксируем лицо
            </h2>
            <p className="calib-desc">
              Сгенерируйте портрет анфас. Если лицо вас устраивает — фиксируйте. Если нет — перегенерируйте.
            </p>

            {/* Current generated image */}
            <div className="calib-image-area">
              {isGenerating && (
                <div className="calib-generating">
                  <div className="processing-spinner" />
                  <p>Генерируем портрет анфас...</p>
                </div>
              )}
              {!isGenerating && currentImage && (
                <motion.div
                  className="calib-portrait-wrap"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <img src={currentImage} alt="Анфас" className="calib-portrait" />
                </motion.div>
              )}
              {!isGenerating && !currentImage && (
                <div className="calib-placeholder">
                  <span>👤</span>
                  <p>Нажмите «Сгенерировать» чтобы увидеть портрет</p>
                </div>
              )}
            </div>

            <div className="calib-actions">
              <button
                className="calib-btn-secondary"
                onClick={handleGenerateSingle}
                disabled={isGenerating}
              >
                {currentImage ? '🔄 Перегенерировать' : '✨ Сгенерировать'}
              </button>

              {currentImage && (
                <button className="calib-btn-primary" onClick={handleLockFront}>
                  ✅ Фиксируем лицо
                </button>
              )}
            </div>

            {generationCount > 0 && (
              <p className="calib-gen-count">Сгенерировано портретов: {generationCount}</p>
            )}
          </div>
        )}

        {/* ═══ STEP: LEFT34 / RIGHT34 (batch mode) ═══ */}
        {(currentStep.id === 'left34' || currentStep.id === 'right34') && (
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
                      onClick={() => img && setSelectedBatchIdx(i)}
                    >
                      {img ? (
                        <>
                          <img src={img} alt={`Вариант ${i + 1}`} />
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
              Вот 3 референсных фото вашей модели. Дайте ей имя и сохраните.
            </p>

            <div className="calib-review-grid">
              {['front', 'left34', 'right34'].map(angle => (
                <div key={angle} className="calib-review-item">
                  {lockedImages[angle] ? (
                    <img src={lockedImages[angle]} alt={angle} />
                  ) : (
                    <div className="calib-review-empty">—</div>
                  )}
                  <span>{angle === 'front' ? '👤 Анфас' : angle === 'left34' ? '◀️ 3/4 слева' : '▶️ 3/4 справа'}</span>
                </div>
              ))}
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
        <button className="calib-close" onClick={handleClose}>✕</button>
      </motion.div>
    </motion.div>
  );
}
