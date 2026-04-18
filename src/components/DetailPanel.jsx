import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getModelDetails } from '../data/presets';

export default function DetailPanel({ modelDetails, setModelDetails, visible, gender }) {
  const detailsConfig = getModelDetails(gender);
  const DETAIL_KEYS = Object.keys(detailsConfig);

  const setDetail = (key, value) => setModelDetails(prev => ({ ...prev, [key]: value }));

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
              <div className="detail-label">{detailsConfig[key].label}</div>
              <div className="detail-chips">
                {detailsConfig[key].options.map(opt => (
                  <span key={opt} className={`detail-chip ${modelDetails[key] === opt ? 'active' : ''}`} onClick={() => setDetail(key, opt)}>{opt}</span>
                ))}
              </div>
            </div>
          ))}
          <button className="random-btn" onClick={randomize}>🎲 Случайно</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
