import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * TerminalOfMagic — «Театр Бурлящей Активности»
 * Заменяет мёртвый спиннер на живой терминал с логами от GPU.
 * Дизайн: Glassmorphism · Spring Physics · CTO Manifest 2026
 */

const SPRING = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };
const SPRING_SOFT = { type: 'spring', stiffness: 200, damping: 30, mass: 0.8 };

// Симулированные статусы генерации (используются пока нет реального SSE)
const GPU_MESSAGES = [
  { msg: '🔌 Подключение к нейросети...', delay: 0 },
  { msg: '⚡ Загрузка VTON-модели в VRAM...', delay: 2000 },
  { msg: '📐 Анализ одежды и текстур...', delay: 5000 },
  { msg: '🧬 Построение латентного пространства...', delay: 8000 },
  { msg: '👤 Калибровка анатомии модели...', delay: 12000 },
  { msg: '🎨 Рендеринг микродеталей кожи...', delay: 16000 },
  { msg: '📷 Финальная цветокоррекция (85mm f/1.4)...', delay: 20000 },
  { msg: '✨ Применение подповерхностного рассеяния...', delay: 25000 },
  { msg: '🔍 Контроль качества...', delay: 30000 },
];

function now() {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false });
}

export default function TerminalOfMagic({ isActive, customMessage }) {
  const [logs, setLogs] = React.useState([]);
  const bodyRef = useRef(null);
  const timersRef = useRef([]);

  useEffect(() => {
    if (isActive) {
      setLogs([{ time: now(), msg: '🚀 Задача принята. Инициализация GPU...' }]);

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
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={SPRING}
        >
          {/* Header */}
          <div className="terminal-header">
            <span className="terminal-dot red" />
            <span className="terminal-dot yellow" />
            <span className="terminal-dot green" />
            <span className="terminal-title">PANX Neural Engine v2.0</span>
            <motion.span
              className="terminal-pulse"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Log stream */}
          <div className="terminal-body" ref={bodyRef}>
            <AnimatePresence mode="popLayout">
              {logs.map((log, i) => (
                <motion.div
                  key={`${log.time}-${i}`}
                  className="terminal-log"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...SPRING_SOFT, delay: 0.03 }}
                >
                  <span className="terminal-time">{log.time}</span>
                  <span className="terminal-msg">{log.msg}</span>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Blinking cursor */}
            {isActive && <span className="terminal-cursor" />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
