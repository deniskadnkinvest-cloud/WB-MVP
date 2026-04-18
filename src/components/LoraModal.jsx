import React, { useRef } from 'react';
import { motion } from 'framer-motion';

const SLOTS = [
  { key: 'front', label: 'Фронт', icon: '👤' },
  { key: 'left34', label: '3/4 слева', icon: '◀️' },
  { key: 'right34', label: '3/4 справа', icon: '▶️' },
];

export default function LoraModal({ show, onClose, onSave, loraName, setLoraName, loraPhotos, setLoraPhotos }) {
  const fileRefs = useRef({});

  const handleFile = async (key, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const maxW = 800;
        const ratio = Math.min(maxW / img.width, maxW / img.height, 1);
        c.width = img.width * ratio; c.height = img.height * ratio;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const compressed = c.toDataURL('image/jpeg', 0.85);
        setLoraPhotos(prev => ({ ...prev, [key]: compressed }));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (key) => setLoraPhotos(prev => ({ ...prev, [key]: null }));
  const filledCount = Object.values(loraPhotos).filter(Boolean).length;

  if (!show) return null;

  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal-content" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">👤 Добавить свою модель</div>
        <p className="modal-hint">Загрузите от одной до трёх фото человека с разных ракурсов — чем точнее ракурсы, тем правдоподобнее результат (вплоть до родинок).<br/><span style={{opacity:0.7}}>Если загружаете 1 фото, используйте портрет с хорошим светом и детализированным лицом.</span></p>
        <input className="modal-input" placeholder="Имя модели (напр. Алина, Дмитрий)" value={loraName} onChange={e => setLoraName(e.target.value)} />
        <div className="lora-photo-slots">
          {SLOTS.map(({ key, label, icon }) => (
            <div key={key} className={`lora-slot ${loraPhotos[key] ? 'filled' : ''}`} onClick={() => !loraPhotos[key] && fileRefs.current[key]?.click()}>
              <input type="file" accept="image/*" ref={el => fileRefs.current[key] = el} style={{ display: 'none' }} onChange={e => handleFile(key, e)} />
              {loraPhotos[key] ? (
                <>
                  <img src={loraPhotos[key]} alt={label} />
                  <button className="remove-btn" onClick={e => { e.stopPropagation(); removePhoto(key); }}>✕</button>
                </>
              ) : (
                <>
                  <div className="lora-slot-icon">{icon}</div>
                  <div className="lora-slot-label">{label}</div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Отмена</button>
          <button className="modal-btn-primary" onClick={onSave} disabled={!loraName.trim() || filledCount < 1}>Сохранить</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
