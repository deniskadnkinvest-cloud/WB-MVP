import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const c = {
  bg: '#0a0a0f',
  surface: 'rgba(255,255,255,0.03)',
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
};

const spring = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };

// Quick-pick presets for character description
const QUICK_PICKS = [
  { label: '👩 Молодая женщина', text: 'Young woman, 22-25 years old, slim athletic build, natural beauty, brown eyes, dark hair, high cheekbones' },
  { label: '👨 Мужчина 30+', text: 'Man, 30-35 years old, medium build, strong jawline, dark stubble, confident look, brown eyes' },
  { label: '👧 Девушка-тинейджер', text: 'Young woman, 18-20 years old, petite frame, fresh face, blue eyes, blonde hair, youthful expression' },
  { label: '🧔 Мужчина зрелый', text: 'Man, 40-45 years old, athletic build, salt-and-pepper hair, well-groomed beard, distinguished appearance' },
  { label: '🧖 Азиатская модель', text: 'Young Asian woman, 20-25 years old, slim build, almond eyes, straight black hair, porcelain skin, elegant features' },
  { label: '🦸 Мужчина атлет', text: 'Athletic man, 25-30 years old, muscular build, strong features, close-cropped hair, intense gaze' },
];

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
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function PersonaWizard({ onClose, onSave, authHeaders, credits }) {
  const [step, setStep] = useState('describe'); // 'describe' | 'result'
  const [modelName, setModelName] = useState('');
  const [description, setDescription] = useState('');
  const [refPhotos, setRefPhotos] = useState([]); // optional reference photos (up to 4)
  const [compCards, setCompCards] = useState([]);
  const [activeCompIdx, setActiveCompIdx] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const canGenerate = modelName.trim().length > 0 && description.trim().length > 10;

  // ── Upload reference photos (optional) ──
  const handleRefPhotoUpload = useCallback(async (files) => {
    const newPhotos = [];
    for (const file of Array.from(files).slice(0, 4 - refPhotos.length)) {
      if (file.type.startsWith('image/')) {
        const compressed = await compressImage(file);
        newPhotos.push(compressed);
      }
    }
    setRefPhotos(prev => [...prev, ...newPhotos].slice(0, 4));
  }, [refPhotos.length]);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer?.files?.length) handleRefPhotoUpload(e.dataTransfer.files);
  };

  const removeRefPhoto = (idx) => setRefPhotos(prev => prev.filter((_, i) => i !== idx));

  // ── Generate persona comp card ──
  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setError('');
    try {
      // Build photo payload from optional reference photos
      const photoPayload = {};
      const keys = ['front', 'left34', 'right34', 'fullbody'];
      refPhotos.forEach((photo, i) => { if (keys[i]) photoPayload[keys[i]] = photo; });

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          action: 'create-persona',
          photos: photoPayload,
          personaDescription: description.trim(),
          modelName: modelName.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Ошибка генерации персонажа');

      setCompCards(prev => [...prev, { imageBase64: json.imageBase64, imageUrl: json.imageUrl }]);
      setActiveCompIdx(prev => compCards.length);
      setStep('result');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, description, modelName, refPhotos, authHeaders, compCards.length]);

  // ── Regenerate ──
  const handleRegenerate = useCallback(async () => {
    setIsGenerating(true);
    setError('');
    try {
      const photoPayload = {};
      const keys = ['front', 'left34', 'right34', 'fullbody'];
      refPhotos.forEach((photo, i) => { if (keys[i]) photoPayload[keys[i]] = photo; });

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          action: 'create-persona',
          photos: photoPayload,
          personaDescription: description.trim(),
          modelName: modelName.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Ошибка');

      setCompCards(prev => { const next = [...prev, { imageBase64: json.imageBase64, imageUrl: json.imageUrl }]; setActiveCompIdx(next.length - 1); return next; });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }, [description, modelName, refPhotos, authHeaders]);

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!modelName.trim()) return;
    const current = compCards[activeCompIdx];
    if (!current) return;
    setIsSaving(true);
    setError('');
    try {
      await onSave({
        name: modelName.trim(),
        type: 'persona',
        compCardBase64: current.imageBase64,
        compCardUrl: current.imageUrl,
        sourcePhotos: refPhotos,
        description: description.trim(),
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [modelName, compCards, activeCompIdx, refPhotos, description, onSave, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 999, background: c.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: c.text1, fontWeight: 800 }}>🧑‍🎨 Создать персонажа</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: c.text3 }}>
            {step === 'describe' ? 'Опишите персонажа — AI создаст профессиональную карточку' : 'Карточка готова — проверьте и сохраните'}
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${c.border}`, color: c.text2, width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        <AnimatePresence mode="wait">

          {/* ═══ STEP 1: Describe ═══ */}
          {step === 'describe' && (
            <motion.div key="describe" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={spring}
              style={{ maxWidth: 540, margin: '0 auto' }}>

              {/* Name */}
              <input
                type="text"
                placeholder="Имя персонажа (напр. Александра, Марк)"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                style={{ width: '100%', padding: '14px 18px', borderRadius: 14, background: c.surface, border: `1px solid ${modelName.trim() ? c.borderActive : c.border}`, color: c.text1, fontSize: 15, fontWeight: 700, outline: 'none', marginBottom: 16, boxSizing: 'border-box', transition: 'border-color 0.3s' }}
              />

              {/* Description — MAIN FIELD */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: c.text2, fontWeight: 700, marginBottom: 8 }}>
                  ✍️ Опишите персонажа <span style={{ color: c.red, fontSize: 11 }}>*обязательно</span>
                </div>
                <textarea
                  placeholder="Например: Молодая женщина, 24 года, стройная, тёмные волосы до плеч, карие глаза, высокие скулы, европейские черты лица, уверенный взгляд..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  style={{ width: '100%', padding: '14px 18px', borderRadius: 14, background: c.surface, border: `1px solid ${description.trim().length > 10 ? c.borderActive : c.border}`, color: c.text1, fontSize: 14, lineHeight: 1.6, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.3s' }}
                />
                <div style={{ fontSize: 11, color: c.text3, marginTop: 4 }}>
                  {description.length} символов — чем подробнее, тем лучше результат
                </div>
              </div>

              {/* Quick picks */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: c.text3, marginBottom: 8 }}>⚡ Быстрый выбор:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {QUICK_PICKS.map(qp => (
                    <button key={qp.label} onClick={() => setDescription(qp.text)}
                      style={{ padding: '6px 12px', borderRadius: 20, background: description === qp.text ? c.violetDim : 'rgba(255,255,255,0.04)', border: `1px solid ${description === qp.text ? c.violet : c.border}`, color: description === qp.text ? c.violet : c.text2, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s', fontWeight: 600 }}>
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional reference photos */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: c.text2, fontWeight: 700, marginBottom: 8 }}>
                  📸 Референс-фото <span style={{ color: c.text3, fontSize: 11, fontWeight: 400 }}>— необязательно (если есть реальный человек)</span>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                  onClick={() => refPhotos.length < 4 && fileInputRef.current?.click()}
                  style={{ border: `2px dashed ${dragOver ? c.violet : c.border}`, borderRadius: 14, padding: '16px', background: dragOver ? c.violetDim : 'rgba(255,255,255,0.02)', cursor: refPhotos.length < 4 ? 'pointer' : 'default', transition: 'all 0.2s', textAlign: 'center', marginBottom: refPhotos.length > 0 ? 10 : 0 }}>
                  {refPhotos.length === 0 ? (
                    <>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                      <div style={{ fontSize: 13, color: c.text2, fontWeight: 600 }}>Перетащите фото сюда или нажмите</div>
                      <div style={{ fontSize: 11, color: c.text3, marginTop: 4 }}>До 4 фото — AI использует их как референс при генерации</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: c.text3 }}>
                      {refPhotos.length < 4 ? `+ Добавить ещё (${refPhotos.length}/4)` : `✅ Максимум ${refPhotos.length}/4 фото`}
                    </div>
                  )}
                </div>

                {/* Uploaded photos */}
                {refPhotos.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {refPhotos.map((photo, idx) => (
                      <div key={idx} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: `1px solid ${c.border}` }}>
                        <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => removeRefPhoto(idx)}
                          style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: '50%', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files?.length) handleRefPhotoUpload(e.target.files); e.target.value = ''; }} />
              </div>

              {error && <div style={{ color: c.red, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</div>}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating}
                style={{ width: '100%', padding: '16px 24px', borderRadius: 16, background: canGenerate ? 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)' : 'rgba(255,255,255,0.06)', border: 'none', color: canGenerate ? '#fff' : c.text3, fontSize: 16, fontWeight: 800, cursor: canGenerate && !isGenerating ? 'pointer' : 'not-allowed', transition: 'all 0.3s', position: 'relative' }}
              >
                {isGenerating ? (
                  <span>⏳ Создаём карточку персонажа... (~30 сек)</span>
                ) : !modelName.trim() ? (
                  <span>Введите имя персонажа</span>
                ) : description.trim().length <= 10 ? (
                  <span>Опишите персонажа подробнее</span>
                ) : (
                  <span>🧑‍🎨 Создать карточку персонажа</span>
                )}
                <span style={{ position: 'absolute', top: 6, right: 16, fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>1 ГЕНЕРАЦИЯ</span>
              </button>
            </motion.div>
          )}

          {/* ═══ STEP 2: Result ═══ */}
          {step === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={spring}
              style={{ maxWidth: 600, margin: '0 auto' }}>

              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.text1 }}>{modelName}</div>
                <div style={{ fontSize: 12, color: c.text3 }}>Карточка персонажа • 5 кадров • 4K</div>
              </div>

              {/* Comp card image */}
              <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${c.border}`, marginBottom: 16, position: 'relative' }}>
                {compCards[activeCompIdx] && (
                  <img src={compCards[activeCompIdx].imageBase64} alt="Comp Card" style={{ width: '100%', display: 'block' }} />
                )}
                {compCards.length > 1 && (
                  <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', borderRadius: 20, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => setActiveCompIdx(i => (i - 1 + compCards.length) % compCards.length)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>◀</button>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>Вариант {activeCompIdx + 1} / {compCards.length}</span>
                    <button onClick={() => setActiveCompIdx(i => (i + 1) % compCards.length)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>▶</button>
                  </div>
                )}
                {isGenerating && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 32 }}>⏳</div>
                    <div style={{ color: c.violet, fontSize: 14, fontWeight: 700 }}>Генерируем новый вариант...</div>
                  </div>
                )}
              </div>

              {error && <div style={{ color: c.red, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleSave} disabled={isSaving}
                  style={{ flex: 2, padding: '16px 24px', borderRadius: 14, background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: isSaving ? 'wait' : 'pointer' }}>
                  {isSaving ? '⏳ Сохраняем...' : `✅ Сохранить «${modelName}»`}
                </button>
                <button onClick={handleRegenerate} disabled={isGenerating}
                  style={{ flex: 1, padding: '16px 12px', borderRadius: 14, background: c.violetDim, border: `1px solid ${c.violet}30`, color: c.violet, fontSize: 13, fontWeight: 700, cursor: isGenerating ? 'wait' : 'pointer', position: 'relative' }}>
                  🔄 Ещё вариант
                  <span style={{ display: 'block', fontSize: 9, color: c.text3, marginTop: 2 }}>1 генерация</span>
                </button>
              </div>

              <button onClick={() => setStep('describe')}
                style={{ width: '100%', padding: '12px', marginTop: 10, background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text3, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                ← Изменить описание
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}
