import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../lib/firebase';

const TYPE_LABELS = {
  fashion: '👗 Одежда',
  product: '📦 Предметка',
  quick: '⚡ В два клика',
  autocatalog: '🏭 Авто-каталог',
  calibration: '🎯 Калибровка',
};
const TYPE_COLORS = {
  fashion: '#f59e0b',
  product: '#22d3ee',
  quick: '#a78bfa',
  autocatalog: '#34d399',
  calibration: '#fb923c',
};
const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'fashion', label: '👗 Одежда' },
  { key: 'product', label: '📦 Предметка' },
  { key: 'quick', label: '⚡ В два клика' },
  { key: 'autocatalog', label: '🏭 Авто-каталог' },
];

function formatDate(createdAt) {
  if (!createdAt) return '—';
  try {
    const d = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffMin < 2) return 'Только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    if (diffH < 24) return `${diffH} ч назад`;
    if (diffD === 1) return 'Вчера';
    if (diffD < 7) return `${diffD} дн назад`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
}

async function downloadImage(url, filename) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'seller-studio-result.jpg';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, '_blank');
  }
}

export default function MyHistoryPage({ onClose }) {
  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [lightbox, setLightbox] = useState(null); // { url, idx }
  const [downloading, setDownloading] = useState(null);
  const lightboxRef = useRef(null);

  const loadHistory = useCallback(async (typeFilter) => {
    setLoading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Не авторизован');
      const token = await user.getIdToken();
      const url = typeFilter && typeFilter !== 'all'
        ? `/api/admin/user-history?limit=100&type=${typeFilter}`
        : `/api/admin/user-history?limit=100`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'Ошибка загрузки');
      setGenerations(data.generations || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory(filter === 'all' ? null : filter);
  }, [filter, loadHistory]);

  // Keyboard nav in lightbox
  useEffect(() => {
    if (lightbox === null) return;
    const handler = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox(prev => prev !== null && prev + 1 < generations.length ? prev + 1 : prev);
      if (e.key === 'ArrowLeft') setLightbox(prev => prev !== null && prev - 1 >= 0 ? prev - 1 : prev);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, generations.length]);

  const handleDownload = async (e, gen, idx) => {
    e.stopPropagation();
    setDownloading(idx);
    await downloadImage(gen.imageUrl, `seller-studio-${gen.type}-${idx + 1}.jpg`);
    setDownloading(null);
  };

  return (
    <div className="history-page-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="history-page">
        {/* Header */}
        <div className="history-page-header">
          <div className="history-page-title">
            <span className="history-page-icon">🖼️</span>
            <div>
              <h2>Мои работы</h2>
              <p className="history-page-subtitle">
                {loading ? 'Загружаем...' : `${generations.length} генераций`}
              </p>
            </div>
          </div>
          <button className="history-page-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        {/* Filters */}
        <div className="history-filters">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`history-filter-btn ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="history-content">
          {loading && (
            <div className="history-loading">
              <div className="history-spinner" />
              <p>Загружаем вашу историю...</p>
            </div>
          )}

          {!loading && error && (
            <div className="history-error">
              <span>⚠️</span>
              <p>{error}</p>
              <button onClick={() => loadHistory(filter === 'all' ? null : filter)}>Повторить</button>
            </div>
          )}

          {!loading && !error && generations.length === 0 && (
            <div className="history-empty">
              <span className="history-empty-icon">✨</span>
              <h3>Пока пусто</h3>
              <p>Ваши сгенерированные фото появятся здесь</p>
            </div>
          )}

          {!loading && !error && generations.length > 0 && (
            <div className="history-grid">
              {generations.map((gen, idx) => (
                <div
                  key={gen.id}
                  className="history-card"
                  onClick={() => setLightbox(idx)}
                >
                  <div className="history-card-img-wrap">
                    {gen.imageUrl ? (
                      <img src={gen.imageUrl} alt={TYPE_LABELS[gen.type] || gen.type} loading="lazy" />
                    ) : (
                      <div className="history-card-no-img">📷</div>
                    )}
                    <div className="history-card-overlay">
                      <button
                        className="history-card-download"
                        onClick={(e) => handleDownload(e, gen, idx)}
                        disabled={downloading === idx}
                        title="Скачать"
                      >
                        {downloading === idx ? '⏳' : '⬇️'}
                      </button>
                    </div>
                  </div>
                  <div className="history-card-info">
                    <span
                      className="history-card-type"
                      style={{ color: TYPE_COLORS[gen.type] || '#888' }}
                    >
                      {TYPE_LABELS[gen.type] || gen.type}
                    </span>
                    <span className="history-card-date">{formatDate(gen.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox with Details Panel */}
      {lightbox !== null && generations[lightbox] && (() => {
        const gen = generations[lightbox];
        const details = [];

        // Тип генерации
        details.push({ icon: '🏷️', label: 'Тип', value: TYPE_LABELS[gen.type] || gen.type });

        // Формат
        if (gen.aspectRatio) details.push({ icon: '📐', label: 'Формат', value: gen.aspectRatio });

        // Модель
        if (gen.modelPreset) {
          const short = gen.modelPreset.length > 80 ? gen.modelPreset.slice(0, 80) + '…' : gen.modelPreset;
          details.push({ icon: '👤', label: 'Модель', value: short });
        }

        // Поза
        if (gen.posePreset) {
          const short = gen.posePreset.length > 80 ? gen.posePreset.slice(0, 80) + '…' : gen.posePreset;
          details.push({ icon: '🧍', label: 'Поза', value: short });
        }

        // Кастомная поза
        if (gen.customPoseText) details.push({ icon: '✍️', label: 'Кастомная поза', value: gen.customPoseText });

        // Камера
        if (gen.cameraAngle) details.push({ icon: '📷', label: 'Камера', value: gen.cameraAngle });

        // Фон
        if (gen.backgroundPreset) {
          const short = gen.backgroundPreset.length > 80 ? gen.backgroundPreset.slice(0, 80) + '…' : gen.backgroundPreset;
          details.push({ icon: '🖼️', label: 'Фон', value: short });
        }

        // Категория (предметка)
        if (gen.categoryId && gen.categoryId !== 'default') details.push({ icon: '📦', label: 'Категория', value: gen.categoryId });

        // С моделью (предметка)
        if (gen.withHumanModel) details.push({ icon: '🧑', label: 'С моделью', value: 'Да' });

        // Бьюти-режим
        if (gen.isBeautyMode) details.push({ icon: '💄', label: 'Бьюти-режим', value: 'Да' });

        // Дизайн-карточка
        if (gen.isCardDesign) details.push({ icon: '🎨', label: 'Карточка', value: gen.cardStyle || 'стандарт' });

        // Фоторедактирование
        if (gen.isPhotoEdit && gen.editInstruction) details.push({ icon: '✏️', label: 'Фоторедактирование', value: gen.editInstruction });

        // Время генерации
        if (gen.durationMs > 0) {
          const secs = (gen.durationMs / 1000).toFixed(1);
          details.push({ icon: '⏱️', label: 'Время', value: `${secs} сек` });
        }

        // Дата
        details.push({ icon: '📅', label: 'Дата', value: formatDate(gen.createdAt) });

        return (
          <div className="history-lightbox" ref={lightboxRef} onClick={() => setLightbox(null)}>
            <div className="history-lightbox-inner history-lightbox-with-details" onClick={e => e.stopPropagation()}>
              <div className="history-lightbox-image-area">
                <img src={gen.imageUrl} alt="Просмотр" />
              </div>
              <div className="history-lightbox-details">
                <h3 className="history-details-title">⚙️ Настройки генерации</h3>
                <div className="history-details-list">
                  {details.map((d, i) => (
                    <div key={i} className="history-detail-row">
                      <span className="history-detail-icon">{d.icon}</span>
                      <div className="history-detail-content">
                        <span className="history-detail-label">{d.label}</span>
                        <span className="history-detail-value">{d.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {gen.garmentUrls && gen.garmentUrls.length > 0 && (
                  <div className="history-detail-garments">
                    <span className="history-detail-label">👕 Исходные фото ({gen.garmentUrls.length})</span>
                    <div className="history-detail-garment-thumbs">
                      {gen.garmentUrls.slice(0, 4).map((url, gi) => (
                        <img key={gi} src={url} alt={`Исходное ${gi + 1}`} className="history-garment-thumb" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="history-lightbox-controls">
                <button
                  className="history-lb-btn"
                  disabled={lightbox <= 0}
                  onClick={() => setLightbox(lightbox - 1)}
                >←</button>
                <span className="history-lb-counter">
                  {lightbox + 1} / {generations.length}
                </span>
                <button
                  className="history-lb-btn"
                  disabled={lightbox >= generations.length - 1}
                  onClick={() => setLightbox(lightbox + 1)}
                >→</button>
                <button
                  className="history-lb-download"
                  onClick={() => downloadImage(gen.imageUrl, `seller-studio-${gen.type}-${lightbox + 1}.jpg`)}
                  title="Скачать оригинал"
                >
                  ⬇️ Скачать
                </button>
                <button className="history-lb-close" onClick={() => setLightbox(null)}>✕</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
