import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TerminalOfMagic from './TerminalOfMagic';

const SLOTS = [
  { key: 'front',     label: 'Фронт',        icon: '👤', desc: 'Лицо прямо в камеру' },
  { key: 'left34',   label: '3/4 слева',     icon: '◀️', desc: 'Голова повёрнута влево' },
  { key: 'right34',  label: '3/4 справа',    icon: '▶️', desc: 'Голова повёрнута вправо' },
  { key: 'fullbody', label: 'Во весь рост',  icon: '🧍', desc: 'Стоя, с головы до ног' },
];

const spring = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };

export default function LoraModal({
  show, onClose, onSave, onUpdate,
  loraName, setLoraName, loraPhotos, setLoraPhotos,
  getAuthToken, editModel, subscription,
}) {
  const isEditMode = !!editModel;
  const fileRefs = useRef({});
  const [slotVariants, setSlotVariants] = useState({ front: [], left34: [], right34: [], fullbody: [] });
  const [variantIdx, setVariantIdx] = useState({ front: 0, left34: 0, right34: 0, fullbody: 0 });
  const [generatingSlots, setGeneratingSlots] = useState(new Set());
  const [genError, setGenError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [editText, setEditText] = useState('');

  // Pre-fill slots from editModel when opening in edit mode
  useEffect(() => {
    if (show && editModel && !initialized) {
      const urls = editModel.imageUrls || [];
      const newPhotos = { front: null, left34: null, right34: null, fullbody: null };
      SLOTS.forEach((slot, i) => {
        if (urls[i]) newPhotos[slot.key] = urls[i];
      });
      setLoraPhotos(newPhotos);
      if (editModel.name) setLoraName(editModel.name);
      setSlotVariants({ front: [], left34: [], right34: [], fullbody: [] });
      setVariantIdx({ front: 0, left34: 0, right34: 0, fullbody: 0 });
      setInitialized(true);
    }
    if (!show) setInitialized(false);
  }, [show, editModel, initialized, setLoraPhotos, setLoraName]);

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

  const buildAuthHeaders = useCallback(async () => {
    const token = await getAuthToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAuthToken]);

  const generateSingle = async (slotKey) => {
    setGeneratingSlots(prev => new Set([...prev, slotKey]));
    setGenError('');
    try {
      const existingPhotos = SLOTS.filter(s => s.key !== slotKey).map(s => getDisplayPhoto(s.key)).filter(Boolean);
      const headers = await buildAuthHeaders();
      if (!headers.Authorization) {
        throw new Error('Для генерации необходимо авторизоваться');
      }
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ action: 'generate-missing-angle', existingPhotos, missingAngle: slotKey }),
      });
      const json = await res.json();
      if (!json.success) {
        if (json.isBillingError) {
          setShowCreditsModal(true);
          return;
        }
        throw new Error(json.error || 'Ошибка генерации');
      }
      setSlotVariants(v => {
        const updated = [...v[slotKey], json.imageBase64];
        setVariantIdx(i => ({ ...i, [slotKey]: updated.length - 1 }));
        return { ...v, [slotKey]: updated };
      });
    } catch (err) { setGenError(err.message); }
    finally { setGeneratingSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; }); }
  };

  const generateAllMissing = () => {
    SLOTS.filter(s => !getDisplayPhoto(s.key)).forEach(s => generateSingle(s.key));
  };

  // Точечная правка слота по текстовой инструкции (action=edit-card). Работает и для
  // AI-сгенерированных, и для загруженных пользователем фото. Результат — новый вариант слота.
  const applyEdit = async (slotKey) => {
    const instruction = editText.trim();
    const currentPhoto = getDisplayPhoto(slotKey);
    if (!instruction || !currentPhoto) return;
    setEditingSlot(null);
    setGeneratingSlots(prev => new Set([...prev, slotKey]));
    setGenError('');
    try {
      const headers = await buildAuthHeaders();
      if (!headers.Authorization) throw new Error('Для генерации необходимо авторизоваться');
      const body = { action: 'edit-card', editInstruction: instruction };
      if (currentPhoto.startsWith('http://') || currentPhoto.startsWith('https://')) body.sourceImageUrl = currentPhoto;
      else body.sourceImageBase64 = currentPhoto;
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        if (json.isBillingError) { setShowCreditsModal(true); return; }
        throw new Error(json.error || 'Не удалось отредактировать изображение');
      }
      const edited = json.imageBase64 || json.imageUrl;
      setSlotVariants(v => {
        const updated = [...v[slotKey], edited];
        setVariantIdx(i => ({ ...i, [slotKey]: updated.length - 1 }));
        return { ...v, [slotKey]: updated };
      });
      setLoraPhotos(prev => ({ ...prev, [slotKey]: null })); // показываем отредактированный вариант
      setEditText('');
    } catch (err) { setGenError(err.message); }
    finally { setGeneratingSlots(prev => { const n = new Set(prev); n.delete(slotKey); return n; }); }
  };

  const handleVariantNav = (key, dir) => {
    const total = slotVariants[key].length;
    if (total < 2) return;
    setVariantIdx(i => ({ ...i, [key]: (i[key] + dir + total) % total }));
  };

  const handleSave = async () => {
    if (!loraName.trim()) { setSaveError('Введите имя модели'); return; }
    if (filledCount < 1) { setSaveError('Загрузите хотя бы 1 фото'); return; }
    setIsSaving(true); setSaveError('');
    try {
      const merged = { ...loraPhotos };
      for (const s of SLOTS) {
        if (!merged[s.key] && slotVariants[s.key].length > 0)
          merged[s.key] = slotVariants[s.key][variantIdx[s.key]];
      }
      setLoraPhotos(merged);
      if (isEditMode && onUpdate) {
        await onUpdate(editModel.id, merged);
      } else {
        await onSave(merged);
      }
      onClose();
    } catch (err) { setSaveError(err.message || 'Ошибка сохранения'); }
    finally { setIsSaving(false); }
  };

  const hasWork = filledCount > 0 || !!loraName.trim();
  const handleCloseAttempt = () => { if (hasWork || generatingSlots.size > 0) setShowCloseConfirm(true); else onClose(); };
  const confirmClose = () => { setShowCloseConfirm(false); onClose(); };

  if (!show) return null;

  const emptyCount = SLOTS.filter(s => !getDisplayPhoto(s.key)).length;
  const isAnyGenerating = generatingSlots.size > 0;

  return (
    <>
      <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={handleCloseAttempt} style={{ alignItems: 'flex-start', paddingTop: 20, paddingBottom: 20, overflowY: 'auto' }}>
        <motion.div className="modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
          onClick={e => e.stopPropagation()} style={{ maxWidth: 540, width: '92vw', position: 'relative' }}>

          <div className="modal-title">{isEditMode ? '✏️ Редактировать модель' : '👤 Добавить свою модель'}</div>
          <p className="modal-hint">
            {isEditMode
              ? <>Замените фото, добавьте недостающие ракурсы или <strong>перегенерируйте</strong> любой слот.</>
              : <>Загрузите или перетащите <strong>до 4 фотографий</strong> с разных ракурсов.<br />
                <span style={{ opacity: 0.7 }}>Нет ракурса? Нажмите <strong>«Сгенерировать»</strong>. Нажмите на фото для просмотра.</span></>}
          </p>

          <input className="modal-input" placeholder="Имя модели (напр. Алина, Дмитрий)"
            value={loraName} onChange={e => setLoraName(e.target.value)} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            {SLOTS.map(({ key, label, icon, desc }) => {
              const displayPhoto = getDisplayPhoto(key);
              const isGenerating = generatingSlots.has(key);
              const variants = slotVariants[key];
              const isAI = !loraPhotos[key] && variants.length > 0;
              const isDragOver = dragOverSlot === key;
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className={`lora-slot ${displayPhoto ? 'filled' : ''}`}
                    onDragOver={e => handleDragOver(key, e)} onDragLeave={e => handleDragLeave(key, e)} onDrop={e => handleDrop(key, e)}
                    style={{ position: 'relative', aspectRatio: key === 'fullbody' ? '3/4' : '1/1', cursor: displayPhoto ? 'zoom-in' : (isGenerating ? 'wait' : 'pointer'), border: isDragOver ? '2px solid #a855f7' : isAI ? '2px solid rgba(168,85,247,0.5)' : undefined, background: isDragOver ? 'rgba(168,85,247,0.1)' : undefined, transition: 'border-color 0.2s, background 0.2s' }}
                    onClick={() => { if (displayPhoto) { setLightboxSrc(displayPhoto); return; } if (!isGenerating) fileRefs.current[key]?.click(); }}>
                    <input type="file" accept="image/*" ref={el => fileRefs.current[key] = el} style={{ display: 'none' }} onChange={e => handleFileInput(key, e)} />
                    {displayPhoto ? (
                      <>
                        <img src={displayPhoto} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                        <button className="remove-btn" onClick={e => { e.stopPropagation(); removePhoto(key); }} style={{ position: 'absolute', top: 4, right: 4, zIndex: 2 }}>✕</button>
                        <button onClick={e => { e.stopPropagation(); fileRefs.current[key]?.click(); }} style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', borderRadius: 6, padding: '2px 7px', fontSize: 10, cursor: 'pointer', zIndex: 2 }}>📷 Заменить</button>
                        {isAI && variants.length > 1 && (
                          <div style={{ position: 'absolute', bottom: 4, left: 4, display: 'flex', gap: 4, alignItems: 'center', zIndex: 2 }}>
                            <button onClick={e => { e.stopPropagation(); handleVariantNav(key, -1); }} style={{ background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', fontSize: 11 }}>◀</button>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{variantIdx[key] + 1}/{variants.length}</span>
                            <button onClick={e => { e.stopPropagation(); handleVariantNav(key, 1); }} style={{ background: 'rgba(0,0,0,0.65)', border: 'none', color: '#fff', width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', fontSize: 11 }}>▶</button>
                          </div>
                        )}
                        {isAI && <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(168,85,247,0.85)', borderRadius: 4, padding: '1px 6px', fontSize: 9, color: '#fff', fontWeight: 700, zIndex: 2 }}>AI</div>}
                      </>
                    ) : isGenerating ? (
                      <TerminalOfMagic isActive={isGenerating} inSlot={true} />
                    ) : (
                      <>
                        <div className="lora-slot-icon">{icon}</div>
                        <div className="lora-slot-label">{label}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, textAlign: 'center', padding: '0 4px' }}>{desc}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>или перетащите сюда</div>
                      </>
                    )}
                  </div>
                  {!displayPhoto && !isGenerating && hasEnough && (
                    <button onClick={() => generateSingle(key)}
                      style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      ✨ Сгенерировать
                    </button>
                  )}
                  {isAI && !isGenerating && (
                    <button onClick={() => generateSingle(key)}
                      style={{ padding: '5px 8px', borderRadius: 8, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#a855f7', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                      🔄 Ещё вариант
                    </button>
                  )}
                  {displayPhoto && !isGenerating && (editingSlot === key ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <input value={editText} onChange={e => setEditText(e.target.value)} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') applyEdit(key); }}
                        placeholder="Что поправить? Напр.: смотреть вправо"
                        style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(168,85,247,0.4)', color: '#fff', fontSize: 11, outline: 'none' }} />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => applyEdit(key)} disabled={!editText.trim()}
                          style={{ flex: 1, padding: '5px', borderRadius: 8, background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7', fontSize: 10, fontWeight: 700, cursor: editText.trim() ? 'pointer' : 'not-allowed', opacity: editText.trim() ? 1 : 0.5 }}>✨ Применить</button>
                        <button onClick={() => { setEditingSlot(null); setEditText(''); }}
                          style={{ padding: '5px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', fontSize: 10, cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingSlot(key); setEditText(''); setGenError(''); }}
                      style={{ padding: '5px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                      ✏️ Поправить
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {isAnyGenerating && (
            <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              ⏳ Идёт генерация... Кредиты уже списаны и <span style={{ color: '#fbbf24' }}>не будут возвращены</span> при отмене
            </div>
          )}

          {emptyCount >= 2 && hasEnough && !isAnyGenerating && (
            <button onClick={generateAllMissing} style={{ width: '100%', marginTop: 12, padding: '10px 16px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.1))', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              ✨ Сгенерировать все пустые ракурсы ({emptyCount} шт.)
            </button>
          )}

          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 14, alignItems: 'center' }}>
            {SLOTS.map(s => (<div key={s.key} title={s.label} style={{ width: 10, height: 10, borderRadius: '50%', background: generatingSlots.has(s.key) ? '#fbbf24' : getDisplayPhoto(s.key) ? (loraPhotos[s.key] ? '#22c55e' : '#a855f7') : 'rgba(255,255,255,0.15)', transition: 'background 0.3s' }} />))}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>{filledCount}/4 ракурса</span>
          </div>

          {genError && <div style={{ color: '#f87171', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{genError}</div>}
          {saveError && <div style={{ color: '#f87171', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{saveError}</div>}

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="modal-btn-cancel" onClick={handleCloseAttempt}>Отмена</button>
            <button className="modal-btn-primary" onClick={handleSave} disabled={!loraName.trim() || filledCount < 1 || isAnyGenerating || isSaving}>
              {isSaving ? '⏳ Сохраняем...' : isEditMode ? '💾 Обновить' : '✅ Сохранить'}
            </button>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {lightboxSrc && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLightboxSrc(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20 }}>
            <motion.img src={lightboxSrc} initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }} transition={spring}
              style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 16, objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
            <button onClick={() => setLightboxSrc(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCloseConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={e => e.stopPropagation()}>
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }} transition={spring}
              style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 28, maxWidth: 360, width: '90vw', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#f0f0f5', marginBottom: 8 }}>Закрыть без сохранения?</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 24 }}>Загруженные фотографии и введённое имя будут потеряны.</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowCloseConfirm(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Продолжить</button>
                <button onClick={confirmClose} style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Да, закрыть</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credits Modal */}
      <AnimatePresence>
        {showCreditsModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setShowCreditsModal(false)}>
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }} transition={spring}
              onClick={e => e.stopPropagation()}
              style={{ background: 'linear-gradient(145deg, #1a1a2e, #0d0d1a)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: 20, padding: 32, maxWidth: 400, width: '92vw', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f0f0f5', marginBottom: 8 }}>Генерации закончились</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 24 }}>
                Для создания ракурсов нужны генерации.<br/>
                Пополните баланс, чтобы продолжить работу.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {(subscription?.plan === 'pro' 
                  ? [
                      { credits: 50, price: 1790, label: '~35 ₽/генерация' },
                      { credits: 150, price: 4490, label: '~30 ₽/генерация', popular: true },
                      { credits: 350, price: 8990, label: '~25 ₽/генерация' },
                    ]
                  : subscription?.plan === 'base'
                  ? [
                      { credits: 10, price: 390, label: '~39 ₽/генерация' },
                      { credits: 30, price: 1090, label: '~36 ₽/генерация', popular: true },
                      { credits: 100, price: 3490, label: '~35 ₽/генерация' },
                    ]
                  : [
                      { credits: 5, price: 249, label: '~50 ₽/генерация' },
                      { credits: 10, price: 449, label: '~45 ₽/генерация', popular: true },
                      { credits: 25, price: 990, label: '~40 ₽/генерация' },
                    ]
                ).map(pkg => (
                  <button key={pkg.credits} onClick={() => { setShowCreditsModal(false); window.location.href = '/offer'; }}
                    style={{
                      position: 'relative',
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: pkg.popular ? 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))' : 'rgba(255,255,255,0.04)',
                      border: pkg.popular ? '1px solid rgba(255,215,0,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{pkg.credits} генераций</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{pkg.label}</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#ffd700' }}>{pkg.price} ₽</div>
                    {pkg.popular && <div style={{ position: 'absolute', top: -8, right: 12, background: '#ffd700', color: '#000', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 8 }}>ХИТ</div>}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowCreditsModal(false)}
                style={{ width: '100%', padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Не сейчас
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
