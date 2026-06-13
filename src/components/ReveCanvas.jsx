import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import './ReveCanvas.css';

export default function ReveCanvas({ imageUrl, onClose, onEdit }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);

  // Стейт для хранения шагов рисования (для отмены)
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Resize canvas to match image dimensions
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (canvas.width !== width || canvas.height !== height) {
          // Сохраняем рисунок
          const data = canvas.toDataURL();
          canvas.width = width;
          canvas.height = height;
          // Восстанавливаем
          const img = new Image();
          img.onload = () => {
             ctx.drawImage(img, 0, 0);
          };
          img.src = data;
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Рисуем все сохраненные пути
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    paths.forEach(path => {
      ctx.beginPath();
      ctx.strokeStyle = path.color || 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = path.size || brushSize;
      
      path.points.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });

    // Рисуем текущий путь
    if (currentPath) {
      ctx.beginPath();
      ctx.strokeStyle = currentPath.color || 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = currentPath.size || brushSize;
      currentPath.points.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }
  };

  useEffect(() => {
    redrawCanvas();
  }, [paths, currentPath, brushSize]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const point = getCoordinates(e);
    setIsDrawing(true);
    setCurrentPath({
      points: [point],
      size: brushSize,
      color: 'rgba(255, 255, 255, 0.7)' // Полупрозрачный белый для видимости
    });
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const point = getCoordinates(e);
    setCurrentPath(prev => ({
      ...prev,
      points: [...prev.points, point]
    }));
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath && currentPath.points.length > 0) {
      setPaths(prev => [...prev, currentPath]);
    }
    setCurrentPath(null);
  };

  const handleClear = () => {
    setPaths([]);
    setCurrentPath(null);
  };

  const handleUndo = () => {
    setPaths(prev => prev.slice(0, -1));
  };

  const generateMaskBase64 = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    // Создаем временный канвас для черно-белой маски
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    
    // Заливаем черным фоном
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    
    // Рисуем пути белым цветом
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';
    maskCtx.strokeStyle = '#FFFFFF';
    
    paths.forEach(path => {
      maskCtx.beginPath();
      maskCtx.lineWidth = path.size;
      path.points.forEach((point, i) => {
        if (i === 0) maskCtx.moveTo(point.x, point.y);
        else maskCtx.lineTo(point.x, point.y);
      });
      maskCtx.stroke();
    });

    return maskCanvas.toDataURL('image/png');
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      alert('Пожалуйста, введите запрос для редактирования (например: "Исправь опечатку на ПРЕМИУМ")');
      return;
    }
    if (paths.length === 0) {
      alert('Пожалуйста, закрасьте область для редактирования');
      return;
    }

    const maskBase64 = generateMaskBase64();
    setIsProcessing(true);

    try {
      await onEdit(prompt, maskBase64);
      // Очищаем маску и промпт после успешного редактирования
      handleClear();
      setPrompt('');
    } catch (error) {
      alert(`Ошибка редактирования: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div 
      className="reve-canvas-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="reve-canvas-container">
        
        <div className="reve-canvas-header">
          <button className="reve-close-btn" onClick={onClose}>
            ✕ Закрыть
          </button>
          <h2>Интерактивное Редактирование</h2>
          <div className="reve-canvas-tools">
            <button className="reve-tool-btn" onClick={handleUndo} disabled={paths.length === 0 || isProcessing}>
              ↩ Отменить
            </button>
            <button className="reve-tool-btn" onClick={handleClear} disabled={paths.length === 0 || isProcessing}>
              🗑 Очистить
            </button>
          </div>
        </div>

        <div className="reve-canvas-workspace">
          <div 
            className={`reve-image-wrapper ${isProcessing ? 'processing' : ''}`}
            ref={containerRef}
          >
            <img src={imageUrl} alt="AI Generated" className="reve-base-image" draggable="false" />
            
            <canvas
              ref={canvasRef}
              className="reve-drawing-layer"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
            
            {isProcessing && (
              <div className="reve-processing-overlay">
                <div className="reve-spinner"></div>
                <p>Reve перерисовывает область...</p>
              </div>
            )}
          </div>
        </div>

        <div className="reve-canvas-footer">
          <div className="reve-prompt-box">
            <input 
              type="text" 
              placeholder="Что нужно сделать с выделенной областью? (например: замени цену на 5000 ₽)" 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isProcessing}
            />
            <button 
              className="reve-submit-btn" 
              onClick={handleSubmit}
              disabled={isProcessing || !prompt.trim() || paths.length === 0}
            >
              ✨ Редактировать
            </button>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
