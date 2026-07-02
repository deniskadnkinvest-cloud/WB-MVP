import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  MODEL_PRESETS, POSE_PRESETS, BACKGROUND_PRESETS,
  CAMERA_ANGLES, ASPECT_RATIOS, PRODUCT_CATEGORIES,
  PRODUCT_COMPOSITIONS, PRODUCT_BACKGROUNDS, PRODUCT_EFFECTS
} from '../data/presets';

// Универсальный маппер prompt → label (русское название с эмодзи)
function findPresetLabel(prompt, presets) {
  if (!prompt) return null;
  const p = prompt.trim().toLowerCase();
  for (const preset of presets) {
    if (preset.prompt && p.startsWith(preset.prompt.trim().toLowerCase().slice(0, 30))) {
      return `${preset.emoji || ''} ${preset.label}`.trim();
    }
  }
  return null;
}

const TYPE_LABELS = {
  fashion: '👗 Одежда',
  product: '📦 Предметка',
  quick: '⚡ В два клика',
  ugc: '📱 Фото от покупателей',
  model: '👤 Фото с моделью',
  autocatalog: '🏭 Авто-каталог',
  calibration: '🎯 Калибровка',
};
const TYPE_COLORS = {
  fashion: '#f59e0b',
  product: '#22d3ee',
  quick: '#a78bfa',
  ugc: '#22c55e',
  model: '#c084fc',
  autocatalog: '#34d399',
  calibration: '#fb923c',
};
const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'fashion', label: '👗 Одежда' },
  { key: 'product', label: '📦 Предметка' },
  { key: 'quick', label: '⚡ В два клика' },
  { key: 'ugc', label: '📱 UGC-отзывы' },
  { key: 'model', label: '👤 С моделью' },
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

async function downloadImage(url, filename, token) {
  try {
    let resp;
    try {
      resp = url.startsWith('data:')
        ? await fetch(url)
        : await fetch(url, { mode: 'cors', cache: 'no-store' });
      if (!resp.ok) throw new Error(`download failed: ${resp.status}`);
    } catch (directErr) {
      if (url.startsWith('data:')) throw directErr;
      resp = await fetch(`/api/upload?url=${encodeURIComponent(url)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw directErr;
    }
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'seller-studio-result.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function MyHistoryPage({ onClose, onReuseSettings }) {
  const { user } = useAuth();
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
  }, [user]);

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
    const token = await user?.getIdToken?.();
    await downloadImage(gen.imageUrl, `seller-studio-${gen.type}-${idx + 1}.jpg`, token);
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
        if (gen.aspectRatio) {
          const ratioPreset = ASPECT_RATIOS.find(r => r.id === gen.aspectRatio);
          details.push({ icon: ratioPreset?.icon || '📐', label: 'Формат', value: ratioPreset?.label || gen.aspectRatio });
        }

        // Детальные характеристики модели — ТОЛЬКО для fashion и предметки с моделью
        const isFashion = gen.type === 'fashion' || !gen.type;
        const isProductWithModel = gen.type === 'product' && gen.withHumanModel;
        const isQuick = gen.type === 'quick';

        if (isFashion || isProductWithModel) {
          // Модель
          if (gen.modelPreset) {
            const label = findPresetLabel(gen.modelPreset, MODEL_PRESETS);
            details.push({ icon: '👤', label: 'Модель', value: label || gen.modelPreset.slice(0, 60) });
          }

          const attrs = gen.attributes || {};
          
          details.push({ icon: '📏', label: 'Телосложение', value: attrs.bodyType || 'По умолчанию' });
          
          const hair = [attrs.hairLength, attrs.hairColor].filter(Boolean).join(' ');
          details.push({ icon: '💇', label: 'Волосы', value: hair || 'По умолчанию' });
          
          details.push({ icon: '🎭', label: 'Эмоция', value: attrs.emotion || 'По умолчанию' });
          
          const tattooVal = Array.isArray(attrs.tattoo) 
            ? attrs.tattoo.filter(x => x !== 'Нет').join(', ') 
            : (attrs.tattoo !== 'Нет' ? attrs.tattoo : '');
          details.push({ icon: '🖋️', label: 'Тату', value: tattooVal || 'Нет' });
          
          const piercingVal = Array.isArray(attrs.piercing)
            ? attrs.piercing.filter(x => x !== 'Нет').join(', ')
            : (attrs.piercing !== 'Нет' ? attrs.piercing : '');
          details.push({ icon: '💎', label: 'Пирсинг', value: piercingVal || 'Нет' });

          // Поза — только для fashion/product с моделью
          if (gen.posePreset) {
            const label = findPresetLabel(gen.posePreset, POSE_PRESETS);
            details.push({ icon: '🧍', label: 'Поза', value: label || gen.posePreset.slice(0, 60) });
          }
          if (gen.customPoseText) details.push({ icon: '✍️', label: 'Кастомная поза', value: gen.customPoseText });

          // Камера — только для fashion/product
          if (gen.cameraAngle) {
            const label = findPresetLabel(gen.cameraAngle, CAMERA_ANGLES);
            details.push({ icon: '📷', label: 'Камера', value: label || gen.cameraAngle });
          }

          // Фон — только для fashion/product
          if (gen.backgroundPreset) {
            const allBgs = [...BACKGROUND_PRESETS, ...PRODUCT_BACKGROUNDS];
            const label = findPresetLabel(gen.backgroundPreset, allBgs);
            details.push({ icon: '🖼️', label: 'Фон', value: label || gen.backgroundPreset.slice(0, 60) });
          }
        }

        // Quick Mode — показать релевантные для карточки настройки
        if (isQuick) {
          // Стиль карточки — без проверки isCardDesign (для quick это всегда карточка)
          const quickStyleLabel = gen.cardStyle === 'epic' ? '⚡ Эпичная' 
            : gen.cardStyle === 'natural' ? '🌿 Естественная' 
            : gen.cardStyle || 'Естественная (по умолчанию)';
          details.push({ icon: '🎨', label: 'Стиль карточки', value: quickStyleLabel });

          // Описание товара — если пользователь что-то ввёл
          if (gen.userProductInfo && gen.userProductInfo.trim()) {
            details.push({ icon: '📝', label: 'Описание товара', value: gen.userProductInfo });
          } else {
            details.push({ icon: '📝', label: 'Описание товара', value: 'Не заполнено (ИИ определил сам)' });
          }

          // Промпт-шаблон — если был выбран
          if (gen.quickPromptName) details.push({ icon: '📋', label: 'Промпт-шаблон', value: gen.quickPromptName });
        }

        // Предметка без модели — показать товарные настройки
        if (gen.type === 'product' && !gen.withHumanModel) {
          // Категория (предметка)
          if (gen.categoryId && gen.categoryId !== 'default') {
            const catPreset = PRODUCT_CATEGORIES.find(c => c.id === gen.categoryId);
            details.push({ icon: catPreset?.emoji || '📦', label: 'Категория', value: catPreset?.label || gen.categoryId });
          }

          // Фон — для предметки
          if (gen.backgroundPreset) {
            const allBgs = [...BACKGROUND_PRESETS, ...PRODUCT_BACKGROUNDS];
            const label = findPresetLabel(gen.backgroundPreset, allBgs);
            details.push({ icon: '🖼️', label: 'Фон', value: label || gen.backgroundPreset.slice(0, 60) });
          }

          // Камера — для предметки
          if (gen.cameraAngle) {
            const label = findPresetLabel(gen.cameraAngle, CAMERA_ANGLES);
            details.push({ icon: '📷', label: 'Камера', value: label || gen.cameraAngle });
          }
        }

        // С моделью (предметка)
        if (gen.withHumanModel) details.push({ icon: '🧑', label: 'С моделью', value: 'Да' });

        // Бьюти-режим
        if (gen.isBeautyMode) details.push({ icon: '💄', label: 'Бьюти-режим', value: 'Да' });

        // Дизайн-карточка (для fashion/product)
        if (!isQuick && gen.isCardDesign) details.push({ icon: '🎨', label: 'Карточка', value: gen.cardStyle || 'стандарт' });

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
                  onClick={async () => {
                    const token = await user?.getIdToken?.();
                    await downloadImage(gen.imageUrl, `seller-studio-${gen.type}-${lightbox + 1}.jpg`, token);
                  }}
                  title="Скачать оригинал"
                >
                  ⬇️ Скачать
                </button>
                {onReuseSettings && (
                  <button
                    className="history-lb-download history-lb-reuse"
                    onClick={() => onReuseSettings(gen)}
                    title="Применить эти настройки"
                  >
                    🪄 Повторить настройки
                  </button>
                )}
                <button className="history-lb-close" onClick={() => setLightbox(null)}>✕</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
