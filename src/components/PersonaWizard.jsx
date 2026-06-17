import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Design Tokens ──
const c = {
  bg: '#0a0a0f',
  surface: 'rgba(255,255,255,0.03)',
  surfaceHover: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.08)',
  borderActive: 'rgba(168,85,247,0.4)',
  text1: '#f0f0f5',
  text2: 'rgba(255,255,255,0.6)',
  text3: 'rgba(255,255,255,0.3)',
  violet: '#a855f7',
  violetDim: 'rgba(168,85,247,0.15)',
  green: '#22c55e',
  greenDim: 'rgba(34,197,94,0.15)',
  red: '#f87171',
  amber: '#fbbf24',
  cyan: '#22d3ee',
};

const spring = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };

const ANGLE_SLOTS = [
  { key: 'front', label: 'Фронтальный', emoji: '🎯', desc: 'Лицо прямо в камеру' },
  { key: 'left34', label: 'Левый 3/4', emoji: '↖️', desc: 'Голова повёрнута влево' },
  { key: 'right34', label: 'Правый 3/4', emoji: '↗️', desc: 'Голова повёрнута вправо' },
  { key: 'fullbody', label: 'Во весь рост', emoji: '🧍', desc: 'Стоя, с головы до ног' },
];

// ── Image compression ──
function compressImage(file, maxSize = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Photo Slot Component ──
function PhotoSlot({ slot, photo, variants, activeVariantIdx, onUpload, onGenerate, onVariantChange, onConfirm, isGenerating, hasEnoughForGenerate, isConfirmed }) {
  const inputRef = useRef(null);
  const currentPhoto = variants.length > 0 ? variants[activeVariantIdx] : photo;
  const totalVariants = variants.length;
  const isAI = !photo && variants.length > 0;

  return (
    <div style={{
      flex: '1 1 calc(50% - 8px)', minWidth: 140,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Upload area */}
      <div
        onClick={() => !isGenerating && inputRef.current?.click()}
        style={{
          position: 'relative',
          aspectRatio: slot.key === 'fullbody' ? '3/4' : '1/1',
          borderRadius: 16,
          border: `2px ${currentPhoto ? 'solid' : 'dashed'} ${isConfirmed ? c.green : currentPhoto ? c.borderActive : c.border}`,
          background: currentPhoto ? 'transparent' : c.surface,
          cursor: isGenerating ? 'wait' : 'pointer',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.3s',
        }}
      >
        {currentPhoto ? (
          <img src={currentPhoto} alt={slot.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{slot.emoji}</div>
            <div style={{ fontSize: 12, color: c.text2, fontWeight: 600 }}>{slot.label}</div>
            <div style={{ fontSize: 10, color: c.text3, marginTop: 4 }}>{slot.desc}</div>
          </div>
        )}

        {/* Confirmed checkmark */}
        {isConfirmed && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            width: 28, height: 28, borderRadius: '50%',
            background: c.green, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: '#fff', fontWeight: 800, boxShadow: '0 2px 8px rgba(34,197,94,0.4)',
          }}>✓</div>
        )}

        {/* Variant navigation overlay */}
        {totalVariants > 1 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            padding: '16px 8px 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <button onClick={(e) => { e.stopPropagation(); onVariantChange(-1); }}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ◀
            </button>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>
              {activeVariantIdx + 1} / {totalVariants}
            </span>
            <button onClick={(e) => { e.stopPropagation(); onVariantChange(1); }}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ▶
            </button>
          </div>
        )}

        {/* Loading spinner */}
        {isGenerating && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ color: c.violet, fontSize: 14, fontWeight: 600 }}>Генерация...</div>
          </div>
        )}

        <input ref={inputRef} type="file" accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = ''; }}
        />
      </div>

      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Generate from existing button */}
        {!photo && hasEnoughForGenerate && (
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            style={{
              flex: 1, padding: '8px 8px', borderRadius: 10,
              background: c.violetDim, border: `1px solid ${c.violet}40`,
              color: c.violet, fontSize: 10, fontWeight: 700,
              cursor: isGenerating ? 'wait' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ✨ Сгенерировать
          </button>
        )}

        {/* Confirm button — only for AI-generated slots */}
        {isAI && !isConfirmed && (
          <button
            onClick={(e) => { e.stopPropagation(); onConfirm(); }}
            style={{
              flex: 1, padding: '8px 8px', borderRadius: 10,
              background: c.greenDim, border: `1px solid ${c.green}40`,
              color: c.green, fontSize: 10, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✓ Утвердить
          </button>
        )}
      </div>

      {/* Label */}
      <div style={{ textAlign: 'center', fontSize: 11, color: currentPhoto ? c.text1 : c.text3, fontWeight: 600 }}>
        {slot.label}
        {isAI && (
          <span style={{ color: isConfirmed ? c.green : c.violet, marginLeft: 4, fontSize: 9 }}>
            {isConfirmed ? '✓' : 'AI'}
          </span>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════
//  MAIN COMPONENT: PersonaWizard
// ═══════════════════════════════════════════════════
export default function PersonaWizard({ onClose, onSave, authHeaders, credits }) {
  // Step: 'upload' | 'result'
  const [step, setStep] = useState('upload');

  // Model name — required from the start
  const [modelName, setModelName] = useState('');

  // Photo slots: real uploads
  const [photos, setPhotos] = useState({ front: null, left34: null, right34: null, fullbody: null });

  // Generated variants per slot (for "generate from existing" feature)
  const [slotVariants, setSlotVariants] = useState({ front: [], left34: [], right34: [], fullbody: [] });
  const [activeVariantIdx, setActiveVariantIdx] = useState({ front: 0, left34: 0, right34: 0, fullbody: 0 });
  const [confirmedSlots, setConfirmedSlots] = useState({ front: false, left34: false, right34: false, fullbody: false });
  const [generatingSlot, setGeneratingSlot] = useState(null);

  // Comp card results
  const [compCards, setCompCards] = useState([]); // array of {imageBase64, imageUrl}
  const [activeCompIdx, setActiveCompIdx] = useState(0);
  const [isGeneratingComp, setIsGeneratingComp] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Count uploaded + generated photos
  const filledSlots = ANGLE_SLOTS.filter(s => photos[s.key] || slotVariants[s.key].length > 0);
  const hasEnoughForGenerate = filledSlots.length >= 2;

  // All 4 slots filled (either real photo or confirmed AI)
  const allSlotsFilled = ANGLE_SLOTS.every(s =>
    photos[s.key] || (slotVariants[s.key].length > 0 && confirmedSlots[s.key])
  );

  // Real photos auto-confirm
  const isSlotConfirmed = (key) => !!photos[key] || confirmedSlots[key];

  // ── Upload handler ──
  const handleUpload = useCallback(async (slotKey, file) => {
    const compressed = await compressImage(file);
    setPhotos(p => ({ ...p, [slotKey]: compressed }));
    // Clear any generated variants for this slot
    setSlotVariants(v => ({ ...v, [slotKey]: [] }));
    setActiveVariantIdx(idx => ({ ...idx, [slotKey]: 0 }));
    setConfirmedSlots(cs => ({ ...cs, [slotKey]: false }));
  }, []);

  // ── Confirm AI-generated slot ──
  const handleConfirm = useCallback((slotKey) => {
    setConfirmedSlots(cs => ({ ...cs, [slotKey]: true }));
  }, []);

  // ── Generate missing angle ──
  const handleGenerateMissing = useCallback(async (slotKey) => {
    setGeneratingSlot(slotKey);
    setError('');
    setConfirmedSlots(cs => ({ ...cs, [slotKey]: false })); // un-confirm on re-generate
    try {
      // Collect all existing photos
      const existingPhotos = [];
      for (const s of ANGLE_SLOTS) {
        const src = photos[s.key] || (slotVariants[s.key].length > 0 ? slotVariants[s.key][activeVariantIdx[s.key]] : null);
        if (src && s.key !== slotKey) existingPhotos.push(src);
      }

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          action: 'generate-missing-angle',
          existingPhotos,
          missingAngle: slotKey,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Ошибка генерации');

      // Add to variants
      setSlotVariants(v => {
        const newVariants = [...v[slotKey], json.imageBase64];
        return { ...v, [slotKey]: newVariants };
      });
      setActiveVariantIdx(idx => ({
        ...idx,
        [slotKey]: slotVariants[slotKey].length, // point to the new one
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingSlot(null);
    }
  }, [photos, slotVariants, activeVariantIdx, authHeaders]);

  // ── Navigate variants ──
  const handleVariantChange = useCallback((slotKey, direction) => {
    setActiveVariantIdx(idx => {
      const total = slotVariants[slotKey].length;
      if (total <= 1) return idx;
      const newIdx = (idx[slotKey] + direction + total) % total;
      return { ...idx, [slotKey]: newIdx };
    });
    setConfirmedSlots(cs => ({ ...cs, [slotKey]: false })); // un-confirm when switching
  }, [slotVariants]);

  // ── Generate comp card ──
  const handleCreatePersona = useCallback(async () => {
    if (!modelName.trim()) { setError('Введите имя модели'); return; }
    setIsGeneratingComp(true);
    setError('');
    try {
      // Collect best photo for each slot
      const photoPayload = {};
      for (const s of ANGLE_SLOTS) {
        const src = photos[s.key] || (slotVariants[s.key].length > 0 ? slotVariants[s.key][activeVariantIdx[s.key]] : null);
        if (src) photoPayload[s.key] = src;
      }

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          action: 'create-persona',
          photos: photoPayload,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Ошибка создания персонажа');

      setCompCards(prev => [...prev, { imageBase64: json.imageBase64, imageUrl: json.imageUrl }]);
      setActiveCompIdx(compCards.length); // point to the new one
      setStep('result');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGeneratingComp(false);
    }
  }, [photos, slotVariants, activeVariantIdx, authHeaders, compCards.length, modelName]);

  // ── Regenerate (another variant) ──
  const handleRegenerate = useCallback(async () => {
    setIsGeneratingComp(true);
    setError('');
    try {
      const photoPayload = {};
      for (const s of ANGLE_SLOTS) {
        const src = photos[s.key] || (slotVariants[s.key].length > 0 ? slotVariants[s.key][activeVariantIdx[s.key]] : null);
        if (src) photoPayload[s.key] = src;
      }

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          action: 'create-persona',
          photos: photoPayload,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Ошибка');

      setCompCards(prev => [...prev, { imageBase64: json.imageBase64, imageUrl: json.imageUrl }]);
      setActiveCompIdx(compCards.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGeneratingComp(false);
    }
  }, [photos, slotVariants, activeVariantIdx, authHeaders, compCards.length]);

  // ── Save model ──
  const handleSave = useCallback(async () => {
    if (!modelName.trim()) { setError('Введите имя модели'); return; }
    const current = compCards[activeCompIdx];
    if (!current) return;

    setIsSaving(true);
    setError('');
    try {
      // Collect source photos for storage
      const sourcePhotos = [];
      for (const s of ANGLE_SLOTS) {
        const src = photos[s.key] || (slotVariants[s.key].length > 0 ? slotVariants[s.key][activeVariantIdx[s.key]] : null);
        if (src) sourcePhotos.push(src);
      }

      await onSave({
        name: modelName.trim(),
        type: 'persona',
        compCardBase64: current.imageBase64,
        compCardUrl: current.imageUrl,
        sourcePhotos,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [modelName, compCards, activeCompIdx, photos, slotVariants, activeVariantIdx, onSave, onClose]);

  // ═══ RENDER ═══
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: c.bg,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: c.text1, fontWeight: 800 }}>
            🧑 Создание персонажа
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: c.text3 }}>
            {step === 'upload' ? 'Загрузите фото и сгенерируйте недостающие ракурсы' : 'Карточка персонажа — проверьте и сохраните'}
          </p>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${c.border}`,
          color: c.text2, width: 36, height: 36, borderRadius: 10,
          cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        <AnimatePresence mode="wait">

          {/* ═══ STEP 1: Name + Upload photos ═══ */}
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              transition={spring}
              style={{ maxWidth: 500, margin: '0 auto' }}
            >
              {/* Model name input — FIRST */}
              <input
                type="text"
                placeholder="Имя или псевдоним модели"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                style={{
                  width: '100%', padding: '16px 20px', borderRadius: 16,
                  background: c.surface, border: `1px solid ${modelName.trim() ? c.borderActive : c.border}`,
                  color: c.text1, fontSize: 16, fontWeight: 700,
                  outline: 'none', marginBottom: 16,
                  boxSizing: 'border-box',
                  transition: 'border-color 0.3s',
                }}
              />

              {/* Info banner */}
              <div style={{
                background: c.violetDim, border: `1px solid ${c.violet}30`,
                borderRadius: 14, padding: '14px 18px', marginBottom: 20,
              }}>
                <p style={{ margin: 0, fontSize: 13, color: c.text2, lineHeight: 1.6 }}>
                  📸 Загрузите <strong style={{ color: c.text1 }}>4 фотографии</strong> с разных ракурсов.
                  Если какого-то ракурса нет — нажмите <strong style={{ color: c.violet }}>«Сгенерировать»</strong> и выберите лучший вариант.
                  Нажмите <strong style={{ color: c.green }}>«✓ Утвердить»</strong> когда устроит.
                </p>
              </div>

              {/* Photo grid */}
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 12,
                marginBottom: 20,
              }}>
                {ANGLE_SLOTS.map(slot => (
                  <PhotoSlot
                    key={slot.key}
                    slot={slot}
                    photo={photos[slot.key]}
                    variants={slotVariants[slot.key]}
                    activeVariantIdx={activeVariantIdx[slot.key]}
                    onUpload={(file) => handleUpload(slot.key, file)}
                    onGenerate={() => handleGenerateMissing(slot.key)}
                    onVariantChange={(dir) => handleVariantChange(slot.key, dir)}
                    onConfirm={() => handleConfirm(slot.key)}
                    isGenerating={generatingSlot === slot.key}
                    hasEnoughForGenerate={hasEnoughForGenerate}
                    isConfirmed={isSlotConfirmed(slot.key)}
                  />
                ))}
              </div>

              {/* Progress indicator */}
              <div style={{
                display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16,
              }}>
                {ANGLE_SLOTS.map(s => (
                  <div key={s.key} style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: isSlotConfirmed(s.key) ? c.green
                      : (photos[s.key] || slotVariants[s.key].length > 0) ? c.amber
                      : c.border,
                    transition: 'background 0.3s',
                  }} title={`${s.label}: ${isSlotConfirmed(s.key) ? 'Готов' : 'Нужен'}`} />
                ))}
                <span style={{ fontSize: 11, color: c.text3, marginLeft: 6 }}>
                  {ANGLE_SLOTS.filter(s => isSlotConfirmed(s.key)).length}/4 готово
                </span>
              </div>

              {/* Error */}
              {error && (
                <div style={{ color: c.red, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</div>
              )}

              {/* Create button */}
              <button
                onClick={handleCreatePersona}
                disabled={!allSlotsFilled || isGeneratingComp || !modelName.trim()}
                style={{
                  width: '100%', padding: '16px 24px', borderRadius: 16,
                  background: (allSlotsFilled && modelName.trim())
                    ? 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)'
                    : 'rgba(255,255,255,0.06)',
                  border: 'none',
                  color: (allSlotsFilled && modelName.trim()) ? '#fff' : c.text3,
                  fontSize: 16, fontWeight: 800, cursor: (allSlotsFilled && modelName.trim()) ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {isGeneratingComp ? (
                  <span>⏳ Создаём карточку персонажа...</span>
                ) : !modelName.trim() ? (
                  <span>Введите имя модели</span>
                ) : !allSlotsFilled ? (
                  <span>Заполните все 4 ракурса</span>
                ) : (
                  <span>🧑 Создать карточку персонажа</span>
                )}
                <span style={{
                  position: 'absolute', top: 6, right: 16,
                  fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600,
                }}>
                  1 ГЕНЕРАЦИЯ
                </span>
              </button>
            </motion.div>
          )}

          {/* ═══ STEP 2: Result — Comp Card ═══ */}
          {step === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={spring}
              style={{ maxWidth: 600, margin: '0 auto' }}
            >
              {/* Model name display */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.text1 }}>{modelName}</div>
                <div style={{ fontSize: 12, color: c.text3 }}>Карточка персонажа</div>
              </div>

              {/* Comp card image */}
              <div style={{
                borderRadius: 16, overflow: 'hidden',
                border: `1px solid ${c.border}`,
                marginBottom: 16, position: 'relative',
              }}>
                {compCards[activeCompIdx] && (
                  <img
                    src={compCards[activeCompIdx].imageBase64}
                    alt="Comp Card"
                    style={{ width: '100%', display: 'block' }}
                  />
                )}

                {/* Variant navigation for comp cards */}
                {compCards.length > 1 && (
                  <div style={{
                    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
                    borderRadius: 20, padding: '6px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <button onClick={() => setActiveCompIdx(i => (i - 1 + compCards.length) % compCards.length)}
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>◀</button>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>
                      Вариант {activeCompIdx + 1} / {compCards.length}
                    </span>
                    <button onClick={() => setActiveCompIdx(i => (i + 1) % compCards.length)}
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>▶</button>
                  </div>
                )}

                {/* Loading overlay */}
                {isGeneratingComp && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 12,
                  }}>
                    <div style={{ fontSize: 32 }}>⏳</div>
                    <div style={{ color: c.violet, fontSize: 14, fontWeight: 700 }}>Генерируем новый вариант...</div>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div style={{ color: c.red, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                {/* Save */}
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    flex: 2, padding: '16px 24px', borderRadius: 14,
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    border: 'none',
                    color: '#fff',
                    fontSize: 15, fontWeight: 800,
                    cursor: isSaving ? 'wait' : 'pointer',
                  }}
                >
                  {isSaving ? '⏳ Сохраняем...' : `✅ Сохранить «${modelName}»`}
                </button>

                {/* Retry */}
                <button
                  onClick={handleRegenerate}
                  disabled={isGeneratingComp}
                  style={{
                    flex: 1, padding: '16px 12px', borderRadius: 14,
                    background: c.violetDim, border: `1px solid ${c.violet}30`,
                    color: c.violet, fontSize: 13, fontWeight: 700,
                    cursor: isGeneratingComp ? 'wait' : 'pointer',
                    position: 'relative',
                  }}
                >
                  🔄 Ещё вариант
                  <span style={{ display: 'block', fontSize: 9, color: c.text3, marginTop: 2 }}>1 генерация</span>
                </button>
              </div>

              {/* Back button */}
              <button
                onClick={() => setStep('upload')}
                style={{
                  width: '100%', padding: '12px', marginTop: 10,
                  background: 'transparent', border: `1px solid ${c.border}`,
                  borderRadius: 12, color: c.text3, fontSize: 13,
                  cursor: 'pointer', fontWeight: 600,
                }}
              >
                ← Назад к фотографиям
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}
