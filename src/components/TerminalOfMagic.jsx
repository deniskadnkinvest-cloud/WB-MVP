import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * TerminalOfMagic — «Театр Бурлящей Активности»
 * Заменяет мёртвый спиннер на живой терминал с логами от GPU.
 * Дизайн: Glassmorphism · Spring Physics · CTO Manifest 2026
 */

const SPRING = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };
const SPRING_SOFT = { type: 'spring', stiffness: 200, damping: 30, mass: 0.8 };

// Симулированные статусы генерации
const GPU_MESSAGES = [
  { msg: '📊 Сканирование пропорций...', delay: 0 },
  { msg: '👤 Анализ антропометрии...', delay: 2000 },
  { msg: '📐 Определение телосложения...', delay: 5000 },
  { msg: '🧬 Извлечение черт внешности...', delay: 8000 },
  { msg: '🔌 Подключение к нейросети...', delay: 12000 },
  { msg: '🔮 Расчет латентных векторов...', delay: 16000 },
  { msg: '🎨 Синтез недостающего ракурса...', delay: 20000 },
  { msg: '✨ Рендеринг текстур кожи...', delay: 25000 },
  { msg: '🔍 Контроль схожести лица...', delay: 30000 },
];

function now() {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false });
}

export default function TerminalOfMagic({ isActive, customMessage, inSlot = false }) {
  const [logs, setLogs] = React.useState([]);
  const bodyRef = useRef(null);
  const timersRef = useRef([]);

  useEffect(() => {
    if (isActive) {
      setLogs([{ time: now(), msg: '🚀 Инициализация GPU...' }]);

      // Schedule simulated status messages
      timersRef.current = GPU_MESSAGES.map(({ msg, delay }) =>
        setTimeout(() => {
          if (!isActive) return;
          setLogs(prev => [...prev, { time: now(), msg }]);
        }, delay)
      );
    } else {
      // Cleanup timers
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    }

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [isActive]);

  // Add custom message when it changes
  useEffect(() => {
    if (customMessage && isActive) {
      setLogs(prev => [...prev, { time: now(), msg: customMessage }]);
    }
  }, [customMessage, isActive]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isActive && logs.length === 0) return null;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="terminal-magic"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={SPRING}
          style={inSlot ? {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            margin: 0,
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 10,
            background: 'rgba(5, 5, 8, 0.95)',
            border: '1px solid rgba(168, 85, 247, 0.3)'
          } : {}}
        >
          {/* Header */}
          <div className="terminal-header" style={inSlot ? { padding: '8px 10px' } : {}}>
            <span className="terminal-dot red" style={inSlot ? { width: 6, height: 6 } : {}} />
            <span className="terminal-dot yellow" style={inSlot ? { width: 6, height: 6 } : {}} />
            <span className="terminal-dot green" style={inSlot ? { width: 6, height: 6 } : {}} />
            <span className="terminal-title" style={inSlot ? { fontSize: '0.58rem', marginLeft: 4 } : {}}>
              AI Engine v2.0
            </span>
            <motion.span
              className="terminal-pulse"
              style={inSlot ? { width: 6, height: 6 } : {}}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Log stream */}
          <div
            className="terminal-body"
            ref={bodyRef}
            style={inSlot ? {
              padding: '8px 10px',
              fontSize: '0.62rem',
              maxHeight: 'none',
              flex: 1,
              overflowY: 'auto'
            } : {}}
          >
            <AnimatePresence mode="popLayout">
              {logs.map((log, i) => (
                <motion.div
                  key={`${log.time}-${i}`}
                  className="terminal-log"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...SPRING_SOFT, delay: 0.03 }}
                  style={inSlot ? { gap: 6, marginBottom: 2 } : {}}
                >
                  {!inSlot && <span className="terminal-time">{log.time}</span>}
                  <span className="terminal-msg">{log.msg}</span>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Blinking cursor */}
            {isActive && <span className="terminal-cursor" style={inSlot ? { width: 4, height: 8 } : {}} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
