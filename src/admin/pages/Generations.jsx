import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdmin } from '../AdminApp';

const c = {
  bg: '#030305',
  surface: 'rgba(255, 255, 255, 0.02)',
  surfaceHover: 'rgba(255, 255, 255, 0.04)',
  border: 'rgba(255, 255, 255, 0.08)',
  text1: '#f8fafc',
  text2: 'rgba(255, 255, 255, 0.6)',
  text3: 'rgba(255, 255, 255, 0.3)',
  accent: '#fb923c', // Orange accent
  accentDim: 'rgba(251, 146, 60, 0.1)',
  green: '#34d399',
  greenDim: 'rgba(52, 211, 153, 0.1)',
  red: '#f87171',
  redDim: 'rgba(248, 113, 113, 0.1)',
  purple: '#a78bfa',
  purpleDim: 'rgba(167, 139, 250, 0.1)',
};

const springTransition = { type: 'spring', stiffness: 400, damping: 25, mass: 0.5 };

const TYPE_LABELS = {
  fashion: 'Примерка',
  product: 'Товары',
  calibration: 'Калибровка',
  autocatalog: 'Авто-каталог',
};

const TYPE_COLORS = {
  fashion: c.accent,
  product: c.purple,
  calibration: '#38bdf8', // Light blue
  autocatalog: c.green,
};

export default function Generations() {
  const { authHeaders } = useAdmin();
  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchUid, setSearchUid] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedGen, setSelectedGen] = useState(null);

  const fetchGenerations = () => {
    setLoading(true);
    let url = '/api/admin/generations?limit=100';
    if (searchUid.trim()) url += `&userId=${encodeURIComponent(searchUid.trim())}`;
    if (filterType !== 'all') url += `&type=${filterType}`;

    fetch(url, { headers: { ...authHeaders } })
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          setGenerations(res.generations || []);
          setError(null);
        } else {
          setError(res.error || 'Ошибка при загрузке данных');
        }
      })
      .catch(() => setError('Ошибка подключения к серверу'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchGenerations();
  }, [filterType]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchGenerations();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Inter', sans-serif" }}>
      
      {/* Шапка */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: c.text1, margin: 0, letterSpacing: '-0.5px' }}>
            Мониторинг генераций
          </h1>
          <p style={{ fontSize: '13px', color: c.text2, margin: '4px 0 0 0' }}>
            История обработки изображений в реальном времени
          </p>
        </div>
        <button
          onClick={fetchGenerations}
          disabled={loading}
          style={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            padding: '10px 16px',
            borderRadius: '12px',
            color: c.text1,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = c.surfaceHover}
          onMouseLeave={e => e.currentTarget.style.background = c.surface}
        >
          {loading ? '⏳' : '🔄'} Обновить
        </button>
      </div>

      {/* Фильтры и поиск */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '16px',
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: '16px',
        backdropFilter: 'blur(40px)',
      }}>
        {/* Поиск */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '280px' }}>
          <input
            type="text"
            placeholder="Поиск по Telegram ID / Email / UID..."
            value={searchUid}
            onChange={e => setSearchUid(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(0, 0, 0, 0.2)',
              border: `1px solid ${c.border}`,
              borderRadius: '12px',
              padding: '10px 14px',
              fontSize: '13px',
              color: c.text1,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              background: c.accent,
              color: '#000',
              border: 'none',
              borderRadius: '12px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Найти
          </button>
        </form>

        {/* Переключатели типов */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['all', 'fashion', 'product', 'calibration', 'autocatalog'].map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 600,
                border: `1px solid ${filterType === t ? TYPE_COLORS[t] || c.accent : c.border}`,
                background: filterType === t ? (t === 'all' ? c.accentDim : (TYPE_COLORS[t] + '15')) : 'transparent',
                color: filterType === t ? TYPE_COLORS[t] || c.accent : c.text2,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {t === 'all' ? 'Все ракурсы' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Контент */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 0', gap: '16px' }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: `3px solid ${c.border}`,
              borderTopColor: c.accent,
            }}
          />
          <p style={{ color: c.text2, fontSize: '13px' }}>Загрузка генераций...</p>
        </div>
      ) : error ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: '16px',
        }}>
          <p style={{ color: c.red, fontSize: '14px', margin: '0 0 16px 0' }}>{error}</p>
          <button
            onClick={fetchGenerations}
            style={{
              background: c.accentDim,
              border: `1px solid ${c.accent}`,
              color: c.accent,
              padding: '8px 20px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Повторить попытку
          </button>
        </div>
      ) : generations.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: '16px',
          color: c.text3,
        }}>
          <span style={{ fontSize: '32px' }}>📷</span>
          <p style={{ fontSize: '14px', marginTop: '12px' }}>Генераций не найдено. Начните создавать изображения!</p>
        </div>
      ) : (
        <motion.div
          layout
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {generations.map(gen => (
            <motion.div
              layout
              key={gen.id}
              onClick={() => setSelectedGen(gen)}
              style={{
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: '16px',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
              whileHover={{ borderColor: 'rgba(255,255,255,0.15)', y: -2 }}
              transition={springTransition}
            >
              {/* Картинка / Превью */}
              <div style={{ height: '260px', background: '#08080a', position: 'relative', overflow: 'hidden', display: 'flex', gap: '2px' }}>
                {gen.success ? (
                  <>
                    {/* Исходная одежда */}
                    {gen.garmentUrls && gen.garmentUrls[0] && (
                      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        <img
                          src={gen.garmentUrls[0]}
                          alt="Garment"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
                        />
                        <div style={{ position: 'absolute', bottom: '6px', left: '6px', fontSize: '9px', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', color: c.text2 }}>До</div>
                      </div>
                    )}
                    {/* Результат */}
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                      <img
                        src={gen.imageUrl}
                        alt="Result"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{ position: 'absolute', bottom: '6px', left: '6px', fontSize: '9px', background: 'rgba(251, 146, 60, 0.8)', padding: '2px 6px', borderRadius: '4px', color: '#000', fontWeight: 700 }}>После</div>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', gap: '8px' }}>
                    <span style={{ fontSize: '32px' }}>❌</span>
                    <span style={{ color: c.red, fontSize: '12px', fontWeight: 600, textAlign: 'center' }}>Ошибка генерации</span>
                    {gen.error && <p style={{ color: c.text3, fontSize: '10px', textAlign: 'center', margin: 0, maxHeight: '60px', overflow: 'hidden' }}>{gen.error}</p>}
                  </div>
                )}

                {/* Badge статуса/типа */}
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  background: gen.success ? 'rgba(52, 211, 153, 0.9)' : 'rgba(248, 113, 113, 0.9)',
                  color: '#000',
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  {gen.success ? 'Успешно' : 'Сбой'}
                </div>

                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(0,0,0,0.6)',
                  color: TYPE_COLORS[gen.type] || c.accent,
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${TYPE_COLORS[gen.type] || c.accent}`,
                }}>
                  {TYPE_LABELS[gen.type] || gen.type}
                </div>
              </div>

              {/* Детали снизу */}
              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: c.text3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '160px',
                  }}>
                    User: {gen.userId}
                  </div>
                  <div style={{ fontSize: '10px', color: c.text3 }}>
                    {gen.createdAt ? new Date(gen.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                </div>

                {/* Характеристики */}
                <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: c.text2 }}>
                  <span>⏳ {gen.durationMs ? `${(gen.durationMs / 1000).toFixed(1)}s` : '—'}</span>
                  <span>📐 {gen.aspectRatio}</span>
                  {gen.score && <span style={{ color: c.green }}>★ {gen.score}/10</span>}
                </div>

                {gen.modelPreset && (
                  <div style={{
                    fontSize: '11px',
                    color: c.text2,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: '1.4',
                    height: '30px',
                  }}>
                    {gen.modelPreset}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Модалка детального просмотра */}
      <AnimatePresence>
        {selectedGen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedGen(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(3, 3, 5, 0.9)',
              backdropFilter: 'blur(10px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={springTransition}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '720px',
                background: '#0d0d11',
                border: `1px solid ${c.border}`,
                borderRadius: '24px',
                overflow: 'hidden',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Шапка модалки */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${c.border}` }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: c.text1, fontWeight: 700 }}>
                    Детали генерации
                  </h3>
                  <span style={{ fontSize: '10px', color: c.text3 }}>ID: {selectedGen.id}</span>
                </div>
                <button
                  onClick={() => setSelectedGen(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: c.text2,
                    fontSize: '18px',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Тело модалки */}
              <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Фотографии */}
                <div style={{ display: 'flex', gap: '12px', height: '360px' }}>
                  {/* До */}
                  {selectedGen.garmentUrls && selectedGen.garmentUrls[0] && (
                    <div style={{ flex: 1, position: 'relative', borderRadius: '16px', overflow: 'hidden', border: `1px solid ${c.border}`, background: '#050507' }}>
                      <img src={selectedGen.garmentUrls[0]} alt="Garment" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', color: c.text1 }}>
                        Одежда
                      </div>
                    </div>
                  )}
                  {/* После */}
                  {selectedGen.success && selectedGen.imageUrl ? (
                    <div style={{ flex: 1, position: 'relative', borderRadius: '16px', overflow: 'hidden', border: `1px solid ${c.border}`, background: '#050507' }}>
                      <img src={selectedGen.imageUrl} alt="Result" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: c.accent, padding: '4px 10px', borderRadius: '8px', fontSize: '11px', color: '#000', fontWeight: 700 }}>
                        Результат
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${c.red}`, borderRadius: '16px', background: c.redDim, padding: '20px' }}>
                      <span style={{ fontSize: '32px' }}>⚠️</span>
                      <p style={{ color: c.red, fontSize: '13px', fontWeight: 600 }}>Генерация завершилась сбоем</p>
                      {selectedGen.error && <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px', color: c.text2, background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', width: '90%', maxHeight: '100px', overflowY: 'auto' }}>{selectedGen.error}</pre>}
                    </div>
                  )}
                </div>

                {/* Таблица метаданных */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase' }}>Пользователь</span>
                    <span style={{ fontSize: '13px', color: c.text1, fontFamily: 'monospace' }}>{selectedGen.userId}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase' }}>Дата запуска</span>
                    <span style={{ fontSize: '13px', color: c.text1 }}>
                      {selectedGen.createdAt ? new Date(selectedGen.createdAt).toLocaleString('ru-RU') : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase' }}>Тип операции</span>
                    <span style={{ fontSize: '13px', color: TYPE_COLORS[selectedGen.type] || c.accent, fontWeight: 600 }}>
                      {TYPE_LABELS[selectedGen.type] || selectedGen.type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: c.text3, textTransform: 'uppercase' }}>Параметры</span>
                    <span style={{ fontSize: '13px', color: c.text1 }}>
                      ⏱ {(selectedGen.durationMs / 1000).toFixed(1)}с · 📐 {selectedGen.aspectRatio}
                    </span>
                  </div>
                </div>

                {/* Подробный разбор ИИ (если есть) */}
                {selectedGen.reason && (
                  <div style={{
                    padding: '12px 16px',
                    background: c.greenDim,
                    border: `1px solid ${c.green}20`,
                    borderRadius: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}>
                    <span style={{ fontSize: '10px', color: c.green, fontWeight: 700, textTransform: 'uppercase' }}>Анализ качества (QA Score: {selectedGen.score}/10)</span>
                    <p style={{ fontSize: '12px', color: c.text2, margin: 0, lineHeight: 1.4 }}>
                      {selectedGen.reason}
                    </p>
                  </div>
                )}

                {/* Промпты */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: `1px solid ${c.border}` }}>
                  {selectedGen.modelPreset && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: c.text3, fontWeight: 600, textTransform: 'uppercase' }}>ИИ Модель</span>
                      <p style={{ fontSize: '12px', color: c.text2, margin: 0, fontFamily: 'monospace', lineHeight: 1.4 }}>{selectedGen.modelPreset}</p>
                    </div>
                  )}
                  {selectedGen.posePreset && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: `1px solid ${c.border}`, paddingTop: '8px' }}>
                      <span style={{ fontSize: '10px', color: c.text3, fontWeight: 600, textTransform: 'uppercase' }}>Поза</span>
                      <p style={{ fontSize: '12px', color: c.text2, margin: 0, fontFamily: 'monospace', lineHeight: 1.4 }}>{selectedGen.posePreset}</p>
                    </div>
                  )}
                  {selectedGen.backgroundPreset && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: `1px solid ${c.border}`, paddingTop: '8px' }}>
                      <span style={{ fontSize: '10px', color: c.text3, fontWeight: 600, textTransform: 'uppercase' }}>Окружение</span>
                      <p style={{ fontSize: '12px', color: c.text2, margin: 0, fontFamily: 'monospace', lineHeight: 1.4 }}>{selectedGen.backgroundPreset}</p>
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
