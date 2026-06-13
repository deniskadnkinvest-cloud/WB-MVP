import React, { useState, useRef, useEffect } from 'react';
import { toPng } from 'html-to-image';
import './SmartCanvas.css';

export default function SmartCanvas({ imageUrl, onClose, user, setSubscription, suggestedText, initialStyle }) {
  const [style, setStyle] = useState(initialStyle || 'natural');
  const [brand, setBrand] = useState('ПРЕМИУМ');
  const [title, setTitle] = useState('АНАТОМИЧЕСКАЯ ПОДУШКА');
  const [material, setMaterial] = useState('Мягкий велюр');
  const [size, setSize] = useState('Размер: M-L');
  const [benefit, setBenefit] = useState('Анатомическая форма');
  const [price, setPrice] = useState('1 990 ₽');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const canvasRef = useRef(null);

  // Sync with suggested text when it loads
  useEffect(() => {
    if (suggestedText) {
      if (suggestedText.title) setTitle(suggestedText.title);
      if (suggestedText.material) setMaterial(suggestedText.material);
      if (suggestedText.size) setSize(suggestedText.size);
      if (suggestedText.benefit) setBenefit(suggestedText.benefit);
      if (suggestedText.price) setPrice(suggestedText.price);
    }
  }, [suggestedText]);

  const handleExport = async () => {
    if (!user) {
      setError('Необходимо войти в аккаунт');
      return;
    }
    
    setIsExporting(true);
    setError(null);

    try {
      // 1. Deduct credit
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deduct-credit', userId: user.uid, amount: 1 })
      });
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Ошибка списания кредита');
      }

      // Update local subscription balance
      setSubscription(prev => ({ ...prev, credits: data.newCredits }));

      // 2. Export DOM to Image
      if (canvasRef.current) {
        // html-to-image options to guarantee premium rendering quality
        const dataUrl = await toPng(canvasRef.current, { 
          quality: 1.0, 
          pixelRatio: 2.5, // High resolution for marketplace print
          style: {
            transform: 'scale(1)',
            transformOrigin: 'top left',
            width: canvasRef.current.offsetWidth + 'px',
            height: canvasRef.current.offsetHeight + 'px'
          }
        });
        const link = document.createElement('a');
        link.download = `card-${style}-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadCleanPhoto = () => {
    const link = document.createElement('a');
    link.download = `photo-${Date.now()}.png`;
    link.href = imageUrl;
    link.click();
  };

  return (
    <div className="smart-canvas-container">
      <div className="smart-canvas-header">
        <div className="sc-header-left">
          <div className="sc-badge">SMART CANVAS</div>
          <h2 className="sc-title">Редактор карточки товара</h2>
          <p className="sc-desc">Редактируйте тексты поверх сгенерированного ИИ дизайна. При экспорте вы получите единое изображение.</p>
        </div>
        <div className="sc-header-right">
          <div className="sc-export-badge">СКАЧИВАНИЕ: 1 КРЕДИТ</div>
        </div>
      </div>

      <div className="smart-canvas-layout">
        
        {/* Left: Preview (Live Canvas) */}
        <div className="smart-canvas-preview-col">
          <div className={`canvas-wrapper style-${style}`} ref={canvasRef}>
            
            {/* The main background image from AI (product on beautiful 3D backdrop) */}
            <img src={imageUrl} alt="Background" className="canvas-main-bg-img" />

            {style === 'natural' ? (
              <div className="natural-card-overlay">
                <div className="natural-top-section">
                  {brand && <div className="natural-brand-text">{brand}</div>}
                  <h1 className="natural-title-text">{title}</h1>
                  {benefit && <div className="natural-benefit-text">{benefit}</div>}
                </div>

                <div className="natural-bottom-section">
                  <div className="natural-details-row">
                    {material && <span className="natural-tag">{material}</span>}
                    {size && <span className="natural-tag">{size}</span>}
                  </div>
                  {price && <div className="natural-price-text">{price}</div>}
                </div>
              </div>
            ) : (
              <div className="epic-card-overlay">
                <div className="epic-left-column">
                  <div className="epic-top-group">
                    {brand && <div className="epic-brand-text">{brand}</div>}
                    <h1 className="epic-title-text">{title}</h1>
                  </div>
                  
                  <div className="epic-middle-group">
                    <div className="epic-bullets-list">
                      {material && <div className="epic-bullet-item"><span className="bullet-bullet">✦</span> {material}</div>}
                      {size && <div className="epic-bullet-item"><span className="bullet-bullet">✦</span> {size}</div>}
                      {benefit && <div className="epic-bullet-item"><span className="bullet-bullet">✦</span> {benefit}</div>}
                    </div>
                  </div>

                  <div className="epic-bottom-group">
                    {price && (
                      <div className="epic-price-wrapper">
                        <span className="price-tag-label">СПЕЦПРЕДЛОЖЕНИЕ</span>
                        <div className="epic-price-text">{price}</div>
                      </div>
                    )}
                    <div className="epic-cta-btn">КУПИТЬ</div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Right: Controls */}
        <div className="smart-canvas-controls-col">
          {/* Style Tabs inside Editor */}
          <div className="sc-style-toggle">
            <div className="sc-style-label">Дизайн карточки:</div>
            <div className="sc-style-tabs">
              <button 
                type="button"
                className={`sc-style-tab ${style === 'natural' ? 'active' : ''}`}
                onClick={() => setStyle('natural')}
              >
                🌿 Естественная
              </button>
              <button 
                type="button"
                className={`sc-style-tab ${style === 'epic' ? 'active' : ''}`}
                onClick={() => setStyle('epic')}
              >
                🔥 Эпичная
              </button>
            </div>
          </div>

          <div className="sc-rule-box">
            <h4 className="sc-rule-title">Правило режима:</h4>
            <p className="sc-rule-text">ИИ сгенерировал дизайн карточки и встроил товар. Редактируйте тексты ниже — они накладываются точно в свободные зоны без перекрытия продукта.</p>
          </div>

          <div className="sc-inputs">
            <div className="sc-input-group">
              <label className="sc-input-label">Бренд / Надпись сверху</label>
              <input 
                type="text" 
                placeholder="Например: PREMIUM" 
                value={brand} 
                onChange={e => setBrand(e.target.value)} 
                className="sc-input brand-input"
              />
            </div>

            <div className="sc-input-group">
              <label className="sc-input-label">Название товара</label>
              <input 
                type="text" 
                placeholder="Заголовок карточки" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                className="sc-input title-input"
              />
            </div>
            
            <div className="sc-input-group">
              <label className="sc-input-label">Характеристика 1 (Материал)</label>
              <input type="text" placeholder="Например: 100% Велюр" value={material} onChange={e => setMaterial(e.target.value)} className="sc-input" />
            </div>

            <div className="sc-input-group">
              <label className="sc-input-label">Характеристика 2 (Размер)</label>
              <input type="text" placeholder="Например: Размер: M-L" value={size} onChange={e => setSize(e.target.value)} className="sc-input" />
            </div>

            <div className="sc-input-group">
              <label className="sc-input-label">Главное преимущество / Оффер</label>
              <input type="text" placeholder="Например: Анатомическая форма" value={benefit} onChange={e => setBenefit(e.target.value)} className="sc-input" />
            </div>

            <div className="sc-input-group">
              <label className="sc-input-label">Цена</label>
              <input type="text" placeholder="Например: 1 990 ₽" value={price} onChange={e => setPrice(e.target.value)} className="sc-input price-input" />
            </div>
          </div>

          <div className="sc-actions">
            <button className="sc-btn-clean" onClick={downloadCleanPhoto}>
              ⬇ Скачать чистое фото
            </button>
            <button className="sc-btn-export" onClick={handleExport} disabled={isExporting}>
              {isExporting ? '⏳ Сборка и экспорт...' : 'Скачать готовую карточку • 1 кредит'}
            </button>
            {error && <div className="sc-error">{error}</div>}
          </div>
          
          <button className="sc-btn-close" onClick={onClose}>
            ← Вернуться к настройкам
          </button>
        </div>
      </div>
    </div>
  );
}
