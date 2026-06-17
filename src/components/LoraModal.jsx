import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SLOTS = [
  { key: 'front',     label: 'Фронт',        icon: '👤', desc: 'Лицо прямо в камеру' },
  { key: 'left34',   label: '3/4 слева',     icon: '◀️', desc: 'Голова повёрнута влево' },
  { key: 'right34',  label: '3/4 справа',    icon: '▶️', desc: 'Голова повёрнута вправо' },
  { key: 'fullbody', label: 'Во весь рост',  icon: '🧍', desc: 'Стоя, с головы до ног' },
];

const spring = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };

export default function LoraModal({
  show, onClose, onSave, onSavePersona,
  loraName, setLoraName, loraPhotos, setLoraPhotos,
  authHeaders,
}) {
  const fileRefs = useRef({});

  // Per-slot AI variants
  const [slotVariants, setSlotVariants] = useState({ front: [], left34: [], right34: [], fullbody: [] });
  const [variantIdx, setVariantIdx] = useState({ front: 0, left34: 0, right34: 0, fullbody: 0 });
  const [generatingSlots, setGeneratingSlots] = useState(new Set()); // parallel generation
  const [genError, setGenError] = useState('');

  // Comp card flow
  const [step, setStep] = useState('upload'); // 'upload' | 'generating' | 'review'
  const [compCards, setCompCards] = useState([]);
  const [activeCompIdx, setActiveCompIdx] = useState(0);
  const [isGeneratingComp, setIsGeneratingComp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Lightbox + drag
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);

  // ── Compress image ──
  const compressImg = (dataUrl) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const maxW = 800;
      const ratio = Math.min(maxW / img.width, maxW / img.height, 1);
      c.width = img.width * ratio; c.height = img.height * ratio;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });

  // ── File upload ──
  const handleFile = useCallback(async (key, file) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const compressed = await compressImg(ev.target.result);
      setLoraPhotos(prev => ({ ...prev, [key]: compressed }));
      setSlotVariants(v => ({ ...v, [key]: [] }));
      setVariantIdx(i => ({ ...i, [key]: 0 }));
    };
    reader.readAsDataURL(file);
  }, [setLoraPhotos]);

  const handleFileInput = (key, e) => {
    if (e.target.files?.[0]) handleFile(key, e.target.files[0]);
    e.target.value = '';
  };

  // ── Drag & Drop ──
  const handleDragOver = (key, e) => { e.preventDefault(); e.stopPropagation(); setDragOverSlot(key); };
  const handleDragLeave = (key, e) => { e.preventDefault(); e.stopPropagation(); if (dragOverSlot === key) setDragOverSlot(null); };
  const handleDrop = (key, e) => {
    e.preventDefault(); e.stopPropagation(); setDragOverSlot(null);
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) handleFile(key, file);
  };

  const removePhoto = (key) => {
    setLoraPhotos(prev => ({ ...prev, [key]: null }));
    setSlotVariants(v => ({ ...v, [key]: [] }));
  };

  const getDisplayPhoto = useCallback((key) => {
    if (loraPhotos[key]) return loraPhotos[key];
    if (slotVariants[key]?.length > 0) return slotVariants[key][variantIdx[key]];
    return null;
  }, [loraPhotos, slotVariants, variantIdx]);

  const filledCount = SLOTS.filter(s => getDisplayPhoto(s.key)).length;
  const hasEnough = filledCount >= 1;

  // ── Generate missing angle (single) ──
  const generateSingle = async (slotKey) => {
    setGeneratingSlots(prev => new Set([...prev, slotKey]));
    setGenError('');
    try {
      const existingPhotos = SLOTS
        .filter(s => s.key !== slotKey)
        .map(s => getDisplayPhoto(s.key))
        .filter(Boolean);

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeaders || {}) },
        body: JSON.stringify({ action: 'generate-missing-angle', existingPhotos, missingAngle: slotKey }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Ошибка генерации');

      setSlotVariants(v => {
        const updated = [...v[slotKey], json.imageBase64];
        setVariantIdx(i => ({ ...i, [slotKey]: updated.length - 1 }));
        return { ...v, [slotKey]: updated };
      });
    } catch (err) {
      setGenError(err.message);
    } finally {
      setGeneratingSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; });
    }
  };

  // ── Generate ALL missing angles in parallel ──
  const generateAllMissing = () => {
    const emptySlots = SLOTS.filter(s => !getDisplayPhoto(s.key)).map(s => s.key);
    emptySlots.forEach(key => generateSingle(key));
  };

  const handleVariantNav = (key, dir) => {
    const total = slotVariants[key].length;
    if (total < 2) return;
    setVariantIdx(i => ({ ...i, [key]: (i[key] + dir + total) % total }));
  };

  // ── Smart crop: if AI generated 3 rows (nearly square), crop to top 2/3 ──
  const smartCropCompCard = (dataUrl) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      // 2-row result is landscape (≥1.4:1), 3-row result is nearly square (~1.0-1.2:1)
      if (ratio >= 1.4) { resolve(dataUrl); return; } // Already correct 2-row layout
      // 3 rows detected — crop to top 2/3 to remove duplicate row
      const cropH = Math.round(img.height * (2 / 3));
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = cropH;
      canvas.getContext('2d').drawImage(img, 0, 0, img.width, cropH, 0, 0, img.width, cropH);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => resolve(dataUrl); // fallback: return as-is
    img.src = dataUrl;
  });

  // ── Generate comp card ──
  const generateCompCard = async () => {
    if (!loraName.trim()) { setSaveError('Введите имя модели'); return; }
    setStep('generating');
    setSaveError('');
    try {
      const photoPayload = {};
      for (const s of SLOTS) {
        const src = getDisplayPhoto(s.key);
        if (src) photoPayload[s.key] = src;
      }
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeaders || {}) },
        body: JSON.stringify({ action: 'create-persona', photos: photoPayload }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Ошибка создания карточки');
      const croppedImage = await smartCropCompCard(json.imageBase64);
      setCompCards(prev => {
        const next = [...prev, croppedImage];
        setActiveCompIdx(next.length - 1);
        return next;
      });
      setStep('review');
    } catch (err) {
      setSaveError(err.message);
      setStep('upload');
    }
  };

  // ── Regenerate comp card ──
  const handleRegenerate = async () => {
    setIsGeneratingComp(true);
    setSaveError('');
    try {
      const photoPayload = {};
      for (const s of SLOTS) {
        const src = getDisplayPhoto(s.key);
        if (src) photoPayload[s.key] = src;
      }
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeaders || {}) },
        body: JSON.stringify({ action: 'create-persona', photos: photoPayload }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Ошибка');
      const croppedImage = await smartCropCompCard(json.imageBase64);
      setCompCards(prev => {
        const next = [...prev, croppedImage];
        setActiveCompIdx(next.length - 1);
        return next;
      });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setIsGeneratingComp(false);
    }
  };

  // ── Download comp card ──
  const handleDownload = () => {
    const src = compCards[activeCompIdx];
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `comp-card-${loraName || 'persona'}-${activeCompIdx + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Save ──
  const handleFinalSave = async () => {
    if (!loraName.trim()) { setSaveError('Введите имя модели'); return; }
    setIsSaving(true);
    setSaveError('');
    try {
      const compCardBase64 = compCards[activeCompIdx];
      const sourcePhotos = SLOTS.map(s => getDisplayPhoto(s.key)).filter(Boolean);

      if (onSavePersona) {
        await onSavePersona({ name: loraName.trim(), compCardBase64, sourcePhotos });
      } else {
        const merged = { ...loraPhotos };
        for (const s of SLOTS) {
          if (!merged[s.key] && slotVariants[s.key].length > 0)
            merged[s.key] = slotVariants[s.key][variantIdx[s.key]];
        }
        setLoraPhotos(merged);
        await onSave();
      }
      onClose();
    } catch (err) {
      setSaveError(err.message || 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  if (!show) return null;

  const emptyCount = SLOTS.filter(s => !getDisplayPhoto(s.key)).length;
  const isAnyGenerating = generatingSlots.size > 0;

  // ══════════════════════════════════════════════
  return (
    <>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={step === 'review' ? undefined : onClose}
        style={{ alignItems: 'flex-start', paddingTop: 20, paddingBottom: 20, overflowY: 'auto' }}
      >
        <motion.div
          className="modal-content"
          initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: 540, width: '92vw', position: 'relative' }}
        >
          <AnimatePresence mode="wait">

            {/* ══ STEP: upload ══ */}
            {step === 'upload' && (
              <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="modal-title">👤 Добавить свою модель</div>
                <p className="modal-hint">
                  Загрузите или перетащите <strong>4 фотографии</strong> с разных ракурсов.<br />
                  <span style={{ opacity: 0.7 }}>Нет ракурса? Нажмите <strong>«Сгенерировать»</strong>. Нажмите на фото для просмотра.</span>
                </p>

                <input
                  className="modal-input"
                  placeholder="Имя модели (напр. Алина, Дмитрий)"
                  value={loraName}
                  onChange={e => setLoraName(e.target.value)}
                />

                {/* 4-slot grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                  {SLOTS.map(({ key, label, icon, desc }) => {
                    const displayPhoto = getDisplayPhoto(key);
                    const isGenerating = generatingSlots.has(key);
                    const variants = slotVariants[key];
                    const isAI = !loraPhotos[key] && variants.length > 0;
                    const isDragOver = dragOverSlot === key;

                    return (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div
                          className={`lora-slot ${displayPhoto ? 'filled' : ''}`}
                          onDragOver={e => handleDragOver(key, e)}
                          onDragLeave={e => handleDragLeave(key, e)}
                          onDrop={e => handleDrop(key, e)}
                          style={{
                            position: 'relative',
                            aspectRatio: key === 'fullbody' ? '3/4' : '1/1',
                            cursor: displayPhoto ? 'zoom-in' : (isGenerating ? 'wait' : 'pointer'),
                            border: isDragOver ? '2px solid #a855f7' : isAI ? '2px solid rgba(168,85,247,0.5)' : undefined,
                            background: isDragOver ? 'rgba(168,85,247,0.1)' : undefined,
                            transition: 'border-color 0.2s, background 0.2s',
                          }}
                          onClick={() => {
                            if (displayPhoto) { setLightboxSrc(displayPhoto); return; }
                            if (!isGenerating) fileRefs.current[key]?.click();
                          }}
                        >
                          <input type="file" accept="image/*"
                            ref={el => fileRefs.current[key] = el}
                            style={{ display: 'none' }}
                            onChange={e => handleFileInput(key, e)}
                          />

                          {displayPhoto ? (
                            <>
                              <img src={displayPhoto} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                              <button className="remove-btn" onClick={e => { e.stopPropagation(); removePhoto(key); }}
                                style={{ position: 'absolute', top: 4, right: 4, zIndex: 2 }}>✕</button>
                              <button onClick={e => { e.stopPropagation(); fileRefs.current[key]?.click(); }}
                                style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', borderRadius: 6, padding: '2px 7px', fontSize: 10, cursor: 'pointer', zIndex: 2 }}>
                                📷 Заменить
                              </button>
                              {isAI && variants.length > 1 && (
                                <div style={{ position: 'absolute', bottom: 4, left: 4, display: 'flex', gap: 4, alignItems: 'center', zIndex: 2 }}>
                                  <button onClick={e => { e.stopPropagation(); handleVariantNav(key, -1); }}
                                    style={{ background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', fontSize: 11 }}>◀</button>
                                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{variantIdx[key] + 1}/{variants.length}</span>
                                  <button onClick={e => { e.stopPropagation(); handleVariantNav(key, 1); }}
                                    style={{ background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', fontSize: 11 }}>▶</button>
                                </div>
                              )}
                              {isAI && <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(168,85,247,0.85)', borderRadius: 4, padding: '1px 6px', fontSize: 9, color: '#fff', fontWeight: 700, zIndex: 2 }}>AI</div>}
                            </>
                          ) : isGenerating ? (
                            <div style={{ textAlign: 'center', padding: 16 }}>
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                style={{ fontSize: 24, marginBottom: 6 }}
                              >⏳</motion.div>
                              <div style={{ fontSize: 11, color: '#a855f7', fontWeight: 700 }}>Генерация...</div>
                            </div>
                          ) : (
                            <>
                              <div className="lora-slot-icon">{icon}</div>
                              <div className="lora-slot-label">{label}</div>
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, textAlign: 'center', padding: '0 4px' }}>{desc}</div>
                              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>или перетащите сюда</div>
                            </>
                          )}
                        </div>

                        {/* Generate button */}
                        {!displayPhoto && !isGenerating && hasEnough && (
                          <button onClick={() => generateSingle(key)}
                            disabled={isAnyGenerating}
                            style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', fontSize: 11, fontWeight: 700, cursor: isAnyGenerating ? 'not-allowed' : 'pointer', opacity: isAnyGenerating ? 0.5 : 1 }}>
                            ✨ Сгенерировать
                          </button>
                        )}

                        {/* Re-generate button */}
                        {isAI && !isGenerating && (
                          <button onClick={() => generateSingle(key)}
                            disabled={isAnyGenerating}
                            style={{ padding: '5px 8px', borderRadius: 8, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#a855f7', fontSize: 10, fontWeight: 600, cursor: isAnyGenerating ? 'not-allowed' : 'pointer', opacity: isAnyGenerating ? 0.5 : 1 }}>
                            🔄 Ещё вариант
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Generate ALL missing button */}
                {emptyCount >= 2 && hasEnough && !isAnyGenerating && (
                  <button
                    onClick={generateAllMissing}
                    style={{
                      width: '100%', marginTop: 12, padding: '10px 16px', borderRadius: 10,
                      background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.1))',
                      border: '1px solid rgba(168,85,247,0.3)',
                      color: '#a855f7', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    ✨ Сгенерировать все пустые ракурсы ({emptyCount} шт.)
                  </button>
                )}

                {/* Progress dots */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 14, alignItems: 'center' }}>
                  {SLOTS.map(s => (
                    <div key={s.key} title={s.label} style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: generatingSlots.has(s.key) ? '#fbbf24'
                        : getDisplayPhoto(s.key) ? (loraPhotos[s.key] ? '#22c55e' : '#a855f7')
                        : 'rgba(255,255,255,0.15)',
                      transition: 'background 0.3s',
                    }} />
                  ))}
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>{filledCount}/4 ракурса</span>
                </div>

                {genError && <div style={{ color: '#f87171', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{genError}</div>}
                {saveError && <div style={{ color: '#f87171', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{saveError}</div>}

                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button className="modal-btn-cancel" onClick={onClose}>Отмена</button>
                  <button
                    className="modal-btn-primary"
                    onClick={generateCompCard}
                    disabled={!loraName.trim() || filledCount < 1 || isAnyGenerating}
                  >
                    Создать карточку персонажа →
                  </button>
                </div>
              </motion.div>
            )}

            {/* ══ STEP: generating comp card ══ */}
            {step === 'generating' && (
              <motion.div key="generating"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 20 }}>🧑‍🎨</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#f0f0f5', marginBottom: 12 }}>
                  Создаётся профессиональная<br />карточка персонажа...
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 24 }}>
                  ИИ анализирует ваши фото и строит<br />comp card из 8 ракурсов.<br />Подождите, обычно 20–40 секунд.
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <motion.div key={i}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }}
                      style={{ width: 10, height: 10, borderRadius: '50%', background: '#a855f7' }}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ══ STEP: review comp card ══ */}
            {step === 'review' && (
              <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="modal-title" style={{ textAlign: 'center' }}>
                  {isSaving ? '⏳ Сохраняем...' : '🔥 Профессиональная карточка персонажа готова!'}
                </div>
                <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
                  Устраивает результат? Сохраните, скачайте или перегенерируйте.
                </p>

                {/* Comp card image */}
                <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 12, cursor: 'zoom-in' }}
                  onClick={() => setLightboxSrc(compCards[activeCompIdx])}>
                  {compCards[activeCompIdx] && (
                    <img src={compCards[activeCompIdx]} alt="Comp Card"
                      style={{ width: '100%', display: 'block', borderRadius: 14 }} />
                  )}

                  {compCards.length > 1 && (
                    <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', borderRadius: 20, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={e => { e.stopPropagation(); setActiveCompIdx(i => (i - 1 + compCards.length) % compCards.length); }}
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }}>◀</button>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>
                        Вариант {activeCompIdx + 1} / {compCards.length}
                      </span>
                      <button onClick={e => { e.stopPropagation(); setActiveCompIdx(i => (i + 1) % compCards.length); }}
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }}>▶</button>
                    </div>
                  )}

                  {isGeneratingComp && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                      <div style={{ fontSize: 28 }}>⏳</div>
                      <div style={{ color: '#a855f7', fontSize: 14, fontWeight: 700 }}>Генерируем новый вариант...</div>
                    </div>
                  )}
                </div>

                <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
                  💡 Все варианты сохраняются в карусели — вы не потеряете ни одну карточку
                </p>

                {saveError && <div style={{ color: '#f87171', fontSize: 12, textAlign: 'center', marginBottom: 8 }}>{saveError}</div>}

                {/* Actions — 3 buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleFinalSave}
                    disabled={isSaving || isGeneratingComp}
                    style={{ flex: 2, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#22c55e,#16a34a)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 800, cursor: isSaving ? 'wait' : 'pointer' }}>
                    {isSaving ? '⏳ Сохраняем...' : `✅ Сохранить «${loraName}»`}
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={isGeneratingComp}
                    style={{ flex: 0, minWidth: 48, padding: '14px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 16, cursor: 'pointer' }}
                    title="Скачать карточку"
                  >
                    💾
                  </button>
                </div>

                <button
                  onClick={handleRegenerate}
                  disabled={isGeneratingComp || isSaving}
                  style={{ width: '100%', marginTop: 8, padding: '12px 10px', borderRadius: 12, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', fontSize: 13, fontWeight: 700, cursor: isGeneratingComp ? 'wait' : 'pointer' }}>
                  🔄 Перегенерировать
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>2 генерации</span>
                </button>

                <button onClick={() => setStep('upload')}
                  style={{ width: '100%', marginTop: 8, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer' }}>
                  ← Вернуться к фотографиям
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLightboxSrc(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20 }}>
            <motion.img
              src={lightboxSrc}
              initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
              transition={spring}
              style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 16, objectFit: 'contain' }}
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxSrc(null)}
              style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
