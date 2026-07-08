import React, { useState, useCallback, useRef, useMemo } from 'react';
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

const QUICK_PICKS = [
  // 4 Стандартные, но качественные
  { label: '🏃‍♀️ Спортивная девушка', text: 'Athletic fitness model female, toned body, 25 years old, natural sunlight, raw photo, highly detailed skin texture, hyperrealistic, 8k resolution, shot on DSLR, ultra-sharp focus, natural makeup, confident look.' },
  { label: '👱‍♀️ Милая блондинка', text: 'Cute blonde female model, 22 years old, blue eyes, fresh natural face, light freckles, highly detailed skin texture, raw photo, hyperrealistic, bright daylight, commercial fashion photography, 8k resolution.' },
  { label: '👔 Деловой мужчина', text: 'Handsome corporate male model, 35 years old, clean-shaven, sharp features, natural skin texture, raw professional photography, studio softbox lighting, photorealistic, highly detailed, confident expression.' },
  { label: '✨ Plus-size модель', text: 'Gorgeous plus-size female model, curvy body, 28 years old, confident and radiant, natural skin texture, highly detailed, photorealistic raw photo, soft natural lighting, editorial fashion photography, 8k.' },
  
  // 4 Креативные / Нестандартные
  { label: '🦊 Огненно-рыжая', text: 'Stunning redhead female model, 23 years old, face heavily covered in natural cute freckles, messy wavy copper hair, raw unedited photography, highly detailed skin texture, hyperrealistic, pale skin, emerald green eyes, editorial fashion shot, 8k.' },
  { label: '❄️ Девушка-альбинос', text: 'Ethereal albino female model, 22 years old, striking pale features, white eyelashes and eyebrows, platinum white hair, flawless porcelain skin texture, raw photo, hyperrealistic, cold piercing gaze, high fashion editorial lighting, 8k.' },
  { label: '🛹 Неформалка (Гранж)', text: 'Edgy alternative female model, 20 years old, wolf cut hair, subtle face piercings, realistic minimalist neck tattoos, bored Gen-Z expression, raw flash photography style, textured natural skin, hyperrealistic streetwear aesthetic, 35mm film look.' },
  { label: '🐺 Седовласый (45+)', text: 'Handsome mature male model, 48 years old, stylish silver hair and well-groomed grey beard, weathered textured skin with natural wrinkles, piercing blue eyes, raw candid photography, masculine elegance, cinematic lighting, 8k.' },
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

export default function PersonaWizard({ onClose, onSave, getAuthToken, credits, editModel = null, existingModels = [] }) {
  const isEditing = !!editModel;
  const initialCompCards = isEditing
    ? [{ imageBase64: null, imageUrl: editModel.compCardUrl || editModel.fullbodyUrl || editModel.imageUrls?.[0] }]
    : [];

  const [step, setStep] = useState(() => (isEditing ? 'result' : 'describe')); // 'describe' | 'result'
  const [modelName, setModelName] = useState(() => (isEditing ? editModel.name : ''));
  const [description, setDescription] = useState(() => (isEditing ? (editModel.description || editModel.metadata?.description || '') : ''));
  const [refPhotos, setRefPhotos] = useState(() => (isEditing ? (editModel.sourcePhotoUrls || editModel.metadata?.sourcePhotoUrls || []) : []));
  const [compCards, setCompCards] = useState(() => initialCompCards);
  const [activeCompIdx, setActiveCompIdx] = useState(0);
  const [modifierText, setModifierText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [conflictModal, setConflictModal] = useState(null); // null | { name, onOverwrite, onSaveCopy }
  const [dragOver, setDragOver] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const fileInputRef = useRef(null);

  // Live timer during generation
  React.useEffect(() => {
    if (!isGenerating) { setElapsedSec(0); return; }
    const interval = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const canGenerate = modelName.trim().length > 0 && description.trim().length > 10;

  const buildAuthHeaders = useCallback(async () => {
    const token = await getAuthToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAuthToken]);

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

      const headers = await buildAuthHeaders();
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
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
  }, [canGenerate, description, modelName, refPhotos, buildAuthHeaders, compCards.length]);

  // ── Regenerate ──
  const handleRegenerate = useCallback(async () => {
    setIsGenerating(true);
    setError('');
    try {
      const photoPayload = {};
      const keys = ['front', 'left34', 'right34', 'fullbody'];
      refPhotos.forEach((photo, i) => { if (keys[i]) photoPayload[keys[i]] = photo; });

      const headers = await buildAuthHeaders();
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
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
  }, [description, modelName, refPhotos, buildAuthHeaders]);

  // ── Save logic with conflict resolution ──
  const performSave = useCallback(async (saveName, overwrite, modelId) => {
    const current = compCards[activeCompIdx];
    if (!current) return;
    setIsSaving(true);
    setError('');
    try {
      await onSave({
        name: saveName,
        type: 'persona',
        compCardBase64: current.imageBase64,
        compCardUrl: current.imageUrl,
        sourcePhotos: refPhotos,
        description: description.trim(),
        overwrite: overwrite,
        existingModelId: modelId,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [compCards, activeCompIdx, refPhotos, description, onSave, onClose]);

  // ── Apply specific text modification to character card (1 credit) ──
  const handleApplyModification = useCallback(async () => {
    if (!modifierText.trim()) return;
    const current = compCards[activeCompIdx];
    if (!current) return;
    setIsGenerating(true);
    setError('');
    try {
      const headers = await buildAuthHeaders();
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          action: 'edit-card',
          ...(current.imageBase64
            ? { sourceImageBase64: current.imageBase64 }
            : { sourceImageUrl: current.imageUrl }),
          editInstruction: modifierText.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Ошибка редактирования');

      setCompCards(prev => {
        const next = [...prev, { imageBase64: json.imageBase64, imageUrl: json.imageUrl }];
        setActiveCompIdx(next.length - 1);
        return next;
      });
      setModifierText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }, [modifierText, compCards, activeCompIdx, buildAuthHeaders]);

  const handleSave = useCallback(async () => {
    const saveName = modelName.trim();
    if (!saveName) {
      setError('Укажите имя персонажа');
      return;
    }

    // Ищем модель с таким же именем среди существующих (исключая саму редактируемую модель)
    const conflictingModel = existingModels.find(m => {
      const isSelf = isEditing && editModel && m.id === editModel.id;
      return !isSelf && m.name.trim().toLowerCase() === saveName.toLowerCase();
    });

    if (conflictingModel) {
      setConflictModal({
        name: conflictingModel.name,
        onOverwrite: () => {
          performSave(saveName, true, conflictingModel.id);
        },
        onSaveCopy: () => {
          let finalName = saveName;
          let counter = 2;
          const namesList = existingModels.map(m => m.name.toLowerCase());
          while (namesList.includes(finalName.toLowerCase())) {
            finalName = `${saveName} ${counter}`;
            counter++;
          }
          performSave(finalName, false, undefined);
        }
      });
      return;
    }

    // Если имя не изменилось и мы редактируем существующую модель
    if (isEditing && editModel && saveName.toLowerCase() === editModel.name.trim().toLowerCase()) {
      setConflictModal({
        name: editModel.name,
        onOverwrite: () => {
          performSave(saveName, true, editModel.id);
        },
        onSaveCopy: () => {
          let finalName = saveName;
          let counter = 2;
          const namesList = existingModels.map(m => m.name.toLowerCase());
          while (namesList.includes(finalName.toLowerCase())) {
            finalName = `${saveName} ${counter}`;
            counter++;
          }
          performSave(finalName, false, undefined);
        }
      });
      return;
    }

    const overwrite = isEditing;
    const modelId = isEditing && editModel ? editModel.id : undefined;
    await performSave(saveName, overwrite, modelId);
  }, [modelName, existingModels, isEditing, editModel, performSave]);

  const isModified = useMemo(() => {
    if (!isEditing) return true;
    if (!editModel) return false;
    const nameChanged = modelName.trim().toLowerCase() !== editModel.name.trim().toLowerCase();
    const descChanged = description.trim() !== (editModel.description || editModel.metadata?.description || '').trim();
    const currentCard = compCards[activeCompIdx];
    const imageChanged = currentCard && (
      !!currentCard.imageBase64 ||
      currentCard.imageUrl !== (editModel.compCardUrl || editModel.fullbodyUrl || editModel.imageUrls?.[0])
    );
    return nameChanged || descChanged || imageChanged || compCards.length > 1;
  }, [isEditing, editModel, modelName, description, compCards, activeCompIdx]);

  const handleCloseConfirm = () => {
    if (isEditing) {
      const isModified = compCards.length > 1 || modelName !== editModel.name || description !== (editModel.description || editModel.metadata?.description || '');
      if (isModified && !isSaving) {
        if (!window.confirm('Вы действительно хотите закрыть редактор? Несохраненные изменения будут потеряны.')) return;
      }
    }
    onClose();
  };

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
          <h2 style={{ margin: 0, fontSize: 18, color: c.text1, fontWeight: 800 }}>{isEditing ? '🧑‍🎨 Редактировать модель' : '🧑‍🎨 Создать персонажа'}</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: c.text3 }}>
            {step === 'describe' 
              ? (isEditing ? 'Опишите изменения — AI обновит профессиональную карточку' : 'Опишите персонажа — AI создаст профессиональную карточку')
              : (isEditing ? 'Карточка готова — проверьте и обновите' : 'Карточка готова — проверьте и сохраните')}
          </p>
        </div>
        <button onClick={handleCloseConfirm} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${c.border}`, color: c.text2, width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
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
                  <span>⏳ Создаём карточку персонажа... {elapsedSec}с</span>
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
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, position: 'relative', width: '100%', maxWidth: 320, margin: '0 auto 4px' }}>
                  <input
                    type="text"
                    value={modelName}
                    onChange={e => setModelName(e.target.value)}
                    placeholder="Имя (нажмите чтобы изменить)"
                    style={{
                      background: 'rgba(168,85,247,0.05)',
                      border: 'none',
                      borderBottom: `1px dashed ${c.violet}`,
                      color: c.text1,
                      fontSize: 22,
                      fontWeight: 800,
                      textAlign: 'center',
                      width: '100%',
                      outline: 'none',
                      padding: '4px 24px 4px 4px',
                      transition: 'border-color 0.2s, color 0.2s',
                      boxSizing: 'border-box',
                      borderRadius: '8px 8px 0 0',
                    }}
                    onFocus={e => e.target.style.background = 'rgba(168,85,247,0.1)'}
                    onBlur={e => e.target.style.background = 'rgba(168,85,247,0.05)'}
                  />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.8, fontSize: 14 }}>✏️</span>
                </div>
                <div style={{ fontSize: 12, color: c.text3 }}>Карточка персонажа • 5 кадров • 4K</div>
              </div>

              {/* Comp card image */}
              <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${c.border}`, marginBottom: 16, position: 'relative' }}>
                {compCards[activeCompIdx] && (
                  <img src={compCards[activeCompIdx].imageBase64 || compCards[activeCompIdx].imageUrl || ''} alt="Comp Card" style={{ width: '100%', display: 'block' }} />
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

              {/* Text modifier field to edit specific details of the character */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${c.border}`, borderRadius: 14, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.text2, marginBottom: 6 }}>✏️ Внести изменения в модель (убрать бакенбарды, добавить улыбку, белая футболка):</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input 
                    type="text" 
                    placeholder="Что изменить? (напр: сделай волосы темнее)" 
                    value={modifierText} 
                    onChange={e => setModifierText(e.target.value)}
                    disabled={isGenerating || isSaving}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: `1px solid ${modifierText.trim() ? c.borderActive : c.border}`, color: c.text1, fontSize: 13, outline: 'none' }}
                  />
                  <button 
                    onClick={handleApplyModification} 
                    disabled={!modifierText.trim() || isGenerating || isSaving}
                    style={{ padding: '10px 16px', borderRadius: 10, background: modifierText.trim() ? 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)' : 'rgba(255,255,255,0.06)', border: 'none', color: modifierText.trim() ? '#fff' : c.text3, fontSize: 13, fontWeight: 700, cursor: modifierText.trim() && !isGenerating && !isSaving ? 'pointer' : 'not-allowed', position: 'relative' }}
                  >
                    {isGenerating ? '⏳' : 'Применить'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                <button onClick={handleSave} disabled={!isModified || isSaving}
                  style={{ 
                    width: '100%', 
                    padding: '16px 24px', 
                    borderRadius: 14, 
                    background: (isModified && !isSaving) ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'rgba(255,255,255,0.06)', 
                    border: 'none', 
                    color: (isModified && !isSaving) ? '#fff' : c.text3, 
                    fontSize: 15, 
                    fontWeight: 800, 
                    cursor: (isModified && !isSaving) ? 'pointer' : 'not-allowed',
                    boxSizing: 'border-box' 
                  }}
                >
                  {isSaving ? '⏳ Сохраняем...' : '💾 Сохранить'}
                </button>
                {!isEditing && (
                  <button onClick={handleRegenerate} disabled={isGenerating}
                    style={{ width: '100%', padding: '14px 12px', borderRadius: 14, background: c.violetDim, border: `1px solid ${c.violet}30`, color: c.violet, fontSize: 13, fontWeight: 700, cursor: isGenerating ? 'wait' : 'pointer', position: 'relative', boxSizing: 'border-box' }}>
                    🔄 Ещё вариант
                    <span style={{ display: 'block', fontSize: 9, color: c.text3, marginTop: 2 }}>1 генерация</span>
                  </button>
                )}
              </div>

              {!isEditing && (
                <button onClick={() => setStep('describe')}
                  style={{ width: '100%', padding: '12px', marginTop: 10, background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 12, color: c.text3, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  ← Изменить описание
                </button>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ═══ CONFLICT RESOLUTION MODAL ═══ */}
      <AnimatePresence>
        {conflictModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(3,3,5,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 20
          }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.5 }}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 24,
                padding: 30,
                maxWidth: 400,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: 20, fontWeight: 800, color: '#fff', textAlign: 'center' }}>
                Персонаж уже существует
              </h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 24px 0', textAlign: 'center', lineHeight: 1.5 }}>
                Персонаж с именем <strong>«{conflictModal.name}»</strong> уже есть в вашей библиотеке. Хотите обновить его или сохранить как копию?
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                <button 
                  onClick={() => {
                    const cb = conflictModal.onOverwrite;
                    setConflictModal(null);
                    cb();
                  }}
                  style={{
                    width: '100%', 
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', 
                    color: '#fff', 
                    border: 'none', 
                    padding: '14px', 
                    borderRadius: 12, 
                    fontSize: 14, 
                    fontWeight: 800, 
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(34,197,94,0.2)'
                  }}
                >
                  🔄 Заменить существующий
                </button>
                <button 
                  onClick={() => {
                    const cb = conflictModal.onSaveCopy;
                    setConflictModal(null);
                    cb();
                  }}
                  style={{
                    width: '100%', 
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
                    color: '#fff', 
                    border: 'none', 
                    padding: '14px', 
                    borderRadius: 12, 
                    fontSize: 14, 
                    fontWeight: 800, 
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(59,130,246,0.2)'
                  }}
                >
                  ✨ Сохранить как копию
                </button>
                <button 
                  onClick={() => setConflictModal(null)}
                  style={{
                    width: '100%', 
                    background: 'rgba(255,255,255,0.05)', 
                    color: '#fff', 
                    border: '1px solid rgba(255,255,255,0.15)', 
                    padding: '12px', 
                    borderRadius: 12, 
                    fontSize: 14, 
                    fontWeight: 600, 
                    cursor: 'pointer',
                    marginTop: 6
                  }}
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
