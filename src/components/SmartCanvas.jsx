import React, { useState, useRef } from 'react';
import { toPng } from 'html-to-image';
import './SmartCanvas.css';

export default function SmartCanvas({ imageUrl, onClose, user, setSubscription }) {
  const [title, setTitle] = useState('НАЗВАНИЕ ТОВАРА');
  const [material, setMaterial] = useState('');
  const [size, setSize] = useState('');
  const [benefit, setBenefit] = useState('');
  const [price, setPrice] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const canvasRef = useRef(null);

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
        const dataUrl = await toPng(canvasRef.current, { quality: 1, pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = `card-${Date.now()}.png`;
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
          <h2 className="sc-title">Карточка без галлюцинаций</h2>
          <p className="sc-desc">Текст и цена редактируются слоями. AI больше не придумывает факты за продавца.</p>
        </div>
        <div className="sc-header-right">
          <div className="sc-export-badge">ЭКСПОРТ КАРТОЧКИ: 1 КРЕДИТ</div>
        </div>
      </div>

      <div className="smart-canvas-layout">
        
        {/* Left: Preview */}
        <div className="smart-canvas-preview-col">
          <div className="canvas-wrapper" ref={canvasRef}>
            <img src={imageUrl} alt="Background" className="canvas-bg-img" />
            
            <div className="canvas-overlay">
              <div className="canvas-brand-name">SELLER STUDIO AI</div>
              
              <div className="canvas-content-box">
                <h1 className="canvas-item-title">{title || 'НАЗВАНИЕ ТОВАРА'}</h1>
                <div className="canvas-item-subtitle">Добавьте главный оффер</div>
                
                <div className="canvas-bullets">
                  {material && <div className="canvas-bullet">• {material}</div>}
                  {size && <div className="canvas-bullet">• {size}</div>}
                  {benefit && <div className="canvas-bullet">• {benefit}</div>}
                </div>

                {price && <div className="canvas-price">{price}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="smart-canvas-controls-col">
          <div className="sc-rule-box">
            <h4 className="sc-rule-title">Правило режима:</h4>
            <p className="sc-rule-text">AI отвечает за пиксели, вы — за факты. Цена пустая, пока вы сами её не введёте.</p>
          </div>

          <div className="sc-inputs">
            <input 
              type="text" 
              placeholder="Название товара" 
              value={title === 'НАЗВАНИЕ ТОВАРА' ? '' : title} 
              onChange={e => setTitle(e.target.value)} 
              className="sc-input title-input"
            />
            <input type="text" placeholder="Материал / состав" value={material} onChange={e => setMaterial(e.target.value)} className="sc-input" />
            <input type="text" placeholder="Размер / объем" value={size} onChange={e => setSize(e.target.value)} className="sc-input" />
            <input type="text" placeholder="Главная выгода" value={benefit} onChange={e => setBenefit(e.target.value)} className="sc-input" />
            <input type="text" placeholder="Цена по желанию: 1990 ₽" value={price} onChange={e => setPrice(e.target.value)} className="sc-input price-input" />
          </div>

          <div className="sc-actions">
            <button className="sc-btn-clean" onClick={downloadCleanPhoto}>
              ⬇ Скачать чистое фото
            </button>
            <button className="sc-btn-export" onClick={handleExport} disabled={isExporting}>
              {isExporting ? '⏳ Рендер...' : 'Скачать карточку • 1 кредит'}
            </button>
            {error && <div className="sc-error">{error}</div>}
          </div>
          
          <button className="sc-btn-close" onClick={onClose}>
            ← Вернуться назад
          </button>
        </div>
      </div>
    </div>
  );
}
