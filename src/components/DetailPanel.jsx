import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getModelDetails } from '../data/presets';

// Fields that support multi-select (can pick several at once)
const MULTI_SELECT_FIELDS = ['tattoo'];

export default function DetailPanel({ modelDetails, setModelDetails, visible, gender, extraPrompt, setExtraPrompt }) {
  const detailsConfig = getModelDetails(gender);
  const DETAIL_KEYS = Object.keys(detailsConfig);

  const setDetail = (key, value) => {
    if (MULTI_SELECT_FIELDS.includes(key)) {
      // Multi-select: toggle value in array
      setModelDetails(prev => {
        const current = Array.isArray(prev[key]) ? prev[key] : (prev[key] ? [prev[key]] : []);
        if (value === 'Нет') return { ...prev, [key]: 'Нет' };
        const filtered = current.filter(v => v !== 'Нет');
        if (filtered.includes(value)) {
          const result = filtered.filter(v => v !== value);
          return { ...prev, [key]: result.length ? result : null };
        }
        return { ...prev, [key]: [...filtered, value] };
      });
    } else {
      setModelDetails(prev => ({ ...prev, [key]: value }));
    }
  };

  const isActive = (key, opt) => {
    const val = modelDetails[key];
    if (MULTI_SELECT_FIELDS.includes(key) && Array.isArray(val)) return val.includes(opt);
    return val === opt;
  };

  const randomize = () => {
    const result = {};
    DETAIL_KEYS.forEach(key => {
      const opts = detailsConfig[key].options;
      result[key] = opts[Math.floor(Math.random() * opts.length)];
    });
    setModelDetails(result);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="detail-panel"
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: 'hidden', transformOrigin: 'top' }}
        >
          {DETAIL_KEYS.map(key => (
            <div className="detail-row" key={key}>
              <div className="detail-label">
                {detailsConfig[key].label}
                {MULTI_SELECT_FIELDS.includes(key) && <span className="multi-hint"> (можно несколько)</span>}
              </div>
              <div className="detail-chips">
                {detailsConfig[key].options.map(opt => (
                  <span key={opt} className={`detail-chip ${isActive(key, opt) ? 'active' : ''}`} onClick={() => setDetail(key, opt)}>{opt}</span>
                ))}
              </div>
            </div>
          ))}

          {/* Extra custom prompt */}
          <div className="detail-row">
            <div className="detail-label">✏️ Дополнительно от себя</div>
            <textarea 
              className="modifier-input" 
              rows={2} 
              placeholder="Добавьте что угодно: шрам на брови, родинка на щеке, борода, веснушки..." 
              value={extraPrompt || ''} 
              onChange={e => setExtraPrompt(e.target.value)} 
            />
          </div>

          <button className="random-btn" onClick={randomize}>🎲 Случайно</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
