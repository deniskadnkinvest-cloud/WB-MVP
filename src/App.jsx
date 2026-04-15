import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MODEL_PRESETS,
  POSE_PRESETS,
  BACKGROUND_PRESETS,
  ASPECT_RATIOS,
  GARMENT_TYPES,
  CAMERA_ANGLES,
} from './data/presets';
import './App.css';

// ═══════════════════════════════════════════
//  Статусные сообщения для "Примерочной"
// ═══════════════════════════════════════════
const PROCESSING_MESSAGES = [
  'Анализируем текстуру ткани...',
  'Выставляем студийный свет...',
  'Строим 3D-модель фигуры...',
  'Натягиваем одежду с учетом физики...',
  'Рендерим финальный кадр...',
];

function App() {
  // ═══ СОСТОЯНИЯ ═══
  const [selectedModel, setSelectedModel] = useState(MODEL_PRESETS[0]);
  const [selectedPose, setSelectedPose] = useState(POSE_PRESETS[0]);
  const [selectedBg, setSelectedBg] = useState(BACKGROUND_PRESETS[0]);
  const [selectedRatio, setSelectedRatio] = useState(ASPECT_RATIOS[0]);
  const [selectedGarment, setSelectedGarment] = useState(GARMENT_TYPES[0]);
  const [selectedCamera, setSelectedCamera] = useState(CAMERA_ANGLES[0]);

  const [customModelPrompt, setCustomModelPrompt] = useState('');

  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processedUrl, setProcessedUrl] = useState(null);

  const [generatedImage, setGeneratedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [statusText, setStatusText] = useState('');
  const [statusType, setStatusType] = useState(''); // '', 'processing', 'success', 'error'

  const fileInputRef = useRef(null);

  // ═══ ЗАГРУЗКА ФАЙЛА ═══
  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setProcessedUrl(null);
    setGeneratedImage(null);
    setStatusText('Исходник загружен. Настройте параметры и нажмите «Сгенерировать».');
    setStatusType('');
  }, []);

  const handleUploadClick = () => fileInputRef.current?.click();



  // ═══ КОНВЕРТАЦИЯ Blob -> Base64 ═══
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // ═══ АНИМАЦИЯ СТАТУСОВ ═══
  const animateProcessing = () => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < PROCESSING_MESSAGES.length) {
        setProcessingMsg(PROCESSING_MESSAGES[i]);
        i++;
      } else {
        setProcessingMsg('Финальные штрихи...');
      }
    }, 8000);
    return interval;
  };

  // ═══ ГЛАВНАЯ ГЕНЕРАЦИЯ ═══
  const handleGenerate = async () => {
    if (!imageFile) {
      console.log('Нет файла!');
      return;
    }
    
    console.log('Запускаем генерацию...');
    setIsProcessing(true);
    setGeneratedImage(null);
    setStatusText('');

    try {
      // 1) Конвертируем загруженное фото в Base64
      setProcessingMsg('Подготавливаем исходник...');
      const base64data = await blobToBase64(imageFile);
      console.log('Фото сконвертировано в Base64, отправляем на сервер...');

      // 2) Запускаем статусную анимацию
      const msgInterval = animateProcessing();

      // 3) Определяем промпт модели (кастомный или пресет)
      const modelPrompt = customModelPrompt.trim() || selectedModel.prompt;

      // 4) Отправляем на бэкенд
      setProcessingMsg('🚀 Отправляем в Nano Banano 2...');

      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelPreset: modelPrompt,
          posePreset: selectedPose.prompt,
          cameraAngle: selectedCamera.prompt,
          garmentType: selectedGarment.prompt,
          backgroundPreset: selectedBg.prompt,
          aspectRatio: selectedRatio.id,
          garmentImageBase64: base64data,
        }),
      });

      clearInterval(msgInterval);
      const data = await response.json();
      console.log('Ответ от сервера:', data.success ? 'УСПЕХ' : 'ОШИБКА', data);

      if (data.success) {
        setGeneratedImage(`data:image/jpeg;base64,${data.imageBase64}`);
        setStatusText('Студийный кадр готов!');
        setStatusType('success');
      } else {
        setStatusText(`Ошибка: ${data.details || data.error}`);
        setStatusType('error');
      }
    } catch (err) {
      console.error('Ошибка генерации:', err);
      setStatusText(`Ошибка: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  // ═══ СКАЧИВАНИЕ ═══
  const handleDownload = () => {
    if (!generatedImage) return;
    const a = document.createElement('a');
    a.href = generatedImage;
    a.download = `PANX_VTON_${Date.now()}.jpg`;
    a.click();
  };

  // ═══ РЕНДЕР ═══
  return (
    <div className="app-wrapper">
      {/* ═══ HEADER ═══ */}
      <header className="app-header">
        <motion.h1
          className="app-logo"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          PAN.X VTON
        </motion.h1>
        <p className="app-subtitle">Virtual Try-On для маркетплейсов</p>
      </header>

      {/* ═══ 1. ЗАГРУЗКА ИСХОДНИКА ═══ */}
      <motion.div
        className="section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="section-title"><span className="icon">📸</span> Загрузка одежды</div>
        <div
          className={`upload-zone ${previewUrl ? 'has-image' : ''}`}
          onClick={handleUploadClick}
        >
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          {previewUrl ? (
            <div className="preview-grid">
              <div className="preview-item">
                <h4>Оригинал</h4>
                <img src={previewUrl} alt="Original" />
              </div>
            </div>
          ) : (
            <>
              <div className="upload-icon">👕</div>
              <p className="upload-text">Нажмите, чтобы загрузить фото вещи</p>
              <p className="upload-hint">JPG, PNG • Лучше всего — flat lay или на манекене</p>
            </>
          )}
        </div>
      </motion.div>

      {/* ═══ 2. ТИП ВЕЩИ ═══ */}
      <motion.div
        className="section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="section-title"><span className="icon">🏷️</span> Тип вещи</div>
        <div className="preset-grid">
          {GARMENT_TYPES.map((g) => (
            <div
              key={g.id}
              className={`preset-card ${selectedGarment.id === g.id ? 'active' : ''}`}
              onClick={() => setSelectedGarment(g)}
            >
              <span className="label">{g.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ═══ 3. ВЫБОР МОДЕЛИ ═══ */}
      <motion.div
        className="section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="section-title"><span className="icon">👤</span> Кастинг-Рум — выбор модели</div>
        <div className="preset-grid">
          {MODEL_PRESETS.map((m) => (
            <div
              key={m.id}
              className={`preset-card ${selectedModel.id === m.id && !customModelPrompt ? 'active' : ''}`}
              onClick={() => {
                setSelectedModel(m);
                setCustomModelPrompt('');
              }}
            >
              <span className="emoji">{m.emoji}</span>
              <span className="label">{m.label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '12px' }}>
          <input
            className="custom-input"
            type="text"
            placeholder="Или опишите свою модель: «рыжая девушка 25 лет с веснушками»"
            value={customModelPrompt}
            onChange={(e) => setCustomModelPrompt(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </motion.div>

      {/* ═══ 4. ПОЗА ═══ */}
      <motion.div
        className="section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="section-title"><span className="icon">🧍</span> Поза модели</div>
        <div className="preset-grid">
          {POSE_PRESETS.map((p) => (
            <div
              key={p.id}
              className={`preset-card ${selectedPose.id === p.id ? 'active' : ''}`}
              onClick={() => setSelectedPose(p)}
            >
              <span className="emoji">{p.emoji}</span>
              <span className="label">{p.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ═══ 5. РАКУРС КАМЕРЫ ═══ */}
      <motion.div
        className="section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="section-title"><span className="icon">📷</span> Ракурс камеры</div>
        <div className="preset-grid">
          {CAMERA_ANGLES.map((c) => (
            <div
              key={c.id}
              className={`preset-card ${selectedCamera.id === c.id ? 'active' : ''}`}
              onClick={() => setSelectedCamera(c)}
            >
              <span className="label">{c.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ═══ 6. ФОН / ЛОКАЦИЯ ═══ */}
      <motion.div
        className="section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="section-title"><span className="icon">🎨</span> Фон / Локация</div>
        <div className="preset-grid">
          {BACKGROUND_PRESETS.map((b) => (
            <div
              key={b.id}
              className={`preset-card ${selectedBg.id === b.id ? 'active' : ''}`}
              onClick={() => setSelectedBg(b)}
            >
              <span className="emoji">{b.emoji}</span>
              <span className="label">{b.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ═══ 7. ФОРМАТ ═══ */}
      <motion.div
        className="section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="section-title"><span className="icon">📐</span> Формат изображения</div>
        <div className="preset-grid">
          {ASPECT_RATIOS.map((r) => (
            <div
              key={r.id}
              className={`preset-card ${selectedRatio.id === r.id ? 'active' : ''}`}
              onClick={() => setSelectedRatio(r)}
            >
              <span className="emoji">{r.icon}</span>
              <span className="label">{r.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ═══ 8. КНОПКА ГЕНЕРАЦИИ ═══ */}
      <motion.div
        className="generate-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <button
          className="generate-btn"
          onClick={handleGenerate}
          disabled={!imageFile || isProcessing}
        >
          ✨ Сгенерировать студийный кадр
        </button>

        <div className="status-bar">
          {statusText && (
            <p className={`status-text ${statusType}`}>{statusText}</p>
          )}
        </div>
      </motion.div>

      {/* ═══ 9. РЕЗУЛЬТАТ ═══ */}
      <AnimatePresence>
        {generatedImage && (
          <motion.div
            className="section result-section"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h3>Финальный Рендер</h3>
            <div className="result-image-wrap">
              <img src={generatedImage} alt="VTON Result" />
            </div>
            <button className="download-btn" onClick={handleDownload}>
              ⬇️ Скачать в высоком разрешении
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ 10. ОВЕРЛЕЙ ОБРАБОТКИ ═══ */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            className="processing-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="processing-spinner" />
            <p className="processing-status">{processingMsg}</p>
            <p className="processing-hint">Обычно занимает от 30 с до 2 мин</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
