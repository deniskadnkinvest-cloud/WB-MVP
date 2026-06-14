import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODEL_PRESETS, POSE_PRESETS, BACKGROUND_PRESETS, ASPECT_RATIOS, CAMERA_ANGLES, getModelDetails, PRODUCT_CATEGORIES, PRODUCT_COMPOSITIONS, PRODUCT_BACKGROUNDS, PRODUCT_EFFECTS } from './data/presets';
import { NATURAL_CARD_PROMPT, EPIC_CARD_PROMPT } from './data/cardPrompts';
import ModelCalibrationWizard from './components/ModelCalibrationWizard';
import GenderToggle from './components/GenderToggle';
import DetailPanel from './components/DetailPanel';
import LoraModal from './components/LoraModal';
import TerminalOfMagic from './components/TerminalOfMagic';
import LoginPage from './components/LoginPage';
import PricingModal from './components/PricingModal';
import SubscriptionBadge from './components/SubscriptionBadge';
import MyHistoryPage from './components/MyHistoryPage';
import { useAuth } from './contexts/AuthContext';
import { getModels, saveModel, deleteModelDoc, updateModelPrompt, getLocations, saveLocation, deleteLocationDoc, updateLocationPrompt } from './lib/firestoreService';
import { uploadBase64Image, compressImage, uploadImage, deleteImage } from './lib/storageService';
import { getSubscription, checkFeature, canGenerate, activatePlan } from './lib/subscriptionService';
import SmartCardEditor from './components/SmartCardEditor';
import './App.css';

const MSGS = ['Анализируем текстуру ткани...','Выставляем студийный свет...','Строим 3D-модель фигуры...','Натягиваем одежду с учетом физики...','Рендерим финальный кадр...'];
const initDetails = () => { const d={}; Object.keys(getModelDetails('female')).forEach(k=>{d[k]=null;}); return d; };

// Safe JSON parser — handles Vercel timeouts that return HTML instead of JSON
const safeParseJSON = async (resp) => {
  // Check HTTP status first
  if (resp.status === 413) {
    console.error('⚠️ 413 Payload Too Large — image files are too big');
    return { success: false, error: 'Файл слишком большой. Попробуйте фото меньшего размера.' };
  }
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    // Vercel returned HTML error page (timeout/crash)
    console.error('⚠️ Non-JSON response from API:', resp.status, text.substring(0, 200));
    if (text.includes('FUNCTION_INVOCATION_TIMEOUT') || text.includes('An error occurred')) {
      return { success: false, error: 'Сервер не успел ответить (таймаут). Попробуйте ещё раз.' };
    }
    return { success: false, error: `Ошибка сервера (${resp.status}). Попробуйте позже.` };
  }
};

function App() {
  const { user, loading, signOut, isEmbedded, isTelegram } = useAuth();

  // Subscription state
  const [subscription, setSubscription] = useState({ plan: 'none', credits: 0, creditsTotal: 0 });
  const [showPricing, setShowPricing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [cancelingSubscription, setCancelingSubscription] = useState(false);

  // App mode: 'fashion' | 'product'
  const [appMode, setAppMode] = useState('fashion');

  // Product mode selections
  const [selectedProductCategory, setSelectedProductCategory] = useState(PRODUCT_CATEGORIES[0]);
  const [selectedProductComposition, setSelectedProductComposition] = useState(PRODUCT_COMPOSITIONS[0]);
  const [selectedProductBg, setSelectedProductBg] = useState(PRODUCT_BACKGROUNDS[0]);
  const [selectedProductEffect, setSelectedProductEffect] = useState(PRODUCT_EFFECTS[0]);
  const [customProductEffectText, setCustomProductEffectText] = useState('');

  // Product mode: human model toggle
  const [productWithModel, setProductWithModel] = useState(false);
  const [productModelPreset, setProductModelPreset] = useState(MODEL_PRESETS[0]);
  const [productModelGender, setProductModelGender] = useState('female');
  const [productModelTab, setProductModelTab] = useState('presets'); // 'presets' | 'my_models'
  const [productSavedModelId, setProductSavedModelId] = useState(null);
  const [customProductModelPrompt, setCustomProductModelPrompt] = useState('');
  const [productModelDetails, setProductModelDetails] = useState(initDetails);
  const [showProductModelDetails, setShowProductModelDetails] = useState(false);

  // Custom inputs for product mode
  const [customProductPrompt, setCustomProductPrompt] = useState('');
  const [customProductBg, setCustomProductBg] = useState('');

  // Core selections
  const [selectedModel, setSelectedModel] = useState(MODEL_PRESETS[0]);
  const [selectedPose, setSelectedPose] = useState(POSE_PRESETS[0]);
  const [selectedBg, setSelectedBg] = useState(BACKGROUND_PRESETS[0]);
  const [selectedRatio, setSelectedRatio] = useState(ASPECT_RATIOS[0]);
  const [selectedCamera, setSelectedCamera] = useState(CAMERA_ANGLES[0]);

  // Gender
  const [gender, setGender] = useState('female');

  // Model details
  const [modelDetails, setModelDetails] = useState(initDetails);
  const [showDetails, setShowDetails] = useState(false);

  // Custom text inputs
  const [customModelPrompt, setCustomModelPrompt] = useState('');
  const [customPoseText, setCustomPoseText] = useState('');
  const [customBgText, setCustomBgText] = useState('');

  // Locations
  const [bgTab, setBgTab] = useState('presets');
  const [myLocations, setMyLocations] = useState([]);
  const [showLocModal, setShowLocModal] = useState(false);
  const [locName, setLocName] = useState('');
  const [locFiles, setLocFiles] = useState([]);
  const [locPreviews, setLocPreviews] = useState([]);
  const [selectedLocId, setSelectedLocId] = useState(null);
  const locFileRef = useRef(null);

  // Saved models (LoRA)
  const [modelTab, setModelTab] = useState('presets');
  const [myModels, setMyModels] = useState([]);
  const [selectedSavedModelId, setSelectedSavedModelId] = useState(null);
  const [showLoraModal, setShowLoraModal] = useState(false);
  const [loraName, setLoraName] = useState('');
  const [loraPhotos, setLoraPhotos] = useState({ front: null, left34: null, right34: null });
  const [showSaveModelModal, setShowSaveModelModal] = useState(false);
  const [saveModelName, setSaveModelName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Calibration wizard
  const [showCalibWizard, setShowCalibWizard] = useState(false);
  const [calibPurpose, setCalibPurpose] = useState('save'); // 'save' | 'photoshoot'

  // Multi-upload garments
  const [imageFiles, setImageFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [garmentUrls, setGarmentUrls] = useState([]); // Firebase Storage URLs (lightweight)
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Processing
  const [generatedImage, setGeneratedImage] = useState(null);
  const [imageHistory, setImageHistory] = useState([]); // all generated renders
  const [historyIndex, setHistoryIndex] = useState(-1); // current position in history
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [statusText, setStatusText] = useState('');
  const [statusType, setStatusType] = useState('');

  // Extra free-text for preset model
  const [extraModelPrompt, setExtraModelPrompt] = useState('');

  // Beauty mode toggle
  const [isBeautyMode, setIsBeautyMode] = useState(false);

  // Variant count (how many generations user wants)
  const [variantCount, setVariantCount] = useState(2);

  // Extra free-text for preset bg/location
  const [bgExtraText, setBgExtraText] = useState('');

  // Modifiers for saved models/locations
  const [modelModifier, setModelModifier] = useState('');
  const [showModelModifier, setShowModelModifier] = useState(false);
  const [locModifier, setLocModifier] = useState('');
  const [showLocModifier, setShowLocModifier] = useState(false);

  // Post-generation editing
  const [shotModifier, setShotModifier] = useState('');

  // Photoshoot mode
  const [photoshootImages, setPhotoshootImages] = useState([]);
  const [isPhotoshooting, setIsPhotoshooting] = useState(false);

  // Per-photo editor
  const [editingPhotoIdx, setEditingPhotoIdx] = useState(null);
  const [photoEditText, setPhotoEditText] = useState('');
  const [editingPhotos, setEditingPhotos] = useState(new Set()); // indices currently being edited (background)

  // Per-photo edit history: { [photoIndex]: [original, edit1, edit2, ...] }
  const [photoHistory, setPhotoHistory] = useState({});
  // Which version is currently shown per photo: { [photoIndex]: viewIndex }
  const [photoViewIdx, setPhotoViewIdx] = useState({});
  // Download menu open state
  const [downloadMenuIdx, setDownloadMenuIdx] = useState(null);

  // ═══ CARD DESIGNER (marketplace card) ═══
  const [cardDesignStyle, setCardDesignStyle] = useState('natural'); // 'natural' | 'epic'
  const [isCardGenerating, setIsCardGenerating] = useState(false);
  const [cardResult, setCardResult] = useState(null);
  const [showCardExamples, setShowCardExamples] = useState(false);
  const [cardVariantCount, setCardVariantCount] = useState(1);
  const [showCardCountModal, setShowCardCountModal] = useState(false);
  const [customCardCount, setCustomCardCount] = useState('');
  // Quick mode states
  const [quickCardStyle, setQuickCardStyle] = useState('natural');
  const [quickWithModel, setQuickWithModel] = useState(false);
  const [quickCardText, setQuickCardText] = useState(null);
  // [REVE_CANVAS] — Interactive AI Canvas states
  const [showSmartCanvas, setShowSmartCanvas] = useState(false);
  const [showReveCanvas, setShowReveCanvas] = useState(false);
  const [quickCleanPhoto, setQuickCleanPhoto] = useState(null); // Original clean photo before card design
  const [quickCleanPhotoUrl, setQuickCleanPhotoUrl] = useState(null); // URL for Gemini analysis
  const [reveCardImage, setReveCardImage] = useState(null); // Full Reve-generated marketplace card

  // Lightbox (gallery mode)
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [lightboxGallery, setLightboxGallery] = useState([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  const openLightboxGallery = (images, startIdx) => {
    const filtered = images.filter(Boolean);
    if (!filtered.length) return;
    setLightboxGallery(filtered);
    setLightboxIdx(Math.min(startIdx, filtered.length - 1));
    setLightboxSrc(filtered[Math.min(startIdx, filtered.length - 1)]);
  };

  // Model preview (for editing)
  const [modelPreviewSrc, setModelPreviewSrc] = useState(null);
  const [isPreviewingModel, setIsPreviewingModel] = useState(false);
  const [showModelPreviewSave, setShowModelPreviewSave] = useState(false);
  const [modelPreviewName, setModelPreviewName] = useState('');

  // ═══ TELEGRAM BACK BUTTON ═══
  // Show/hide Telegram's native back button based on app state
  useEffect(() => {
    if (!isTelegram) return;
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    const backBtn = tg.BackButton;
    // Show back button when user has generated content
    if (generatedImage || photoshootImages.length > 0) {
      backBtn.show();
      const handler = () => {
        if (photoshootImages.length > 0) {
          setPhotoshootImages([]);
        } else {
          setGeneratedImage(null);
          setImageHistory([]);
        }
      };
      backBtn.onClick(handler);
      return () => backBtn.offClick(handler);
    } else {
      backBtn.hide();
    }
  }, [isTelegram, generatedImage, photoshootImages]);

  // Load user data from Firestore (skip for guest users in embedded mode)
  useEffect(() => {
    if (!user || user.isGuest || user.isAnonymous) return;
    
    // Загружаем данные параллельно и асинхронно, не блокируя отрисовку интерфейса
    getModels(user.uid)
      .then((models) => {

        setMyModels(models || []);
      })
      .catch((err) => console.error('Ошибка загрузки моделей:', err));

    getLocations(user.uid)
      .then((locations) => {

        setMyLocations(locations || []);
      })
      .catch((err) => console.error('Ошибка загрузки локаций:', err));

    getSubscription(user.uid, user.email)
      .then((sub) => {

        if (sub) setSubscription(sub);
      })
      .catch((err) => {
        console.error('Ошибка загрузки подписки:', err);
        // Fallback to default 'none' plan so the app doesn't hang in null state
        setSubscription({ plan: 'none', credits: 0, creditsTotal: 0 });
      });
  }, [user]);

  // Обновляет баланс кредитов после генерации — переполучает подписку из Firestore
  const refreshCreditsFromResponse = async (_responseData) => {
    if (!user?.uid) return;
    try {
      const fresh = await getSubscription(user.uid, user.email);
      if (fresh) setSubscription(fresh);
    } catch (_e) {
      // Silent fail — UI balance stays until next reload
    }
  };

  // Проверка успешной оплаты ЮKassa при возврате на сайт (return_url)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      const plan = params.get('plan') || '';
      setStatusText(`⏳ Платеж обрабатывается. Ваш тариф «${plan.toUpperCase()}» активируется...`);
      setStatusType('success');

      // Очищаем параметры из адресной строки без перезагрузки
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      // Запускаем поллинг подписки в течение 12 секунд
      if (user && user.uid) {
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const sub = await getSubscription(user.uid, user.email);
            if (sub && sub.plan === plan) {
              setSubscription(sub);
              setStatusText(`✅ Тариф «${plan.toUpperCase()}» успешно активирован! Начислено ${sub.credits} кадров.`);
              setStatusType('success');
              clearInterval(interval);
            }
          } catch (e) {
            console.error('Error polling subscription:', e);
          }
          if (attempts >= 8) {
            clearInterval(interval);
          }
        }, 1500);
        return () => clearInterval(interval);
      }
    }
  }, [user]);

  // Handle plan selection from PricingModal
  const handleSelectPlan = async (planId) => {
    if (!user) return;
    setPricingLoading(true);
    try {
      // Шаг 1: Создаём платёжную сессию ЮKassa на бэкенде
      const invoiceResp = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, uid: user.uid }),
      });
      const invoiceData = await invoiceResp.json();

      if (!invoiceData.ok || !invoiceData.invoiceLink) {
        throw new Error(invoiceData.error || 'Не удалось создать платеж');
      }

      // Шаг 2: Перенаправляем пользователя на форму оплаты ЮKassa
      const paymentUrl = invoiceData.invoiceLink;
      
      setShowPricing(false);
      setStatusText('⏳ Перенаправляем на защищенную страницу оплаты ЮKassa...');
      setStatusType('success');

      if (window.Telegram?.WebApp?.openLink) {
        // Открываем платежный шлюз прямо в Telegram
        window.Telegram.WebApp.openLink(paymentUrl);
      } else {
        // Fallback для обычного веб-интерфейса
        window.location.href = paymentUrl;
      }
    } catch (err) {
      console.error('Ошибка оплаты:', err);
      setStatusText(`Ошибка: ${err.message}`);
      setStatusType('error');
    } finally {
      setPricingLoading(false);
    }
  };

  // Disable subscription auto-renew while keeping the paid period active.
  const handleCancelAutoRenew = async () => {
    if (!user) return;
    if (!window.confirm('Вы действительно хотите отключить автопродление вашей подписки?')) return;

    setCancelingSubscription(true);
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid: user.uid }),
      });
      const data = await resp.json();

      if (!data.ok) {
        throw new Error(data.error || 'Не удалось отключить автопродление');
      }

      setSubscription(prev => ({ ...prev, autoRenew: false }));
      alert('Автопродление подписки отключено. Тариф продолжит действовать до конца оплаченного периода.');
    } catch (err) {
      console.error('Failed to cancel auto-renew:', err);
      alert(err.message || 'Произошла ошибка при отмене автопродления');
    } finally {
      setCancelingSubscription(false);
    }
  };


  // Feature check helper
  const canUseFeature = (feature) => {
    if (!subscription) return false;
    return checkFeature(subscription.plan, feature);
  };

  // Reset model selection when gender changes
  useEffect(() => {
    const filtered = MODEL_PRESETS.filter(m => m.gender === gender);
    if (filtered.length > 0) { setSelectedModel(filtered[0]); setCustomModelPrompt(''); setSelectedSavedModelId(null); }
  }, [gender]);

  // Helper: convert File/Blob to base64 data URL
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Multi-file upload — try Firebase Storage first, fall back to base64
  const handleFilesChange = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newFiles = [...imageFiles, ...files].slice(0, 9);
    setImageFiles(newFiles);
    const localUrls = newFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(localUrls);
    setGeneratedImage(null);
    setStatusText('☁️ Загружаем фото...');
    setStatusType('');
    setIsUploading(true);
    try {
      const existingCount = garmentUrls.length;
      const filesToUpload = newFiles.slice(existingCount);
      const newUrls = await Promise.all(filesToUpload.map(async (f) => {
        const compressed = await compressImage(f, 1200);
        try {
          // Try Firebase Storage first
          const { url } = await uploadImage(user?.uid || 'anonymous', compressed, 'garments');
          return url;
        } catch (storageErr) {
          // Fallback: convert to base64 data URL (works without Storage)
          console.warn('⚠️ Storage unavailable, using base64 fallback:', storageErr.message);
          return await fileToBase64(compressed);
        }
      }));
      const allUrls = [...garmentUrls, ...newUrls].slice(0, 9);
      setGarmentUrls(allUrls);
      setStatusText(`Загружено ${newFiles.length} вещ${newFiles.length === 1 ? 'ь' : newFiles.length < 5 ? 'и' : 'ей'}. Все будут надеты на модель.`);
    } catch (err) {
      console.error('Upload error:', err);
      setStatusText('Ошибка загрузки. Попробуйте ещё раз.');
      setStatusType('error');
    } finally {
      setIsUploading(false);
    }
  }, [imageFiles, garmentUrls, user]);

  const removeFile = (idx) => {
    const nf = imageFiles.filter((_,i) => i !== idx);
    const nu = garmentUrls.filter((_,i) => i !== idx);
    setImageFiles(nf); setPreviewUrls(nf.map(f => URL.createObjectURL(f)));
    setGarmentUrls(nu);
    if (!nf.length) setStatusText('');
  };

  const blobToBase64 = (blob, maxSize = 1200) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onerror = rej;
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        // If already small enough, return as-is
        if (img.width <= maxSize && img.height <= maxSize) {
          res(reader.result);
          return;
        }
        // Resize through canvas
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => res(reader.result); // fallback: return raw
      img.src = reader.result;
    };
    reader.readAsDataURL(blob);
  });

  // ═══ RU→EN Prompt Mapping — ULTRA-DETAILED descriptors ═══
  // Each characteristic MUST be described in enough detail that Gemini cannot skip it.
  const DETAIL_TO_PROMPT = {
    // ─── BODY TYPE (critical — needs strongest overrides) ───
    'Худощавое': 'BODY TYPE: slim lean body with thin limbs, narrow bony shoulders, visible collarbones and wrist bones, very low body fat, elongated proportions, delicate frame. The person must look noticeably thin.',
    'Спортивное': 'BODY TYPE: athletic fit body with visibly toned muscles, defined arms and shoulders, flat toned stomach, healthy skin glow. Body of a person who exercises regularly. NOT overweight, NOT skinny.',
    'Среднее': 'BODY TYPE: average normal healthy body build, neither thin nor heavy, standard proportions, BMI 20-25. Natural everyday person, not a fitness model.',
    'Полное': 'BODY TYPE: visibly overweight plus-size body, BMI 33+, large round belly, thick heavy arms and thighs, double chin, wide torso, US clothing size 2XL-3XL, heavy-set build with visible body fat and round full face. The person MUST look noticeably fat.',
    'Мускулистое': 'BODY TYPE: muscular body with clearly visible muscle definition on arms, shoulders, chest and legs. Broad powerful shoulders, narrow waist (V-taper), low body fat 12-18%. Veins visible on forearms. Strong thick neck. The body MUST look like a fitness competitor or bodybuilder — NOT soft, NOT average, NOT overweight.',

    // ─── HAIR COLOR (specific tones, not generic words) ───
    'Брюнетка': 'HAIR: rich dark brunette brown hair color', 'Брюнет': 'HAIR: rich dark brunette brown hair color',
    'Шатенка': 'HAIR: warm chestnut medium-brown hair color with natural highlights', 'Шатен': 'HAIR: warm chestnut medium-brown hair color with natural highlights',
    'Блондинка': 'HAIR: light golden blonde hair color', 'Блондин': 'HAIR: light golden blonde hair color',
    'Рыжая': 'HAIR: vibrant red-ginger copper hair color (clearly red, not brown)', 'Рыжий': 'HAIR: vibrant red-ginger copper hair color (clearly red, not brown)',
    'Чёрные': 'HAIR: jet black hair color, deep dark without any brown tint',
    'Седые': 'HAIR: natural silver-gray hair color suggesting age 50+',

    // ─── HAIR LENGTH (explicit visual description) ───
    'Короткие': 'HAIR LENGTH: short hair above the ears, cropped close to the head',
    'Средние': 'HAIR LENGTH: medium-length hair reaching the shoulders',
    'Длинные': 'HAIR LENGTH: long flowing hair reaching well below the shoulders, past the chest',
    'Бритая': 'HAIR LENGTH: completely shaved bald head, no hair visible', 'Бритый': 'HAIR LENGTH: completely shaved bald head, no hair visible',

    // ─── EMOTION (describe facial muscles, not abstract feelings) ───
    'Нейтральная': 'EXPRESSION: neutral calm relaxed face, mouth closed, no smile, eyes looking directly at camera',
    'Лёгкая улыбка': 'EXPRESSION: gentle slight warm smile with lips slightly curved upward, soft friendly eyes',
    'Серьёзная': 'EXPRESSION: serious intense focused expression, strong direct eye contact, slight frown, no smile', 'Серьёзный': 'EXPRESSION: serious intense focused expression, strong direct eye contact, slight frown, no smile',
    'Уверенная': 'EXPRESSION: confident powerful self-assured expression, chin slightly raised, bold direct gaze, subtle commanding smile', 'Уверенный': 'EXPRESSION: confident powerful self-assured expression, chin slightly raised, bold direct gaze, subtle commanding smile',
    'Дерзкая': 'EXPRESSION: bold edgy rebellious attitude, slightly squinted eyes, smirk, defiant look', 'Дерзкий': 'EXPRESSION: bold edgy rebellious attitude, slightly squinted eyes, smirk, defiant look',

    // ─── PIERCING (specific placement and visibility) ───
    'Уши': 'PIERCING: visible small metallic stud earrings in both earlobes, must be clearly visible',
    'Нос': 'PIERCING: visible small subtle nose ring or stud piercing on one nostril, must be clearly visible',
    'Уши + Нос': 'PIERCING: visible metallic stud earrings in both earlobes AND a small nose ring/stud on one nostril — both must be clearly visible',

    // ─── TATTOO (MANDATORY visibility — these must actually appear) ───
    'Минимализм': 'TATTOO (MANDATORY — MUST BE VISIBLE): small minimalist fine-line black ink tattoos on visible skin areas such as wrists, collarbones, or fingers. The tattoos MUST be clearly visible in the final image.',
    'Рукав': 'TATTOO (MANDATORY — MUST BE VISIBLE): full detailed tattoo sleeve covering one entire arm from shoulder to wrist with intricate dark ink artwork. The tattooed arm MUST be clearly visible in the final image.',
    'Шея': 'TATTOO (MANDATORY — MUST BE VISIBLE): prominent artistic tattoo on the neck/throat area with dark ink design clearly visible against the skin. The neck tattoo MUST be unmistakably present in the final image.',
  };

  // Build detail string (supports arrays for multi-select fields like tattoo)
  const buildDetailString = (detailsOverride) => {
    const parts = [];
    const details = detailsOverride || modelDetails;
    Object.entries(details).forEach(([k, v]) => {
      // EXPLICIT NEGATIVE CONSTRAINTS — when "Нет" is selected, add hard prohibition
      if (v === 'Нет' || (Array.isArray(v) && v.length === 1 && v[0] === 'Нет')) {
        if (k === 'tattoo') {
          parts.push('absolutely NO tattoos anywhere on the body, completely clean unmarked skin, zero ink');
        }
        if (k === 'piercing') {
          parts.push('absolutely NO piercings anywhere on the body or face');
        }
        return;
      }
      if (!v) return;
      if (Array.isArray(v)) {
        const filtered = v.filter(x => x !== 'Нет');
        filtered.forEach(item => {
          parts.push(DETAIL_TO_PROMPT[item] || item);
        });
      } else {
        parts.push(DETAIL_TO_PROMPT[v] || v);
      }
    });
    // Append extra free-text if any
    if (extraModelPrompt.trim()) parts.push(extraModelPrompt.trim());
    return parts.length ? `, ${parts.join(', ')}` : '';
  };

  const handleGenerate = async () => {
    if (!imageFiles.length) return;

    // ═══ SUBSCRIPTION CHECK ═══
    if (!canGenerate(subscription)) {
      setShowPricing(true);
      setStatusText('⚡ Для генерации нужен активный тариф'); setStatusType('error');
      return;
    }
    if ((subscription.credits || 0) < variantCount) {
      setStatusText(`⚡ Недостаточно кредитов: нужно ${variantCount}, доступно ${subscription.credits || 0}`); setStatusType('error');
      return;
    }

    setIsProcessing(true); setGeneratedImage(null); setStatusText('');
    let msgI = 0;
    const iv = setInterval(() => { setProcessingMsg(msgI < MSGS.length ? MSGS[msgI++] : 'Финальные штрихи...'); }, 8000);
    try {
      setProcessingMsg('Подготавливаем исходники...');

      let modelPrompt = '';
      let posePrompt = '';
      let bgPrompt = '';
      let modelRefImages = null;
      let locImages = null;

      if (appMode === 'product') {
        // Режим предметной съемки товаров
        modelPrompt = customProductPrompt.trim() || selectedProductCategory.defaultPrompt;
        posePrompt = customPoseText.trim() || selectedProductComposition.prompt;
        bgPrompt = customProductBg.trim() || selectedProductBg.prompt;
        
        if (selectedProductEffect && selectedProductEffect.id !== 'none') {
          const effectPrompt = selectedProductEffect.id === 'custom'
            ? customProductEffectText.trim()
            : selectedProductEffect.prompt;
          if (effectPrompt) bgPrompt += `. Additionally: ${effectPrompt}`;
        }
        if (productWithModel) {
          let humanPrompt = customProductModelPrompt.trim() || productModelPreset.prompt;
          if (productSavedModelId) {
            const sm = myModels.find(m => m.id === productSavedModelId);
            if (sm) { humanPrompt = sm.prompt || humanPrompt; modelRefImages = sm.imageUrls || []; }
          }
          // humanModelPrompt будет передан отдельно
          // product description stays as-is
          // Сохраняем в отдельные переменные для передачи
          window.__humanModelPrompt = humanPrompt;
          window.__humanModelRefImages = modelRefImages;
        } else {
          window.__humanModelPrompt = null;
          window.__humanModelRefImages = null;
        }
        
        // Поддержка оцифрованных локаций для товаров
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) {
            locImages = loc.imageUrls;
            bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
            if (selectedProductEffect && selectedProductEffect.id !== 'none') {
              const effectPrompt = selectedProductEffect.id === 'custom'
                ? customProductEffectText.trim()
                : selectedProductEffect.prompt;
              if (effectPrompt) bgPrompt += `. Additionally: ${effectPrompt}`;
            }
          }
        }
      } else {
        // Режим одежды (VTON)
        modelPrompt = customModelPrompt.trim() || (selectedModel.prompt + buildDetailString());
        if (selectedSavedModelId) {
          const sm = myModels.find(m => m.id === selectedSavedModelId);
          if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = sm.imageUrls || []; }
        }
        if (modelModifier.trim()) modelPrompt += `. Additionally: ${modelModifier.trim()}`;

        posePrompt = customPoseText.trim() || selectedPose.prompt;
        bgPrompt = customBgText.trim() || selectedBg.prompt;
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) {
            locImages = loc.imageUrls;
            bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
          }
        }
        if (locModifier.trim()) bgPrompt += `. Additionally: ${locModifier.trim()}`;
        if (bgExtraText.trim() && !customBgText.trim()) bgPrompt += `. MANDATORY SCENE ADDITION (must be visible): ${bgExtraText.trim()}`;
      }

      setProcessingMsg('🚀 Отправляем в Nano Banano 2...');

      // Generate N variants in parallel based on user choice
      const seeds = Array.from({ length: variantCount }, () =>
        Math.random().toString(36).substring(2, 10).toUpperCase()
      );
      const buildBody = (seed) => JSON.stringify({
        userId: user?.uid || null,
        garmentImageUrls: garmentUrls, modelPreset: modelPrompt, posePreset: posePrompt,
        cameraAngle: selectedCamera.prompt, backgroundPreset: bgPrompt,
        aspectRatio: selectedRatio.id, modelReferenceImages: modelRefImages,
        locationImages: locImages, customPoseText: customPoseText.trim() || undefined,
        attributes: appMode === 'product' ? productModelDetails : modelDetails, isBeautyMode, biometricSeed: seed,
        isProductMode: appMode === 'product',
        categoryId: appMode === 'product' ? selectedProductCategory.id : undefined,
        withHumanModel: appMode === 'product' && productWithModel,
        humanModelPrompt: window.__humanModelPrompt || undefined,
        humanModelRefImages: window.__humanModelRefImages || undefined,
      });

      const results = await Promise.all(seeds.map(seed =>
        fetch('/api/generate-image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: buildBody(seed),
        }).then(r => safeParseJSON(r)).catch(err => ({ success: false, error: err.message }))
      ));
      clearInterval(iv);

      const successImages = results
        .filter(d => d.success)
        .map(d => d.imageUrl || d.imageBase64);

      if (successImages.length > 0) {
        // Кредиты уже списаны бэкендом — обновляем баланс из Firestore
        const firstSuccess = results.find(d => d.success);
        refreshCreditsFromResponse(firstSuccess || {});

        const VARIANT_LABELS = ['A', 'B', 'C', 'D'];
        setGeneratedImage(successImages[0]);
        setImageHistory(prev => {
          const h = [...prev, ...successImages.map((img, i) => ({ image: img, label: `🎨 Вариант ${VARIANT_LABELS[i] || (i + 1)}` }))];
          setHistoryIndex(h.length - successImages.length);
          return h;
        });
        const pluralForm = successImages.length === 1 ? '' : (successImages.length < 5 ? 'а — листайте ◀▶' : ' — листайте ◀▶');
        setStatusText(`Готово! ${successImages.length} вариант${pluralForm}`); setStatusType('success');
      }
      else { setStatusText(`Ошибка: ${results[0]?.details||results[0]?.error||'unknown'}`); setStatusType('error'); }
    } catch (err) { setStatusText(`Ошибка: ${err.message}`); setStatusType('error'); clearInterval(iv);
    } finally { setIsProcessing(false); }
  };

  const handleDownload = () => { if (!generatedImage) return; const a = document.createElement('a'); a.href = generatedImage; a.download = `SellerStudio_${Date.now()}.jpg`; a.click(); };

  // Location helpers
  const handleLocFiles = async (files) => {
    const arr = Array.from(files).slice(0, 5);
    setLocFiles(arr);
    setLocPreviews(arr.map(f => URL.createObjectURL(f)));
  };

  const saveLoc = async () => {
    if (!locName.trim() || locFiles.length < 2 || !user) return;
    setIsSaving(true);
    try {
      const uploads = await Promise.all(locFiles.map(async (f) => {
        const compressed = await compressImage(f, 800);
        return uploadImage(user.uid, compressed, 'locations');
      }));
      const imageUrls = uploads.map(u => u.url);
      const storagePaths = uploads.map(u => u.path);
      await saveLocation(user.uid, { title: locName.trim(), imageUrls, storagePaths, thumbnail: imageUrls[0] });
      const locations = await getLocations(user.uid);
      setMyLocations(locations);
      setShowLocModal(false); setLocName(''); setLocFiles([]); setLocPreviews([]);
    } catch (err) { console.error('Ошибка сохранения локации:', err); }
    finally { setIsSaving(false); }
  };

  const deleteLoc = async (id) => {
    if (!user) return;
    const loc = myLocations.find(l => l.id === id);
    if (loc?.storagePaths) { await Promise.all(loc.storagePaths.map(p => deleteImage(p))); }
    await deleteLocationDoc(user.uid, id);
    setMyLocations(prev => prev.filter(l => l.id !== id));
    if (selectedLocId === id) setSelectedLocId(null);
  };

  // LoRA model save (Firebase)
  const saveLoraModel = async () => {
    if (!loraName.trim() || !user) return;
    setIsSaving(true);
    try {
      const photoEntries = Object.entries(loraPhotos).filter(([, v]) => v);
      const uploads = await Promise.all(photoEntries.map(async ([, base64]) => {
        return uploadBase64Image(user.uid, base64, 'models');
      }));
      const imageUrls = uploads.map(u => u.url);
      const storagePaths = uploads.map(u => u.path);
      await saveModel(user.uid, { name: loraName.trim(), type: 'lora', imageUrls, storagePaths, prompt: '' });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowLoraModal(false); setLoraName(''); setLoraPhotos({ front: null, left34: null, right34: null });
    } catch (err) { console.error('Ошибка сохранения модели:', err); }
    finally { setIsSaving(false); }
  };

  // Save generated model (Firebase)
  const saveGenModel = async () => {
    if (!saveModelName.trim() || !generatedImage || !user) return;
    setIsSaving(true);
    try {
      const { url, path } = await uploadBase64Image(user.uid, generatedImage, 'models');
      const mp = customModelPrompt.trim() || (selectedModel.prompt + buildDetailString());
      await saveModel(user.uid, { name: saveModelName.trim(), type: 'generated', imageUrls: [url], storagePaths: [path], prompt: mp });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowSaveModelModal(false); setSaveModelName('');
    } catch (err) { console.error('Ошибка сохранения модели:', err); }
    finally { setIsSaving(false); }
  };

  // Save calibrated model from wizard (3-angle photos)
  const saveCalibratedModel = async (name, photos, prompt) => {
    if (!user) {
      throw new Error('Пользователь не авторизован. Войдите в аккаунт.');
    }
    setIsSaving(true);
    try {

      const photoEntries = Object.entries(photos).filter(([, v]) => v);
      // Upload all photos and track which key maps to which URL
      const uploadResults = await Promise.all(
        photoEntries.map(async ([key, base64]) => {
          const result = await uploadBase64Image(user.uid, base64, 'models');
          return { key, ...result };
        })
      );
      const imageUrls = uploadResults.map(u => u.url);
      const storagePaths = uploadResults.map(u => u.path);
      // fullbodyUrl — отдельное поле для удобного отображения превью в галерее
      const fullbodyEntry = uploadResults.find(u => u.key === 'fullbody');
      const fullbodyUrl = fullbodyEntry?.url || null;
      await saveModel(user.uid, {
        name,
        type: 'calibrated',
        imageUrls,
        storagePaths,
        prompt: prompt || '',
        ...(fullbodyUrl ? { fullbodyUrl } : {}),
      });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowCalibWizard(false);
      setStatusText('✅ Откалиброванная модель сохранена!');
      setStatusType('success');

    } catch (err) {
      console.error('Ошибка сохранения модели:', err);
      setStatusText('Ошибка сохранения модели');
      setStatusType('error');
      throw err; // Re-throw so wizard can show the error
    } finally {
      setIsSaving(false);
    }
  };

  // Open calibration wizard
  const openCalibration = (purpose = 'save') => {
    setCalibPurpose(purpose);
    setShowCalibWizard(true);
  };

  // Get current model prompt for calibration
  const getCurrentModelPrompt = () => {
    if (appMode === 'product') {
      // Product mode: use human model settings, not product settings
      if (customProductModelPrompt?.trim()) return customProductModelPrompt.trim();
      if (productSavedModelId) {
        const sm = myModels.find(m => m.id === productSavedModelId);
        if (sm?.prompt) return sm.prompt;
      }
      // Include detail panel settings (hair color, build, emotion, etc.)
      const basePrompt = productModelPreset?.prompt || MODEL_PRESETS[0].prompt;
      return basePrompt + buildDetailString(productModelDetails);
    }
    // Fashion mode
    if (customModelPrompt.trim()) return customModelPrompt.trim();
    if (selectedSavedModelId) {
      const sm = myModels.find(m => m.id === selectedSavedModelId);
      if (sm?.prompt) return sm.prompt;
    }
    return selectedModel.prompt + buildDetailString();
  };

  // Get current model ref images for calibration
  // CRITICAL: Do NOT include generatedImage — it may contain product objects (cups, bottles etc.)
  // Only include clean model reference photos from saved models.
  const getCurrentModelRefs = () => {
    const refs = [];
    if (appMode === 'product') {
      // Product mode: use product model's saved refs
      if (productSavedModelId) {
        const sm = myModels.find(m => m.id === productSavedModelId);
        if (sm?.imageUrls) refs.push(...sm.imageUrls);
      }
    } else {
      // Fashion mode: use fashion model's saved refs
      if (selectedSavedModelId) {
        const sm = myModels.find(m => m.id === selectedSavedModelId);
        if (sm?.imageUrls) refs.push(...sm.imageUrls);
      }
    }
    return refs;
  };

  const deleteModel = async (id) => {
    if (!user) return;
    const model = myModels.find(m => m.id === id);
    if (model?.storagePaths) { await Promise.all(model.storagePaths.map(p => deleteImage(p))); }
    await deleteModelDoc(user.uid, id);
    setMyModels(prev => prev.filter(m => m.id !== id));
    if (selectedSavedModelId === id) setSelectedSavedModelId(null);
  };

  const filteredModels = MODEL_PRESETS.filter(m => m.gender === gender);

  // Preview model with modifications (generates a portrait)
  const handlePreviewModel = async () => {
    if (!user || !selectedSavedModelId || !modelModifier.trim()) return;
    setIsPreviewingModel(true); setModelPreviewSrc(null);
    const sm = myModels.find(m => m.id === selectedSavedModelId);
    const prompt = ((sm?.prompt || '') + '. Additionally: ' + modelModifier.trim()).trim();
    try {
      const refImgs = sm?.imageUrls || [];
      // Use loaded garments if available, otherwise send previewMode
      let garmentUrlsForPreview = garmentUrls.slice(0, 1);
      const resp = await fetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || null,
          garmentImageUrls: garmentUrlsForPreview,
          previewMode: garmentUrlsForPreview.length === 0,
          modelPreset: prompt + '. Generate a fashion model portrait wearing simple casual clothing.',
          posePreset: 'standing straight, facing camera, neutral pose',
          cameraAngle: 'medium shot waist up', backgroundPreset: 'clean white studio',
          aspectRatio: '3:4', modelReferenceImages: refImgs,
        }),
      });
      const data = await safeParseJSON(resp);
      if (data.success) {
        setModelPreviewSrc(data.imageUrl || data.imageBase64);
        setStatusText('Превью модели готово! Сохранить как новую?'); setStatusType('success');
      } else { setStatusText(`Ошибка: ${data.details||data.error}`); setStatusType('error'); }
    } catch (err) { setStatusText(`Ошибка: ${err.message}`); setStatusType('error'); }
    finally { setIsPreviewingModel(false); }
  };

  // Save modified model as NEW (does not overwrite original)
  const saveModelAsNew = async () => {
    if (!user || !modelPreviewSrc || !modelPreviewName.trim()) return;
    setIsSaving(true);
    try {
      const sm = myModels.find(m => m.id === selectedSavedModelId);
      const newPrompt = ((sm?.prompt || '') + '. Additionally: ' + modelModifier.trim()).trim();
      const { url, path } = await uploadBase64Image(user.uid, modelPreviewSrc, 'models');
      await saveModel(user.uid, { name: modelPreviewName.trim(), type: 'generated', imageUrls: [url], storagePaths: [path], prompt: newPrompt });
      const models = await getModels(user.uid);
      setMyModels(models);
      setModelPreviewSrc(null); setModelPreviewName(''); setModelModifier(''); setShowModelModifier(false);
      setShowModelPreviewSave(false);
      setStatusText('✅ Новая модель сохранена!'); setStatusType('success');
    } catch (err) { console.error(err); setStatusText('Ошибка сохранения'); setStatusType('error'); }
    finally { setIsSaving(false); }
  };

  // Save location modifier to Firestore
  const saveLocMod = async () => {
    if (!user || !selectedLocId || !locModifier.trim()) return;
    const loc = myLocations.find(l => l.id === selectedLocId);
    const newPrompt = ((loc?.prompt || '') + '. Additionally: ' + locModifier.trim()).trim();
    try {
      await updateLocationPrompt(user.uid, selectedLocId, newPrompt);
      setMyLocations(prev => prev.map(l => l.id === selectedLocId ? { ...l, prompt: newPrompt } : l));
      setLocModifier('');
      setStatusText('✅ Изменения локации сохранены!'); setStatusType('success');
    } catch (err) { console.error(err); setStatusText('Ошибка сохранения'); setStatusType('error'); }
  };

  // Re-generate with shot modifier (iterative editing)
  const handleRegenerate = async () => {
    if (!shotModifier.trim() || !imageFiles.length) return;

    // ═══ SUBSCRIPTION CHECK ═══
    if (!canGenerate(subscription)) {
      setShowPricing(true);
      setStatusText('⚡ Для генерации нужен активный тариф'); setStatusType('error');
      return;
    }

    setIsProcessing(true);
    // DON'T clear generatedImage here — preserve it in case of error
    setStatusText('');
    let msgI = 0;
    const iv = setInterval(() => { setProcessingMsg(msgI < MSGS.length ? MSGS[msgI++] : 'Финальные штрихи...'); }, 8000);

    try {
      setProcessingMsg('Подготавливаем исходники...');

      let modelPrompt = '';
      let posePrompt = '';
      let bgPrompt = '';
      let modelRefImages = null;
      let locImages = null;
      const mod = shotModifier.trim();

      if (appMode === 'product') {
        // Товарный режим
        modelPrompt = customProductPrompt.trim() || selectedProductCategory.defaultPrompt;
        posePrompt = customPoseText.trim() || selectedProductComposition.prompt;
        bgPrompt = customProductBg.trim() || selectedProductBg.prompt;
        
        if (selectedProductEffect && selectedProductEffect.id !== 'none') {
          const effectPrompt = selectedProductEffect.id === 'custom'
            ? customProductEffectText.trim()
            : selectedProductEffect.prompt;
          if (effectPrompt) bgPrompt += `. Additionally: ${effectPrompt}`;
        }
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) {
            locImages = loc.imageUrls;
            bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
            if (selectedProductEffect && selectedProductEffect.id !== 'none') {
              const effectPrompt2 = selectedProductEffect.id === 'custom'
                ? customProductEffectText.trim()
                : selectedProductEffect.prompt;
              if (effectPrompt2) bgPrompt += `. Additionally: ${effectPrompt2}`;
            }
          }
        }
        
        // Применение правок пользователя к товару или фону
        const bgKeywords = /(?:фон|задний|пляж|улиц|город|парк|лес|горы|интерьер|студи|background|beach|street|city|park|forest|mountain|interior|studio|wood|marble|table|desk|neon|droplets|splash|petals|glow)/i;
        if (bgKeywords.test(mod)) {
          bgPrompt += `. Additionally: ${mod}`;
        } else {
          modelPrompt += `. Additionally: ${mod}`;
        }
      } else {
        // Режим одежды (VTON)
        modelPrompt = customModelPrompt.trim() || (selectedModel.prompt + buildDetailString());
        if (selectedSavedModelId) {
          const sm = myModels.find(m => m.id === selectedSavedModelId);
          if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = sm.imageUrls || []; }
        }

        posePrompt = customPoseText.trim() || selectedPose.prompt;
        const poseKeywords = /(?:поз[аеуы]|сид(?:ит|я|еть)|стоит|лежит|идёт|идет|ходит|бежит|танцу|прыга|lotus|sitting|standing|lying|walking|running|dancing|crouching|leaning|kneeling|jumping|squat)/i;
        if (poseKeywords.test(mod)) {
          posePrompt = `${mod}. ${posePrompt}`;
        }

        bgPrompt = customBgText.trim() || selectedBg.prompt;
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) {
            locImages = loc.imageUrls;
            bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
          }
        }
        if (locModifier.trim()) bgPrompt += `. Additionally: ${locModifier.trim()}`;
        if (bgExtraText.trim() && !customBgText.trim()) bgPrompt += `. MANDATORY SCENE ADDITION (must be visible): ${bgExtraText.trim()}`;

        const bgKeywords = /(?:фон|бали|пляж|улиц|город|парк|лес|горы|интерьер|студи|background|beach|street|city|park|forest|mountain|interior|studio)/i;
        if (bgKeywords.test(mod)) {
          bgPrompt += `. ${mod}`;
        }
      }

      setProcessingMsg('🚀 Отправляем в Nano Banano 2...');
      // ═══ STATELESS REGENERATION ═══
      // NEVER send the generated photo back as reference — it creates "Visual Attention Sink"
      // where Gemini locks onto the photorealistic result and refuses to change body geometry.
      // Instead, we re-send ONLY the original garment photos + text edit instruction.
      // Gemini will regenerate the body from scratch with new metrics.
      const editRefImages = modelRefImages ? [...modelRefImages] : [];

      const biometricSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
      const resp = await fetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || null,
          garmentImageUrls: garmentUrls, modelPreset: modelPrompt, posePreset: posePrompt,
          cameraAngle: selectedCamera.prompt, backgroundPreset: bgPrompt,
          aspectRatio: selectedRatio.id, modelReferenceImages: editRefImages.length > 0 ? editRefImages : null,
          locationImages: locImages,
          editInstruction: mod,
          attributes: appMode === 'product' ? productModelDetails : modelDetails, isBeautyMode, biometricSeed,
          isProductMode: appMode === 'product',
          categoryId: appMode === 'product' ? selectedProductCategory.id : undefined,
        }),
      });
      clearInterval(iv);
      const data = await safeParseJSON(resp);
      if (data.success) {
        // Кредиты уже списаны бэкендом — обновляем баланс из ответа
        refreshCreditsFromResponse(data);

        const newImg = data.imageUrl || data.imageBase64;
        setGeneratedImage(newImg);
        const editLabel = shotModifier.trim() || 'Перегенерация';
        setImageHistory(prev => { const h = [...prev, { image: newImg, label: editLabel }]; setHistoryIndex(h.length - 1); return h; });
        setStatusText('Кадр обновлён!');
        setStatusType('success');
      } else {
        setStatusText(`Ошибка: ${data.details || data.error}`);
        setStatusType('error');
      }
    } catch (err) {
      setStatusText(`Ошибка: ${err.message}`);
      setStatusType('error');
      clearInterval(iv);
    } finally {
      setIsProcessing(false);
      setShotModifier('');
    }
  };

  // ═══ CARD DESIGN — show count modal first ═══
  const handleCardDesignClick = () => {
    if (!generatedImage) return;
    setShowCardCountModal(true);
    setCustomCardCount('');
  };

  const startCardGeneration = async (count) => {
    setShowCardCountModal(false);
    if (!generatedImage) return;
    
    const totalCredits = count;
    // Credit check
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < totalCredits && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`⚡ Для ${count} карточек нужно ${totalCredits} кредитов`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < totalCredits) {
      setStatusText(`⚡ Для ${count} карточек нужно ${totalCredits} кредитов`); setStatusType('error');
      return;
    }

    setIsCardGenerating(true);
    setCardResult(null);
    setStatusText(`🎴 Создаём ${count > 1 ? count + ' карточек' : 'карточку'}...`);
    setStatusType('processing');

    const progressSteps = ['🎴 Анализируем товар...', '🎨 Подбираем стиль...', '✍️ Генерируем типографику...', '📐 Компонуем макет...', '✨ Финальная полировка...'];
    let stepIdx = 0;
    const iv = setInterval(() => {
      stepIdx = (stepIdx + 1) % progressSteps.length;
      setStatusText(progressSteps[stepIdx]);
    }, 8000);

    try {
      // Run N parallel card generation requests
      const isBase64 = generatedImage && generatedImage.startsWith('data:');
      const promises = Array.from({ length: count }, () =>
        fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            isCardDesign: true,
            cardStyle: cardDesignStyle,
            ...(isBase64
              ? { sourceImageBase64: generatedImage }
              : { sourceImageUrl: generatedImage }),
          }),
        }).then(r => r.json())
      );
      
      const results = await Promise.all(promises);
      clearInterval(iv);
      
      const successCards = results.filter(d => d.success).map(d => d.imageUrl);
      
      if (successCards.length > 0) {
        // Кредиты уже списаны бэкендом — обновляем баланс из ответа
        const lastCard = results.find(d => d.success && d.creditsRemaining != null);
        refreshCreditsFromResponse(lastCard || results.find(d => d.success));
        setCardResult(successCards);
        setStatusText(`🎴 Готово! ${successCards.length} ${successCards.length === 1 ? 'карточка' : 'карточек'}`);
        setStatusType('success');
      } else {
        const firstError = results.find(d => !d.success);
        setStatusText(`Ошибка: ${firstError?.error || 'Не удалось создать карточку'}`);
        setStatusType('error');
      }
    } catch (err) {
      clearInterval(iv);
      setStatusText(`Ошибка: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsCardGenerating(false);
    }
  };

  // ═══ QUICK MODE — two-click card generation ═══
  const handleQuickGenerate = async () => {
    if (!garmentUrls.length) {
      setStatusText('Сначала загрузите фото товара'); setStatusType('error');
      return;
    }
    // [SMART_QUICK_MODE_2.0] — Hero-First: only 1 credit for clean photo
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < 1 && !subscription?.local) {
      setShowPricing(true);
      setStatusText('⚡ Для генерации нужен 1 кредит'); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < 1) {
      setStatusText('⚡ Для генерации нужен 1 кредит'); setStatusType('error');
      return;
    }

    setIsProcessing(true);
    setGeneratedImage(null);
    setCardResult(null);
    setQuickCardText(null); // Reset any previous text
    setShowSmartCanvas(false); // Hide editor if was open
    setStatusText('⚡ Генерируем студийное фото...');
    setStatusType('processing');

    const step1Messages = ['📦 Обрабатываем фото товара...', '📸 Создаём студийный кадр...', '🎨 Оптимизируем свет и тени...', '✨ Финализируем композицию...'];
    let stepIdx = 0;
    let iv = setInterval(() => {
      stepIdx = (stepIdx + 1) % step1Messages.length;
      setStatusText(step1Messages[stepIdx]);
    }, 5000);

    try {
      // Hero-First: Generate ONLY the clean studio photo
      const step1Resp = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || null,
          isProductMode: true,
          categoryId: selectedProductCategory?.id || 'default',
          garmentImageUrls: garmentUrls,
          withHumanModel: quickWithModel,
          humanModelPrompt: quickWithModel ? (getCurrentModelPrompt() || 'professional model in their 20s') : '',
          backgroundPreset: 'clean minimalist white cyclorama studio background',
          posePreset: 'centered product shot, professional e-commerce framing',
          aspectRatio: '3:4',
        }),
      });
      clearInterval(iv);
      const step1Data = await safeParseJSON(step1Resp);

      if (!step1Data.success) {
        throw new Error(step1Data.error || 'Не удалось создать студийное фото товара');
      }

      const productPhotoUrl = step1Data.imageUrl;
      const productPhotoDisplay = step1Data.imageBase64 || productPhotoUrl;
      if (productPhotoDisplay) {
        setGeneratedImage(productPhotoDisplay);
        setQuickCleanPhoto(productPhotoDisplay); // Save clean photo for later
        setQuickCleanPhotoUrl(productPhotoUrl); // Save URL for Gemini analysis
        setImageHistory([{ image: productPhotoDisplay, label: '📸 Студийное фото' }]);
        setHistoryIndex(0);
      }
      refreshCreditsFromResponse(step1Data);

      // [SMART_QUICK_MODE_2.0] — NO auto text/design generation!
      // User sees clean photo first. Typography is triggered on-demand via "Add Design" button.
      setStatusText('✅ Студийное фото готово! Скачайте или добавьте продающий дизайн.');
      setStatusType('success');
    } catch (err) {
      clearInterval(iv);
      if (err.name === 'AbortError') {
        setStatusText('❌ Генерация отменена. Кредиты не списаны.');
      } else {
        setStatusText(`Ошибка: ${err.message}`);
      }
      setStatusType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  // [SMART_QUICK_MODE_2.0] — Lazy Typography: triggered ONLY by user click
  const handleAddDesign = async () => {
    if (!generatedImage) return;

    setIsCardGenerating(true);
    setStatusText('🪄 Reve AI создаёт карточку маркетплейса...');
    setStatusType('processing');

    const progressMessages = [
      '✨ Анализируем товар...',
      '🎨 Reve генерирует дизайн...',
      '✍️ Добавляем продающие тексты...',
      '📐 Финализируем карточку...',
      '🔥 Почти готово...',
    ];
    let msgIdx = 0;
    const iv = setInterval(() => {
      msgIdx = (msgIdx + 1) % progressMessages.length;
      setStatusText(progressMessages[msgIdx]);
    }, 3500);

    try {
      // ── REVE MARKETPLACE CARD PROMPT ────────────────────────────
      // Используем профессиональные промпты из файлов промптов
      const revePrompt = quickCardStyle === 'epic' ? EPIC_CARD_PROMPT : NATURAL_CARD_PROMPT;

      const resp = await fetch('/api/reve-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remix',
          prompt: revePrompt,
          imageBase64: generatedImage,
          strength: 0.72,
        }),
      });

      clearInterval(iv);
      const data = await resp.json();

      if (data.success && data.imageBase64) {
        // ✅ Reve вернул готовую карточку
        setReveCardImage(data.imageBase64);
        setShowReveCanvas(true);
        setStatusText('✅ Карточка готова! Выделите область кистью для редактирования.');
        setStatusType('success');
      } else {
        // ⚠️ MOCK режим — Reve нет кредитов или другая ошибка
        // Используем оригинальное фото как "карточку" → UX всё равно работает
        console.warn('[Reve] Fallback to mock mode:', data.error);
        setReveCardImage(generatedImage);
        setShowReveCanvas(true);
        setStatusText('🎨 Редактор открыт! (Пополни баланс Reve для генерации карточки)');
        setStatusType('success');
      }
    } catch (err) {
      clearInterval(iv);
      // Даже при ошибке открываем редактор с исходным фото (mock)
      console.error('[Reve] Error, falling back to mock:', err);
      setReveCardImage(generatedImage);
      setShowReveCanvas(true);
      setStatusText('🎨 Редактор открыт в режиме предпросмотра');
      setStatusType('success');
    } finally {
      setIsCardGenerating(false);
    }
  };


  // Auto-Catalog integration
  const handleAutoCatalog = async () => {
    if (!garmentUrls.length) {
      setStatusText('Сначала загрузите фото одежды'); setStatusType('error');
      return;
    }
    
    // ═══ SUBSCRIPTION CHECK (requires 3 credits) ═══
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < 3 && !subscription?.local) {
      setShowPricing(true);
      setStatusText('⚡ Для автокаталога требуется минимум 3 кредита'); setStatusType('error');
      return;
    }
    if (subscription?.local && (subscription.credits || 0) < 3) {
      setStatusText('⚡ Для автокаталога требуется минимум 3 кредита'); setStatusType('error');
      return;
    }

    setStatusText('Отправка батча в Auto-Catalog...'); setStatusType('');
    
    // Transform uploaded garment URLs into SKU items
    const items = garmentUrls.map((url, i) => ({
      skuId: `SKU-${Date.now()}-${i}`,
      name: `Товар ${i + 1}`,
      imageUrl: url
    }));

    try {
      // NOTE: We point to the standalone auto-catalog server (port 3002)
      // In production this would be unified or routed via Vercel Edge
      const resp = await fetch('/api/auto-catalog/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          sellerId: user?.uid || 'test_seller_001',
          vibe: customBgText.trim() || selectedBg.prompt
        })
      });
      const data = await resp.json();
      if (data.success) {
        // Списание 3 кредитов (локальный сервер — используем оптимистичное списание)
        setSubscription(prev => ({ ...prev, credits: Math.max(0, (prev.credits || 0) - 3) }));

        setStatusText(`✅ Auto-Catalog запущен! Батч отправлен на фоновую обработку.`);
        setStatusType('success');
      } else {
        setStatusText(`❌ Ошибка: ${data.error}`);
        setStatusType('error');
      }
    } catch (err) {
      setStatusText(`❌ Ошибка сети: ${err.message}. Убедитесь что сервер на порту 3002 запущен.`);
      setStatusType('error');
    }
  };

  // Photoshoot mode: 5 parallel generations
  const PHOTOSHOOT_ANGLES = [
    { pose: 'close-up portrait shot, looking directly at camera, confident expression', camera: 'close-up portrait' },
    { pose: 'full body shot, walking towards camera, dynamic fashion stride', camera: 'full body front' },
    { pose: 'elegant side profile, relaxed posture, one hand on hip', camera: 'side profile medium' },
    { pose: 'low angle power shot, confident stance, dramatic perspective', camera: 'low angle full body' },
    { pose: 'over-the-shoulder glance back at camera, dynamic fabric movement', camera: '3/4 back view' },
  ];

  const PRODUCT_PHOTOSHOOT_ANGLES = [
    { pose: 'front-facing centered still life shot, razor-sharp focus on the label, studio lighting', camera: 'front still life' },
    { pose: 'extreme close-up macro shot, focus on branding and liquid droplets, shallow depth of field', camera: 'close-up macro' },
    { pose: 'flat lay top-down perspective, arranged beautifully next to raw organic ingredients', camera: 'flat lay' },
    { pose: 'dynamic 3/4 angled product shot, volumetric dramatic lighting, soft shadows', camera: '3/4 angle' },
    { pose: 'a hand holding the product container in a cozy bright lifestyle setting', camera: 'held in hand' },
  ];

  const handlePhotoshoot = async (count = 5) => {
    if (!imageFiles.length || isPhotoshooting) return;
    setIsPhotoshooting(true);
    
    const angles = appMode === 'product'
      ? PRODUCT_PHOTOSHOOT_ANGLES.slice(0, count)
      : PHOTOSHOOT_ANGLES.slice(0, count);

    // APPEND: add null placeholders for new batch at the end of existing gallery
    const existingCount = photoshootImages.filter(Boolean).length;
    setPhotoshootImages(prev => [...prev.filter(Boolean), ...new Array(count).fill(null)]);
    setStatusText(`📸 Генерируем ещё ${count} кадров...`); setStatusType('');
    try {
      let modelPrompt = '';
      let bgPrompt = '';
      let modelRefImages = null;
      let locImages = null;

      if (appMode === 'product') {
        modelPrompt = customProductPrompt.trim() || selectedProductCategory.defaultPrompt;
        bgPrompt = customProductBg.trim() || selectedProductBg.prompt;
        if (selectedProductEffect && selectedProductEffect.id !== 'none') {
          const effectPrompt = selectedProductEffect.id === 'custom'
            ? customProductEffectText.trim()
            : selectedProductEffect.prompt;
          if (effectPrompt) bgPrompt += `. Additionally: ${effectPrompt}`;
        }
        // Модель-человек в фотосессии товаров
        if (productWithModel) {
          let humanPrompt = customProductModelPrompt.trim() || productModelPreset.prompt;
          if (productSavedModelId) {
            const sm = myModels.find(m => m.id === productSavedModelId);
            if (sm) { humanPrompt = sm.prompt || humanPrompt; modelRefImages = sm.imageUrls || []; }
          }
          window.__humanModelPrompt = humanPrompt;
          window.__humanModelRefImages = modelRefImages;
        } else {
          window.__humanModelPrompt = null;
          window.__humanModelRefImages = null;
        }
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) {
            locImages = loc.imageUrls;
            bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
            if (selectedProductEffect && selectedProductEffect.id !== 'none') {
              const effectPromptLoc = selectedProductEffect.id === 'custom'
                ? customProductEffectText.trim()
                : selectedProductEffect.prompt;
              if (effectPromptLoc) bgPrompt += `. Additionally: ${effectPromptLoc}`;
            }
          }
        }
      } else {
        modelPrompt = customModelPrompt.trim() || (selectedModel.prompt + buildDetailString());
        if (selectedSavedModelId) {
          const sm = myModels.find(m => m.id === selectedSavedModelId);
          if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = sm.imageUrls || []; }
        }
        bgPrompt = customBgText.trim() || selectedBg.prompt;
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) { locImages = loc.imageUrls; bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos'; }
        }
      }

      // PARALLEL generation — all shots fire simultaneously for speed
      const promises = angles.map((angle, idx) => {
        const biometricSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
        return fetch('/api/generate-image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user?.uid || null,
            garmentImageUrls: garmentUrls, modelPreset: modelPrompt,
            posePreset: angle.pose, cameraAngle: angle.camera,
            backgroundPreset: bgPrompt, aspectRatio: selectedRatio.id,
            modelReferenceImages: modelRefImages, locationImages: locImages,
            attributes: appMode === 'product' ? productModelDetails : modelDetails, isBeautyMode, biometricSeed,
            isProductMode: appMode === 'product',
            categoryId: appMode === 'product' ? selectedProductCategory.id : undefined,
            withHumanModel: appMode === 'product' && productWithModel,
            humanModelPrompt: window.__humanModelPrompt || undefined,
            humanModelRefImages: window.__humanModelRefImages || undefined,
          }),
        }).then(r => safeParseJSON(r)).then(data => {
          if (data.success) {
            const imgData = data.imageUrl || data.imageBase64;
            const slotIdx = existingCount + idx;
            // Place at the correct offset position (existing photos + batch index)
            setPhotoshootImages(prev => { const n = [...prev]; n[slotIdx] = imgData; return n; });
            // Initialize history with original
            setPhotoHistory(prev => ({ ...prev, [slotIdx]: [imgData] }));
            setPhotoViewIdx(prev => ({ ...prev, [slotIdx]: 0 }));
          } else {
            console.warn(`Кадр ${existingCount + idx + 1}: ${data.details || data.error}`);
          }
        }).catch(err => console.warn(`Кадр ${existingCount + idx + 1} ошибка:`, err.message))
      });
      await Promise.all(promises);
      const totalReady = photoshootImages.filter(Boolean).length + count;
      setStatusText(`🎉 Фотосессия: ${totalReady} кадров готово!`); setStatusType('success');
    } catch (err) { setStatusText(`Ошибка фотосессии: ${err.message}`); setStatusType('error'); }
    finally { setIsPhotoshooting(false); }
  };

  // ═══ PER-PHOTO EDITOR ═══
  // Takes a specific photo from the photoshoot gallery, sends it with an edit instruction,
  // and replaces the original photo with the result.
  const handlePhotoEdit = async () => {
    if (editingPhotoIdx === null || !photoEditText.trim()) return;
    const idx = editingPhotoIdx;
    const instruction = photoEditText.trim();
    const currentVersions = photoHistory[idx] || [photoshootImages[idx]];
    const currentImg = currentVersions[currentVersions.length - 1];
    if (!currentImg) return;

    // Close modal immediately — editing runs in background
    setEditingPhotoIdx(null);
    setPhotoEditText('');

    // Mark this photo as "editing"
    setEditingPhotos(prev => new Set(prev).add(idx));

    try {
      // Upload source image to Firebase Storage to avoid body size limits
      const { url: sourceUrl } = await uploadBase64Image(user?.uid || 'anonymous', currentImg, 'edits');
      const resp = await fetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || null,
          isPhotoEdit: true,
          sourceImageUrl: sourceUrl,
          editInstruction: instruction,
        }),
      });
      const data = await safeParseJSON(resp);
      if (data.success) {
        const editedImg = data.imageUrl || data.imageBase64;
        // Update photoshootImages to show latest
        setPhotoshootImages(prev => {
          const n = [...prev]; n[idx] = editedImg; return n;
        });
        // Push to history
        setPhotoHistory(prev => {
          const versions = prev[idx] || [currentVersions[0]];
          return { ...prev, [idx]: [...versions, editedImg] };
        });
        // Set view to latest
        setPhotoViewIdx(prev => {
          const versions = (photoHistory[idx] || [currentVersions[0]]);
          return { ...prev, [idx]: versions.length };
        });
      } else {
        setStatusText(`Ошибка редактирования кадра ${idx + 1}: ${data.details || data.error}`); setStatusType('error');
      }
    } catch (err) {
      setStatusText(`Ошибка: ${err.message}`); setStatusType('error');
    } finally {
      setEditingPhotos(prev => { const n = new Set(prev); n.delete(idx); return n; });
    }
  };

  if (loading) return <div className="app-wrapper" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}><div className="processing-spinner" /></div>;
  if (!user) return <LoginPage />;

  const handleReuseSettings = (gen) => {
    // Mode
    setAppMode(gen.type === 'product' ? 'product' : 'fashion');
    
    // Formats
    if (gen.aspectRatio) {
      const ratio = ASPECT_RATIOS.find(r => r.id === gen.aspectRatio);
      if (ratio) setSelectedRatio(ratio);
    }
    if (gen.cameraAngle) {
      const cam = CAMERA_ANGLES.find(c => c.id === gen.cameraAngle || c.prompt === gen.cameraAngle);
      if (cam) setSelectedCamera(cam);
    }

    if (gen.type === 'product') {
      if (gen.categoryId) {
        const cat = PRODUCT_CATEGORIES.find(c => c.id === gen.categoryId);
        if (cat) setSelectedProductCategory(cat);
      }
      if (gen.backgroundPreset) {
        const bg = [...PRODUCT_BACKGROUNDS, ...BACKGROUND_PRESETS].find(b => b.prompt === gen.backgroundPreset || b.id === gen.backgroundPreset);
        if (bg) { setSelectedProductBg(bg); setCustomProductBg(''); }
        else { setCustomProductBg(gen.backgroundPreset); setSelectedProductBg(null); }
      }
      if (gen.attributes && typeof gen.attributes === 'object') {
        setProductModelDetails({ ...initDetails(), ...gen.attributes });
      } else {
        setProductModelDetails(initDetails());
      }
      if (gen.withHumanModel !== undefined) setProductWithModel(gen.withHumanModel);
    } else {
      if (gen.modelPreset) {
        const m = MODEL_PRESETS.find(p => p.prompt === gen.modelPreset || p.id === gen.modelPreset);
        if (m) { setSelectedModel(m); setCustomModelPrompt(''); }
        else { setCustomModelPrompt(gen.modelPreset); setSelectedModel(null); }
      }
      if (gen.attributes && typeof gen.attributes === 'object') {
        setModelDetails({ ...initDetails(), ...gen.attributes });
      } else {
        setModelDetails(initDetails());
      }
      
      if (gen.posePreset) {
        const p = POSE_PRESETS.find(x => x.prompt === gen.posePreset || x.id === gen.posePreset);
        if (p) { setSelectedPose(p); setCustomPoseText(''); }
        else { setCustomPoseText(gen.posePreset); setSelectedPose(null); }
      }
      if (gen.customPoseText) setCustomPoseText(gen.customPoseText);
      
      if (gen.backgroundPreset) {
        const bg = BACKGROUND_PRESETS.find(b => b.prompt === gen.backgroundPreset || b.id === gen.backgroundPreset);
        if (bg) { setSelectedBg(bg); setCustomBgText(''); }
        else { setCustomBgText(gen.backgroundPreset); setSelectedBg(null); }
      }
    }
    
    setShowHistory(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStatusText('✅ Настройки генерации успешно загружены!');
    setStatusType('success');
  };

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <motion.h1 className="app-logo" initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} transition={{duration:0.6}}>Селлер-Студия</motion.h1>
        <p className="app-subtitle">ИИ-фотостудия для маркетплейсов Ozon, WB и других</p>
        
        {/* Премиальный переключатель режимов */}
        <div className="mode-selector-wrapper">
          <div className="mode-selector-bg mode-selector-3">
            <motion.div
              className="mode-selector-slider"
              animate={{ x: appMode === 'product' ? '100%' : appMode === 'quick' ? '200%' : '0%' }}
              transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.5 }}
            />
            <button
              className={`mode-btn ${appMode === 'fashion' ? 'active' : ''}`}
              onClick={() => setAppMode('fashion')}
            >
              👕 Одежда
            </button>
            <button
              className={`mode-btn ${appMode === 'product' ? 'active' : ''}`}
              onClick={() => setAppMode('product')}
            >
              📦 Предметка
            </button>
            <button
              className={`mode-btn ${appMode === 'quick' ? 'active' : ''}`}
              onClick={() => setAppMode('quick')}
            >
              ⚡ В два клика
            </button>
          </div>
        </div>

        <div style={{marginTop:16,display:'flex',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap'}}>
          <SubscriptionBadge subscription={subscription} onClick={() => setShowPricing(true)} />
          <button className="my-history-btn" onClick={() => setShowHistory(true)} title="Мои работы">
            🖼️ Мои работы
          </button>
          <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{user.displayName || user.email}</span>
          {!isEmbedded && <button onClick={signOut} style={{fontSize:'0.7rem',color:'var(--text-muted)',background:'none',border:'1px solid var(--border-subtle)',borderRadius:'9999px',padding:'4px 14px',cursor:'pointer',fontFamily:'var(--font-body)',letterSpacing:'1px',textTransform:'uppercase'}}>Выйти</button>}
        </div>
      </header>

      {/* ═══ PRICING MODAL ═══ */}
      <PricingModal
        isOpen={showPricing}
        onClose={() => setShowPricing(false)}
        currentPlan={subscription?.plan || 'none'}
        onSelectPlan={handleSelectPlan}
        loading={pricingLoading}
        subscription={subscription}
        onCancelAutoRenew={handleCancelAutoRenew}
        canceling={cancelingSubscription}
      />

      {/* ═══ МОИ РАБОТЫ ═══ */}
      {showHistory && <MyHistoryPage onClose={() => setShowHistory(false)} onReuseSettings={handleReuseSettings} />}

      {/* ═══ QUICK MODE PANEL ═══ */}
      {appMode === 'quick' && !generatedImage && (
        <motion.div className="section quick-mode-panel" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.1,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title">
            <span className="icon">⚡</span> В два клика
          </div>
          <p className="quick-mode-subtitle">Загрузите фото товара — получите готовую карточку для маркетплейса</p>

          {/* Upload zone — reuse garmentUrls */}
          <div className="quick-upload-zone">
            {previewUrls.length > 0 ? (
              <div className="multi-preview-grid">
                {previewUrls.map((url, i) => (
                  <div key={i} className="multi-preview-item">
                    <img src={url} alt={`Товар ${i+1}`} />
                    <button className="remove-preview" onClick={() => removeFile(i)}>✕</button>
                  </div>
                ))}
              </div>
            ) : (
              <label className="drop-zone compact" htmlFor="quick-upload">
                <span className="dz-emoji">📷</span>
                <span className="dz-text">Загрузите фото товара</span>
                <input id="quick-upload" type="file" accept="image/*" multiple onChange={handleFilesChange} style={{display:'none'}} />
              </label>
            )}
          </div>

          {/* Model toggle */}
          <div className="quick-model-toggle">
            <label className="quick-toggle-label">
              <input
                type="checkbox"
                checked={quickWithModel}
                onChange={e => setQuickWithModel(e.target.checked)}
              />
              <span className="quick-toggle-text">👤 Добавить модель-человека</span>
            </label>
          </div>

          <AnimatePresence mode="wait">
            {quickWithModel && (
              <motion.div
                key="model-settings"
                initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                transition={{type:'spring',stiffness:400,damping:25,mass:0.5}}
                style={{overflow:'hidden', marginTop: 16, marginBottom: 16, background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)'}}
              >
                <div className="tabs-row" style={{marginBottom: 16}}>
                  <button className={`tab-btn ${productModelTab==='presets'?'active':''}`} onClick={()=>{setProductModelTab('presets');setProductSavedModelId(null);}}>🎭 Пресеты</button>
                  <button className={`tab-btn ${productModelTab==='my_models'?'active':''}`} onClick={()=>setProductModelTab('my_models')}>⭐ Мои Модели{myModels.length>0?` (${myModels.length})`:''}</button>
                </div>
                {productModelTab === 'presets' ? (
                  <>
                    <GenderToggle gender={productModelGender} setGender={setProductModelGender} />
                    <div className="preset-grid" style={{marginTop: 12}}>
                      {MODEL_PRESETS.filter(m => m.gender === productModelGender).map(m => (
                        <div key={m.id} className={`preset-card ${productModelPreset.id===m.id&&!customProductModelPrompt&&!productSavedModelId?'active':''}`}
                          onClick={() => { setProductModelPreset(m); setCustomProductModelPrompt(''); setProductSavedModelId(null); setShowProductModelDetails(true); }}>
                          <span className="emoji">{m.emoji}</span><span className="label">{m.label}</span>
                        </div>
                      ))}
                    </div>
                    <DetailPanel modelDetails={productModelDetails} setModelDetails={setProductModelDetails} visible={showProductModelDetails && !customProductModelPrompt && !productSavedModelId} gender={productModelGender} extraPrompt={''} setExtraPrompt={() => {}} />
                    <div className="custom-variant-row" style={{marginTop: 16}}>
                      <input className="custom-variant-input" type="text" placeholder="Описать модель: «рыжая девушка 25 лет с веснушками»"
                        value={customProductModelPrompt}
                        onFocus={() => { setShowProductModelDetails(false); setProductSavedModelId(null); }}
                        onChange={e => { setCustomProductModelPrompt(e.target.value); setProductSavedModelId(null); setShowProductModelDetails(false); }} />
                    </div>
                  </>
                ) : (
                  <>
                    {myModels.length > 0 ? (
                      <div className="model-avatar-grid">
                        {myModels.map(m => (
                          <div key={m.id} className={`model-avatar ${productSavedModelId===m.id?'active':''}`}
                            onClick={() => { setProductSavedModelId(m.id); setCustomProductModelPrompt(''); setShowProductModelDetails(false); }}>
                            <img src={m.fullbodyUrl || m.imageUrls?.[0] || ''} alt={m.name} />
                            <div className="avatar-name">{m.name}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="section-hint" style={{textAlign:'center',padding:'20px 0'}}>У вас пока нет сохранённых моделей.</p>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Card style picker */}
          <div className="card-style-picker">
            <div className="card-style-label">Стиль карточки:</div>
            <div className="card-style-options">
              <button
                className={`card-style-btn ${quickCardStyle === 'natural' ? 'active' : ''}`}
                onClick={() => setQuickCardStyle('natural')}
              >
                <span className="card-style-icon">🌿</span>
                <span className="card-style-name">Естественная</span>
                <span className="card-style-desc">Элегантная, минимализм, чистый дизайн</span>
              </button>
              <button
                className={`card-style-btn ${quickCardStyle === 'epic' ? 'active' : ''}`}
                onClick={() => setQuickCardStyle('epic')}
              >
                <span className="card-style-icon">🔥</span>
                <span className="card-style-name">Эпичная</span>
                <span className="card-style-desc">Кинематограф, драма, wow-эффект</span>
              </button>
            </div>
          </div>

          {/* Examples button */}
          <button className="card-examples-btn" onClick={() => setShowCardExamples(true)}>
            👁 Посмотреть примеры до/после
          </button>

          {/* Generate button */}
          <div className="quick-generate-row">
            <button
              className="generate-btn quick-generate-btn"
              onClick={handleQuickGenerate}
              disabled={isProcessing || !garmentUrls.length}
            >
              {isProcessing ? '⏳ Генерируем...' : '⚡ Создать студийное фото'}
            </button>
            <span className="quick-credits-hint">1 кредит</span>
          </div>
        </motion.div>
      )}

      {/* 1. МУЛЬТИЗАГРУЗКА */}
      {appMode !== 'quick' && <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.15,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title">
          <span className="icon">{appMode === 'product' ? '📦' : '📸'}</span> 
          {appMode === 'product' ? ' Загрузка товаров' : ' Загрузка вещей'}
        </div>
        {previewUrls.length > 0 ? (
          <div className="multi-preview-grid">
            {previewUrls.map((url, i) => (
              <div key={i} className="multi-preview-item">
                <img src={url} alt={`Объект ${i+1}`} />
                <button className="remove-btn" onClick={() => removeFile(i)}>✕</button>
              </div>
            ))}
            <div className="add-more-btn" onClick={() => fileInputRef.current?.click()}>
              <span className="plus">+</span><span>Ещё</span>
            </div>
            <input type="file" accept="image/*" multiple ref={fileInputRef} style={{display:'none'}} onChange={handleFilesChange} />
          </div>
        ) : (
          <div className={`upload-zone ${statusType === 'dragging' ? 'dragging' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('dragging'); }}
            onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('dragging'); }}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('dragging'); if (e.dataTransfer.files?.length) handleFilesChange({ target: { files: e.dataTransfer.files } }); }}>
            <input type="file" accept="image/*" multiple ref={fileInputRef} style={{display:'none'}} onChange={handleFilesChange} />
            <div className="upload-icon">{appMode === 'product' ? '🧴' : '👕'}</div>
            <p className="upload-text">
              {appMode === 'product' ? 'Загрузите фото вашего товара — флакон, баночку, аксессуар' : 'Загрузите фото одежды — раскладки или фото на модели'}
            </p>
            <p className="upload-hint">
              {appMode === 'product' ? 'JPG, PNG • Перетащите сюда или нажмите • Постарайтесь сделать фото при хорошем свете' : 'JPG, PNG • Перетащите сюда или нажмите • Можно несколько: футболка + брюки + серьги = всё на модели'}
            </p>
          </div>
        )}
      </motion.div>}

      {/* 2. НАСТРОЙКА ОБЪЕКТА / КАСТИНГ-РУМ */}
      {appMode !== 'quick' && (appMode === 'product' ? (
        <>
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.3,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">🧴</span> Категория товара</div>
          <div className="preset-grid">
            {PRODUCT_CATEGORIES.map(cat => (
              <div key={cat.id} className={`preset-card ${selectedProductCategory.id===cat.id&&!customProductPrompt?'active':''}`}
                onClick={() => { setSelectedProductCategory(cat); setCustomProductPrompt(''); }}>
                <span className="emoji">{cat.emoji}</span><span className="label">{cat.label}</span>
              </div>
            ))}
            <div className={`preset-card ${selectedProductCategory.id==='other'&&!customProductPrompt?'active':''}`}
              onClick={() => { setSelectedProductCategory({ id: 'other', label: 'Другое', emoji: '📋', defaultPrompt: 'product item, commercial product photography' }); setCustomProductPrompt(''); }}>
              <span className="emoji">📋</span><span className="label">Другое</span>
            </div>
          </div>
          {selectedProductCategory.id === 'other' && !customProductPrompt && (
            <p className="section-hint" style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:6,textAlign:'center'}}>☝️ Опишите ваш товар в поле ниже — это улучшит качество генерации</p>
          )}
          <div className="custom-variant-row">
            <input className="custom-variant-input" type="text" placeholder={selectedProductCategory.id === 'other' ? 'Опишите ваш товар: «набор кистей для макияжа в чехле»' : 'Описать товар с нуля: «круглая баночка крема с золотой крышкой»'}
              value={customProductPrompt} 
              onChange={e => setCustomProductPrompt(e.target.value)} />
          </div>
        </motion.div>

        {/* ═══ МОДЕЛЬ-ЧЕЛОВЕК В ПРЕДМЕТНОЙ СЪЁМКЕ ═══ */}
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.35,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <span><span className="icon">👤</span> Модель-человек</span>
            {productWithModel && (
              <motion.button 
                initial={{opacity:0, scale:0.9}}
                animate={{opacity:1, scale:1}}
                className="remove-model-btn" 
                onClick={() => setProductWithModel(false)}
              >
                ✕ Исключить модель
              </motion.button>
            )}
          </div>
          <AnimatePresence mode="wait">
            {!productWithModel ? (
              <motion.div 
                key="add-card"
                className="add-model-card"
                onClick={() => setProductWithModel(true)}
                whileHover={{ scale: 1.012, y: -2 }}
                whileTap={{ scale: 0.988 }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25, mass: 0.5 }}
              >
                <div className="add-model-card-content">
                  <div className="add-model-icon">👤✨</div>
                  <div className="add-model-info">
                    <div className="add-model-title">Добавить модель-человека</div>
                    <div className="add-model-desc">
                      Сгенерировать живую модель, которая держит или демонстрирует ваш товар в кадре
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="model-settings"
                initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                transition={{type:'spring',stiffness:400,damping:25,mass:0.5}}
                style={{overflow:'hidden'}}
              >
                <div className="tabs-row" style={{marginTop:8}}>
                  <button className={`tab-btn ${productModelTab==='presets'?'active':''}`} onClick={()=>{setProductModelTab('presets');setProductSavedModelId(null);}}>🎭 Пресеты</button>
                  <button className={`tab-btn ${productModelTab==='my_models'?'active':''}`} onClick={()=>setProductModelTab('my_models')}>⭐ Мои Модели{myModels.length>0?` (${myModels.length})`:''}</button>
                </div>
                {productModelTab === 'presets' ? (
                  <>
                    <GenderToggle gender={productModelGender} setGender={setProductModelGender} />
                    <div className="preset-grid">
                      {MODEL_PRESETS.filter(m => m.gender === productModelGender).map(m => (
                        <div key={m.id} className={`preset-card ${productModelPreset.id===m.id&&!customProductModelPrompt&&!productSavedModelId?'active':''}`}
                          onClick={() => { setProductModelPreset(m); setCustomProductModelPrompt(''); setProductSavedModelId(null); setShowProductModelDetails(true); }}>
                          <span className="emoji">{m.emoji}</span><span className="label">{m.label}</span>
                        </div>
                      ))}
                    </div>
                    <DetailPanel modelDetails={productModelDetails} setModelDetails={setProductModelDetails} visible={showProductModelDetails && !customProductModelPrompt && !productSavedModelId} gender={productModelGender} extraPrompt={''} setExtraPrompt={() => {}} />
                    <div className="custom-variant-row">
                      <input className="custom-variant-input" type="text" placeholder="Описать модель: «рыжая девушка 25 лет с веснушками держит товар»"
                        value={customProductModelPrompt}
                        onFocus={() => { setShowProductModelDetails(false); setProductSavedModelId(null); }}
                        onChange={e => { setCustomProductModelPrompt(e.target.value); setProductSavedModelId(null); setShowProductModelDetails(false); }} />
                    </div>
                  </>
                ) : (
                  <>
                    {myModels.length > 0 && (
                      <div className="model-avatar-grid">
                        {myModels.map(m => (
                          <div key={m.id} className={`model-avatar ${productSavedModelId===m.id?'active':''}`}
                            onClick={() => { setProductSavedModelId(m.id); setCustomProductModelPrompt(''); setShowProductModelDetails(false); }}>
                            <img src={m.fullbodyUrl || m.imageUrls?.[0] || ''} alt={m.name} />
                            <div className="avatar-name">{m.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {myModels.length === 0 && (
                      <p className="section-hint" style={{textAlign:'center',padding:'20px 0'}}>У вас пока нет сохранённых моделей. Создайте модель в режиме Одежда → Мои модели</p>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        </>
      ) : (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.3,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">👤</span> Кастинг-Рум — выбор модели</div>
          <div className="tabs-row">
            <button className={`tab-btn ${modelTab==='presets'?'active':''}`} onClick={()=>{setModelTab('presets');setSelectedSavedModelId(null);}}>🎭 Пресеты</button>
            <button className={`tab-btn ${modelTab==='my_models'?'active':''}`} onClick={()=>setModelTab('my_models')}>⭐ Мои Модели{myModels.length>0?` (${myModels.length})`:''}</button>
          </div>
          {modelTab === 'presets' ? (
            <>
              <GenderToggle gender={gender} setGender={setGender} />
              <div className="preset-grid">
                {filteredModels.map(m => (
                  <div key={m.id} className={`preset-card ${selectedModel.id===m.id&&!customModelPrompt&&!selectedSavedModelId?'active':''}`}
                    onClick={() => { 
                      if (selectedModel.id === m.id && showDetails && !customModelPrompt && !selectedSavedModelId) {
                        setShowDetails(false);
                      } else {
                        setSelectedModel(m); setCustomModelPrompt(''); setSelectedSavedModelId(null); setShowDetails(true); 
                      }
                    }}>
                    <span className="emoji">{m.emoji}</span><span className="label">{m.label}</span>
                  </div>
                ))}
              </div>
              <DetailPanel modelDetails={modelDetails} setModelDetails={setModelDetails} visible={showDetails && !customModelPrompt && !selectedSavedModelId} gender={gender} extraPrompt={extraModelPrompt} setExtraPrompt={setExtraModelPrompt} />
              <div className="custom-variant-row">
                <input className="custom-variant-input" type="text" placeholder="Описать модель с нуля: «рыжая девушка 25 лет с веснушками»"
                  value={customModelPrompt} 
                  onFocus={() => { setShowDetails(false); setSelectedSavedModelId(null); }}
                  onChange={e => { setCustomModelPrompt(e.target.value); setSelectedSavedModelId(null); setShowDetails(false); }} />
              </div>
              {/тату|tattoo/i.test(customModelPrompt) && (
                <div className="tattoo-warning">⚠️ Татуировка отлично получится на одиночном фото, но в серии (фотосессия) может искажаться. Для стабильной модели старайтесь не использовать тату.</div>
              )}
            </>
          ) : (
            <>
              {myModels.length > 0 && (
                <>
                  <div className="model-avatar-grid">
                    {myModels.map(m => (
                      <div key={m.id} className={`model-avatar ${selectedSavedModelId===m.id?'active':''}`}
                        onClick={() => { setSelectedSavedModelId(m.id); setCustomModelPrompt(''); setShowDetails(false); }}>
                        <img src={m.fullbodyUrl || m.imageUrls?.[0] || ''} alt={m.name} />
                        <div className="avatar-name">{m.name}</div>
                        <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteModel(m.id); }}>✕</button>
                      </div>
                    ))}
                  </div>
                  {selectedSavedModelId && <div className="selected-model-indicator">⭐ Ваша модель выбрана</div>}
                  {selectedSavedModelId && (
                    <div className="modifier-block">
                      <button className="modifier-toggle" onClick={() => { setShowModelModifier(!showModelModifier); setModelPreviewSrc(null); }}>
                        {showModelModifier ? '✖ Скрыть' : '✏️ Изменить модель'}
                      </button>
                      {showModelModifier && (
                        <div className="modifier-content">
                          <textarea className="modifier-input" rows={2} placeholder="Например: добавить татуировку на левую руку, сделать волосы рыжими, рост выше"
                            value={modelModifier} onChange={e => setModelModifier(e.target.value)} />
                          {/* Tattoo warning (text input) */}
                          {/тату/i.test(modelModifier) && (
                            <div className="tattoo-warning">⚠️ Татуировка отлично получится на одиночном фото, но в серии (фотосессия) может искажаться. Для стабильной модели старайтесь не использовать тату.</div>
                          )}
                          <button className="modifier-save-btn" onClick={handlePreviewModel} disabled={!modelModifier.trim() || isPreviewingModel}>
                            {isPreviewingModel ? '⏳ Генерируем превью...' : '👁️ Предпросмотр'}
                          </button>
                          {modelPreviewSrc && (
                            <div className="model-preview-block">
                              <img src={modelPreviewSrc} alt="Превью модели" className="model-preview-img" onClick={() => setLightboxSrc(modelPreviewSrc)} />
                              <input className="custom-variant-input" type="text" placeholder="Назовите новую модель" value={modelPreviewName} onChange={e => setModelPreviewName(e.target.value)} />
                              <button className="modifier-save-btn" onClick={saveModelAsNew} disabled={!modelPreviewName.trim() || isSaving}>
                                {isSaving ? '⏳ Сохраняем...' : '💾 Сохранить как новую модель'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              <div className="add-location-card" style={{marginTop: myModels.length ? 12 : 0}} onClick={() => setShowLoraModal(true)}>
                <span className="plus-icon">+</span>
                <span>Добавить свою модель</span>
              </div>
            </>
          )}
        </motion.div>
      ))}

      {/* 3. ПОЗА ИЛИ КОМПОЗИЦИЯ */}
      {appMode !== 'quick' && (appMode === 'product' ? (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.45,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">📐</span> Композиция кадра</div>
          <div className="preset-grid">
            {PRODUCT_COMPOSITIONS.map(p => (
              <div key={p.id} className={`preset-card ${selectedProductComposition.id===p.id&&!customPoseText?'active':''}`}
                onClick={() => { setSelectedProductComposition(p); setCustomPoseText(''); }}>
                <span className="emoji">{p.emoji}</span><span className="label">{p.label}</span>
              </div>
            ))}
          </div>
          <div className="custom-variant-row">
            <input className="custom-variant-input" type="text" placeholder="Или опишите свою композицию: «Товар лежит на зеркальной поверхности под углом»"
              value={customPoseText} onChange={e => setCustomPoseText(e.target.value)} />
          </div>
        </motion.div>
      ) : (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.45,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">🧍</span> Поза модели</div>
          <div className="preset-grid">
            {POSE_PRESETS.map(p => (
              <div key={p.id} className={`preset-card ${selectedPose.id===p.id&&!customPoseText?'active':''}`}
                onClick={() => { setSelectedPose(p); setCustomPoseText(''); }}>
                <span className="emoji">{p.emoji}</span><span className="label">{p.label}</span>
              </div>
            ))}
          </div>
          <div className="custom-variant-row">
            <input className="custom-variant-input" type="text" placeholder="Или опишите свою позу: Модель сидит на барном стуле, закинув ногу на ногу, правая рука касается ключицы"
              value={customPoseText} onChange={e => setCustomPoseText(e.target.value)} />
          </div>
        </motion.div>
      ))}

      {/* 4. РАКУРС КАМЕРЫ (Только в режиме одежды) */}
      {appMode === 'fashion' && (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.6,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">📷</span> Ракурс камеры</div>
          <div className="preset-grid">
            {CAMERA_ANGLES.map(c => (
              <div key={c.id} className={`preset-card ${selectedCamera.id===c.id?'active':''}`} onClick={() => setSelectedCamera(c)}>
                <span className="label">{c.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 5. ФОН / ЛОКАЦИЯ */}
      {appMode !== 'quick' && <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.75,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title"><span className="icon">🎨</span> {appMode === 'product' ? 'Сцена / Окружение' : 'Фон / Локация'}</div>
        <div className="tabs-row">
          <button className={`tab-btn ${bgTab==='presets'?'active':''}`} onClick={()=>{setBgTab('presets');setSelectedLocId(null);}}>🎨 Пресеты</button>
          <button className={`tab-btn ${bgTab==='my_locations'?'active':''}`} onClick={()=>setBgTab('my_locations')}>📍 Мои локации{myLocations.length>0?` (${myLocations.length})`:''}</button>
        </div>
        {bgTab === 'presets' ? (
          <>
            {appMode === 'product' ? (
              <>
                <div className="preset-grid">
                  {PRODUCT_BACKGROUNDS.map(b => (
                    <div key={b.id} className={`preset-card ${selectedProductBg.id===b.id&&!selectedLocId&&!customProductBg?'active':''}`}
                      onClick={() => { setSelectedProductBg(b); setSelectedLocId(null); setCustomProductBg(''); }}>
                      <span className="emoji">{b.emoji}</span><span className="label">{b.label}</span>
                    </div>
                  ))}
                </div>
                <div className="custom-variant-row" style={{marginTop: 12}}>
                  <input className="custom-variant-input" placeholder="Локация с нуля: «деревянный стол в скандинавском стиле, на фоне размытое окно»"
                    value={customProductBg} onChange={e => { setCustomProductBg(e.target.value); setSelectedLocId(null); }} />
                </div>
                <div className="section-subtitle-small" style={{marginTop: 18, marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <span>✨</span> Добавить спецэффект
                </div>
                <div className="preset-grid">
                  {PRODUCT_EFFECTS.map(e => (
                    <div key={e.id} className={`preset-card ${selectedProductEffect.id===e.id?'active':''}`}
                      onClick={() => setSelectedProductEffect(e)}>
                      <span className="emoji">{e.emoji}</span><span className="label">{e.label}</span>
                    </div>
                  ))}
                </div>
                {selectedProductEffect.id === 'custom' && (
                  <div className="custom-variant-row" style={{marginTop:10}}>
                    <input
                      className="custom-variant-input"
                      placeholder="Опишите ваш спецэффект: «взрыв конфетти, снежинки, дым»"
                      value={customProductEffectText}
                      onChange={ev => setCustomProductEffectText(ev.target.value)}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="preset-grid">
                  {BACKGROUND_PRESETS.map(b => (
                    <div key={b.id} className={`preset-card ${selectedBg.id===b.id&&!selectedLocId&&!customBgText?'active':''}`}
                      onClick={() => { setSelectedBg(b); setSelectedLocId(null); setCustomBgText(''); }}>
                      <span className="emoji">{b.emoji}</span><span className="label">{b.label}</span>
                    </div>
                  ))}
                </div>
                <div className="modifier-block" style={{marginTop:10}}>
                  <textarea className="modifier-input" rows={1} placeholder="Добавить к локации: «закат, мокрый асфальт, неоновые огни»"
                    value={bgExtraText} onChange={e => setBgExtraText(e.target.value)} />
                </div>
                <div className="custom-variant-row">
                  <input className="custom-variant-input" placeholder="Локация с нуля: «крыша небоскрёба на закате»"
                    value={customBgText} onChange={e => { setCustomBgText(e.target.value); setSelectedLocId(null); }} />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="location-card-grid">
              {myLocations.map(loc => (
                <div key={loc.id} className={`location-card ${selectedLocId===loc.id?'active':''}`} onClick={() => setSelectedLocId(loc.id)}>
                  <img src={loc.thumbnail || loc.imageUrls?.[0] || ''} alt={loc.title || loc.name || ''} />
                  <div className="loc-name">{loc.title || loc.name || 'Без названия'}</div>
                  <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteLoc(loc.id); }}>✕</button>
                </div>
              ))}
              <div className="add-location-card" onClick={() => setShowLocModal(true)}>
                <span className="plus-icon">+</span><span>Оцифровать локацию</span>
              </div>
            </div>
            {selectedLocId && (
              <div className="modifier-block">
                <button className="modifier-toggle" onClick={() => setShowLocModifier(!showLocModifier)}>
                  {showLocModifier ? '✖ Скрыть' : '✏️ Изменить локацию'}
                </button>
                {showLocModifier && (
                  <div className="modifier-content">
                    <textarea className="modifier-input" rows={2} placeholder="Например: добавить закат, сделать стены кирпичными, неоновая вывеска"
                      value={locModifier} onChange={e => setLocModifier(e.target.value)} />
                    <button className="modifier-save-btn" onClick={saveLocMod} disabled={!locModifier.trim()}>💾 Сохранить в локацию</button>
                  </div>
                )}
              </div>
            )}
            {appMode === 'product' && (
              <>
                <div className="section-subtitle-small" style={{marginTop: 18, marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <span>✨</span> Добавить спецэффект
                </div>
                <div className="preset-grid">
                  {PRODUCT_EFFECTS.map(e => (
                    <div key={e.id} className={`preset-card ${selectedProductEffect.id===e.id?'active':''}`}
                      onClick={() => setSelectedProductEffect(e)}>
                      <span className="emoji">{e.emoji}</span><span className="label">{e.label}</span>
                    </div>
                  ))}
                </div>
                {selectedProductEffect.id === 'custom' && (
                  <div className="custom-variant-row" style={{marginTop:10}}>
                    <input
                      className="custom-variant-input"
                      placeholder="Опишите ваш спецэффект: «взрыв конфетти, снежинки, дым»"
                      value={customProductEffectText}
                      onChange={ev => setCustomProductEffectText(ev.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </motion.div>}

      {/* 6. ФОРМАТ */}
      {appMode !== 'quick' && <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.9,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title"><span className="icon">📐</span> Формат изображения</div>
        <div className="preset-grid">
          {ASPECT_RATIOS.map(r => (
            <div key={r.id} className={`preset-card ${selectedRatio.id===r.id?'active':''}`} onClick={() => setSelectedRatio(r)}>
              <span className="emoji">{r.icon}</span><span className="label">{r.label}</span>
            </div>
          ))}
        </div>
      </motion.div>}

      {/* 7. ГЕНЕРАЦИЯ */}
      {appMode !== 'quick' && <motion.div className="generate-section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:1.05,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="beauty-toggle">
          <label className={`beauty-switch ${isBeautyMode ? 'active' : ''}`}>
            <input type="checkbox" checked={isBeautyMode} onChange={e => setIsBeautyMode(e.target.checked)} />
            <span className="beauty-label">{isBeautyMode ? '✨ Beauty-ретушь' : '📷 Реализм'}</span>
          </label>
          <span className="beauty-hint">
            {appMode === 'product' && !productWithModel
              ? (isBeautyMode
                  ? 'Выбран коммерческий глянец — идеальные поверхности. Нажмите, чтобы вернуть натуральные текстуры'
                  : 'Выбран реализм — натуральные текстуры материалов. Нажмите, чтобы включить коммерческий глянец')
              : (isBeautyMode
                  ? 'Выбран журнальный глянец «Идеальная кожа». Нажмите, чтобы вернуть реализм'
                  : 'Выбран реализм: натуральная кожа с текстурой. Нажмите, чтобы включить журнальный глянец «Идеальная кожа»')}
          </span>
        </div>

        {/* Селектор количества вариантов */}
        <div className="variant-count-section">
          <div className="variant-count-title">🎯 Количество вариантов</div>
          <div className="variant-count-grid">
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                className={`variant-count-btn ${variantCount === n ? 'active' : ''}`}
                onClick={() => setVariantCount(n)}
              >
                <span className="variant-count-number">{n}</span>
                <span className="variant-count-label">{n === 1 ? 'кадр' : (n < 5 ? 'кадра' : 'кадров')}</span>
                <span className="variant-count-credits">{n} {n === 1 ? 'кредит' : (n < 5 ? 'кредита' : 'кредитов')}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div style={{display: 'flex', gap: '10px', flexDirection: 'column'}}>
          <button className="generate-btn" onClick={handleGenerate} onMouseEnter={() => { fetch('/api/generate-image', { method: 'OPTIONS', keepalive: true }).catch(() => {}); }} disabled={!garmentUrls.length||isProcessing||isUploading}>{isUploading ? '☁️ Загрузка в облако...' : `✨ Сгенерировать ${variantCount > 1 ? variantCount + ' варианта' : 'студийный кадр'}`}</button>
          <button className="generate-btn" style={{background: 'linear-gradient(135deg, #18181b, #27272a)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fafafa'}} onClick={handleAutoCatalog} disabled={!garmentUrls.length||isProcessing||isUploading}>{isUploading ? '☁️ Загрузка...' : '🏭 Отправить в Auto-Catalog (Batch)'}</button>
        </div>

        <div className="status-bar">{statusText && <p className={`status-text ${statusType}`}>{statusText}</p>}</div>
      </motion.div>}

      {/* ═══ STATUS BAR for quick mode ═══ */}
      {appMode === 'quick' && statusText && (
        <div className="status-bar" style={{textAlign:'center',padding:'12px 0'}}>
          <p className={`status-text ${statusType}`}>{statusText}</p>
        </div>
      )}

      {/* 8а. QUICK MODE RESULT — Hero-First: чистое фото + upsell */}
      {generatedImage && appMode === 'quick' && !showReveCanvas && (
        <motion.div className="section result-section quick-hero-result" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{duration:0.5}}>
          <h3>📸 Ваше студийное фото</h3>
          <div className="result-image-wrap" style={{position:'relative'}}>
            <img src={generatedImage} alt="Студийное фото" onClick={() => setLightboxSrc(generatedImage)} style={{cursor:'pointer'}} />
          </div>
          <div className="quick-hero-actions">
            <button className="download-btn" onClick={() => {
              const link = document.createElement('a');
              link.download = `studio-photo-${Date.now()}.png`;
              link.href = generatedImage;
              link.click();
            }}>⬇️ Скачать фото</button>
            <button
              className="generate-btn quick-add-design-btn"
              onClick={handleAddDesign}
              disabled={isCardGenerating}
            >
              {isCardGenerating ? '⏳ Генерируем карточку...' : '✨ Создать карточку + редактор'}
            </button>
            <span className="quick-credits-hint" style={{marginTop: 4}}>Создаст готовую карточку с текстами, которую можно редактировать</span>
          </div>
          <button className="sc-btn-close" style={{marginTop: 16}} onClick={() => {
            setGeneratedImage(null);
            setReveCardImage(null);
            setQuickCleanPhoto(null);
            setQuickCleanPhotoUrl(null);
          }}>← Новая генерация</button>
        </motion.div>
      )}

      {/* 8а-2. SMART CARD EDITOR — умный редактор карточки маркетплейса */}
      {reveCardImage && appMode === 'quick' && showReveCanvas && (
        <SmartCardEditor
          imageUrl={reveCardImage}
          onClose={() => {
            setShowReveCanvas(false);
          }}
          onEdit={async (prompt, maskBase64) => {
            const resp = await fetch('/api/reve-edit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'edit',
                prompt,
                imageBase64: reveCardImage,
                maskBase64,
              }),
            });
            const data = await resp.json();
            if (data.success && data.imageBase64) {
              setReveCardImage(data.imageBase64);
            } else {
              throw new Error(data.error || 'Ошибка редактирования');
            }
          }}
        />
      )}

      {/* 8б. РЕЗУЛЬТАТ — режимы Одежда / Предметка */}
      <AnimatePresence>
        {generatedImage && appMode !== 'quick' && (
          <motion.div key="result-section" className="section result-section" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:0.5}}>
            <h3>Финальный Рендер</h3>
            <div className="result-image-wrap" style={{position:'relative'}}>
              {/* ← Previous render */}
              {imageHistory.length > 1 && historyIndex > 0 && (
                <button
                  className="history-nav-btn history-prev"
                  onClick={(e) => { e.stopPropagation(); const ni = historyIndex - 1; setHistoryIndex(ni); setGeneratedImage(imageHistory[ni].image); }}
                  title="Предыдущий вариант"
                >‹</button>
              )}
              <img src={generatedImage} alt="VTON" onClick={() => setLightboxSrc(generatedImage)} style={{cursor:'pointer'}} />
              {/* → Next render */}
              {imageHistory.length > 1 && historyIndex < imageHistory.length - 1 && (
                <button
                  className="history-nav-btn history-next"
                  onClick={(e) => { e.stopPropagation(); const ni = historyIndex + 1; setHistoryIndex(ni); setGeneratedImage(imageHistory[ni].image); }}
                  title="Следующий вариант"
                >›</button>
              )}
            </div>
            {imageHistory.length > 1 && (
              <div className="history-info">
                <p className="history-counter">{historyIndex + 1} / {imageHistory.length}</p>
                {imageHistory[historyIndex]?.label && (
                  <p className="history-label">✏️ {imageHistory[historyIndex].label}</p>
                )}
              </div>
            )}
            <p className="touch-zoom-hint">👆 Нажмите на фото для увеличения</p>
            <div className="result-actions">
              <button className="download-btn" onClick={handleDownload}>⬇️ Скачать</button>
              {/* Калибровка и «Переодеть» — только когда есть человек-модель */}
              {(appMode === 'fashion' || (appMode === 'product' && productWithModel)) && (
                <button className="save-model-btn" onClick={() => openCalibration('save')}>🎯 Сохранить модель (калибровка)</button>
              )}
              {appMode === 'fashion' ? (
                <button
                  className="redress-btn has-tooltip"
                  onClick={handleGenerate}
                  disabled={isProcessing}
                  data-tooltip="Вернуть одежду в исходный вид"
                >👗 Переодеть модель</button>
              ) : (
                <button
                  className="redress-btn has-tooltip"
                  onClick={handleGenerate}
                  disabled={isProcessing}
                  data-tooltip="Перегенерировать с текущими настройками"
                >🔄 Новый вариант</button>
              )}
            </div>

            {/* ═══ CARD DESIGNER CTA ═══ */}
            {/* Не показываем в режиме «В два клика» — там результат уже карточка */}
            {appMode !== 'quick' && <motion.div
              className="card-designer-section"
              initial={{opacity:0,y:20}}
              animate={{opacity:1,y:0}}
              transition={{delay:0.3,duration:0.5,ease:[0.16,1,0.3,1]}}
            >
              <div className="card-designer-header">
                <span className="card-designer-icon">🎴</span>
                <div>
                  <div className="card-designer-title">Оформить карточку для маркетплейса</div>
                  <div className="card-designer-subtitle">Превратите фото в продающую карточку WB / Ozon</div>
                </div>
              </div>

              <div className="card-style-picker">
                <div className="card-style-options">
                  <button
                    className={`card-style-btn ${cardDesignStyle === 'natural' ? 'active' : ''}`}
                    onClick={() => setCardDesignStyle('natural')}
                  >
                    <span className="card-style-icon">🌿</span>
                    <span className="card-style-name">Естественная</span>
                    <span className="card-style-desc">Элегантная, минимализм</span>
                  </button>
                  <button
                    className={`card-style-btn ${cardDesignStyle === 'epic' ? 'active' : ''}`}
                    onClick={() => setCardDesignStyle('epic')}
                  >
                    <span className="card-style-icon">🔥</span>
                    <span className="card-style-name">Эпичная</span>
                    <span className="card-style-desc">Кинематограф, wow-эффект</span>
                  </button>
                </div>
              </div>

              <div className="card-designer-actions">
                <button className="card-examples-btn" onClick={() => setShowCardExamples(true)}>
                  👁 Примеры
                </button>
                <button
                  className="card-generate-btn"
                  onClick={handleCardDesignClick}
                  disabled={isCardGenerating}
                >
                  {isCardGenerating ? '⏳ Создаём...' : '🎴 Создать карточку'}
                </button>
                <span className="card-credits-hint">1 кредит / шт</span>
              </div>

              {/* Card result */}
              {cardResult && Array.isArray(cardResult) && cardResult.length > 0 && (
                <motion.div
                  className="card-result-block"
                  initial={{opacity:0,scale:0.95}}
                  animate={{opacity:1,scale:1}}
                  transition={{duration:0.4}}
                >
                  <h4 className="card-result-title">🎴 {cardResult.length > 1 ? `Готовые карточки (${cardResult.length})` : 'Готовая карточка'}</h4>
                  <div className={`card-result-grid ${cardResult.length > 1 ? 'multi' : ''}`}>
                    {cardResult.map((url, ci) => (
                      <div key={ci} className="card-result-image-wrap">
                        <img src={url} alt={`Карточка ${ci+1}`} onClick={() => setLightboxSrc(url)} />
                        <button className="download-btn card-dl" onClick={() => {
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `card-${cardDesignStyle}-${ci+1}-${Date.now()}.png`;
                          a.target = '_blank';
                          a.click();
                        }}>⬇️</button>
                      </div>
                    ))}
                  </div>
                  <div className="card-result-actions">
                    <button className="card-generate-btn" onClick={handleCardDesignClick} disabled={isCardGenerating}>
                      🔄 Ещё варианты
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>}

            {/* Iterative editing */}
            <div className="shot-modifier-block">
              <div className="shot-modifier-label">
                {appMode === 'product' ? '✏️ Хотите что-то изменить в кадре?' : '✏️ Хотите что-то изменить в кадре?'}
              </div>
              <textarea className="modifier-input" rows={2} placeholder={
                appMode === 'product'
                  ? 'Например: сделать фон темнее, добавить блики, убрать тени, повернуть товар'
                  : 'Например: сделать модель выше, изменить цвет волос, добавить очки, убрать тени'
              }
                value={shotModifier} onChange={e => setShotModifier(e.target.value)} />
              <button className="modifier-regen-btn" onClick={handleRegenerate} disabled={!shotModifier.trim() || isProcessing}>
                🔄 Внести изменения
              </button>
            </div>

            {/* Photoshoot */}
            <div className="photoshoot-block">
              <div className="photoshoot-label">{appMode === 'product' ? '📸 Сделать раскадровку' : '📸 Сделать фотосессию'}</div>
              <p className="photoshoot-hint">
                {appMode === 'product'
                  ? 'Генерация нескольких фото товара с разных ракурсов и композиций'
                  : 'Генерация нескольких фото с разных ракурсов'}
              </p>
              <p className="photoshoot-hint" style={{fontSize:'0.72rem', opacity:0.6, marginTop:2}}>
                {appMode === 'product'
                  ? '📦 Фото товара берётся из загруженных вами фото, не из сгенерированного кадра'
                  : '👕 Одежда берётся из загруженных вами фото, не из сгенерированного кадра'}
              </p>

              {/* Calibration prompt — только если есть человек-модель */}
              {(appMode === 'fashion' || (appMode === 'product' && productWithModel)) && !selectedSavedModelId && !(appMode === 'product' && !productWithModel) && (
                <div className="calibration-prompt">
                  <p className="calibration-prompt-text">💡 Для максимальной консистентности лица рекомендуем сначала <strong>откалибровать модель</strong></p>
                  <button className="calib-prompt-btn" onClick={() => openCalibration('photoshoot')}>
                    🎯 Откалибровать модель
                  </button>
                </div>
              )}

              <div className="photoshoot-choice">
                <button className="photoshoot-btn photoshoot-btn--3" onClick={() => handlePhotoshoot(3)} disabled={isPhotoshooting || isProcessing}>
                  {isPhotoshooting ? '⏳ Генерация...' : photoshootImages.filter(Boolean).length > 0 ? `📷 ещё +3` : '📷 3 фото'}
                </button>
                <button className="photoshoot-btn photoshoot-btn--5" onClick={() => handlePhotoshoot(5)} disabled={isPhotoshooting || isProcessing}>
                  {isPhotoshooting ? '⏳ Генерация...' : photoshootImages.filter(Boolean).length > 0 ? `📸 ещё +5` : '📸 5 фото'}
                </button>
              </div>
            </div>

            {/* Photoshoot gallery */}
            {photoshootImages.length > 0 && (
              <div className="photoshoot-gallery">
                <h4>📷 Галерея фотосессии</h4>
                <div className="photoshoot-grid">
                  {photoshootImages.map((img, i) => {
                    const versions = photoHistory[i];
                    const hasEdits = versions && versions.length > 1;
                    const viewIdx = photoViewIdx[i] ?? (versions ? versions.length - 1 : 0);
                    const displayImg = hasEdits ? versions[viewIdx] : img;
                    const isEditing = editingPhotos.has(i);
                    return (
                    <div key={i} className={`photoshoot-item ${hasEdits ? 'photoshoot-item--edited' : ''} ${isEditing ? 'photoshoot-item--processing' : ''}`}>
                      {displayImg ? (
                        <>
                          <img src={displayImg} alt={`Кадр ${i+1}`} onClick={() => {
                            const gallery = hasEdits ? versions : photoshootImages;
                            openLightboxGallery(gallery, hasEdits ? viewIdx : i);
                          }} style={{cursor:'pointer'}} />
                          {isEditing && (
                            <div className="photo-editing-overlay">
                              <div className="processing-spinner" style={{width:28,height:28}} />
                              <span>Редактируется...</span>
                            </div>
                          )}
                          {hasEdits && (
                            <>
                              <span className="photo-edited-badge">✨ Изменено ({versions.length - 1})</span>
                              <div className="photo-history-nav">
                                <button className="photo-history-btn" disabled={viewIdx <= 0} onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoViewIdx(prev => ({ ...prev, [i]: viewIdx - 1 }));
                                }}>‹</button>
                                <span className="photo-history-counter">{viewIdx + 1}/{versions.length}</span>
                                <button className="photo-history-btn" disabled={viewIdx >= versions.length - 1} onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoViewIdx(prev => ({ ...prev, [i]: viewIdx + 1 }));
                                }}>›</button>
                              </div>
                            </>
                          )}
                          <button className="edit-mini-btn" title="Редактировать этот кадр" onClick={(e) => {
                            e.stopPropagation();
                            setEditingPhotoIdx(i);
                            setPhotoEditText('');
                          }}>✏️</button>
                          <div className="download-mini-wrapper">
                            <button className="download-mini-btn" onClick={(e) => {
                              e.stopPropagation();
                              if (hasEdits) {
                                setDownloadMenuIdx(downloadMenuIdx === i ? null : i);
                              } else {
                                const a = document.createElement('a'); a.href = displayImg; a.download = `SellerStudio_${i+1}_${Date.now()}.jpg`; a.click();
                              }
                            }}>⬇️</button>
                            {downloadMenuIdx === i && hasEdits && (
                              <div className="download-menu">
                                <button onClick={(e) => {
                                  e.stopPropagation();
                                  const a = document.createElement('a'); a.href = versions[versions.length - 1]; a.download = `SellerStudio_${i+1}_latest_${Date.now()}.jpg`; a.click();
                                  setDownloadMenuIdx(null);
                                }}>📸 Последнюю версию</button>
                                <button onClick={(e) => {
                                  e.stopPropagation();
                                  versions.forEach((v, vi) => {
                                    setTimeout(() => {
                                      const a = document.createElement('a'); a.href = v; a.download = `SellerStudio_${i+1}_v${vi+1}_${Date.now()}.jpg`; a.click();
                                    }, vi * 300);
                                  });
                                  setDownloadMenuIdx(null);
                                }}>📦 Все версии ({versions.length})</button>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="photoshoot-placeholder"><div className="processing-spinner" style={{width:24,height:24}} /></div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="app-footer">
        <a href="/offer" target="_blank" rel="noreferrer">Публичная оферта</a>
      </footer>

      {/* OVERLAYS */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div className="processing-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <button className="processing-close-btn" onClick={() => setIsProcessing(false)} title="Скрыть">✕</button>
            <div style={{width:'90%', maxWidth:480}}>
              <TerminalOfMagic isActive={isProcessing} customMessage={processingMsg} />
              <p className="processing-hint" style={{textAlign:'center', marginTop:12}}>Обычно 30с — 2 мин</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* МОДАЛКА: Локация */}
      <AnimatePresence>
        {showLocModal && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowLocModal(false)}>
            <motion.div className="modal-content" initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} onClick={e=>e.stopPropagation()}>
              <div className="modal-title">📍 Оцифровать локацию</div>
              <input className="modal-input" placeholder="Название (напр. Студия Велес)" value={locName} onChange={e=>setLocName(e.target.value)} />
              <div className="drop-zone" onClick={()=>locFileRef.current?.click()}
                onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add('dragging');}}
                onDragLeave={e=>e.currentTarget.classList.remove('dragging')}
                onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');handleLocFiles(e.dataTransfer.files);}}>
                <input type="file" accept="image/*" multiple ref={locFileRef} style={{display:'none'}} onChange={e=>handleLocFiles(e.target.files)} />
                <p className="drop-zone-text">📸 Перетащите или нажмите</p>
                <p className="drop-zone-hint">2-5 фотографий локации с разных ракурсов</p>
                {locPreviews.length>0 && <div className="drop-zone-previews">{locPreviews.map((p,i)=><img key={i} src={p} alt="" />)}</div>}
              </div>
              <div className="modal-actions">
                <button className="modal-btn-cancel" onClick={()=>{setShowLocModal(false);setLocName('');setLocPreviews([]);}}>Отмена</button>
                <button className="modal-btn-primary" onClick={saveLoc} disabled={!locName.trim()||locPreviews.length<2}>Сохранить</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* МОДАЛКА: LoRA модель */}
      <AnimatePresence>
        <LoraModal show={showLoraModal} onClose={()=>{setShowLoraModal(false);setLoraName('');setLoraPhotos({front:null,left34:null,right34:null});}}
          onSave={saveLoraModel} loraName={loraName} setLoraName={setLoraName} loraPhotos={loraPhotos} setLoraPhotos={setLoraPhotos} />
      </AnimatePresence>

      {/* МОДАЛКА: Сохранить сгенерированную модель */}
      <AnimatePresence>
        {showSaveModelModal && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowSaveModelModal(false)}>
            <motion.div className="modal-content" initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} onClick={e=>e.stopPropagation()}>
              <div className="modal-title">⭐ Сохранить ИИ-модель</div>
              <p className="modal-hint">Дайте имя этой модели для использования в будущих генерациях</p>
              <input className="modal-input" placeholder="Например: Алина, рыжая" value={saveModelName} onChange={e=>setSaveModelName(e.target.value)} />
              <div className="modal-actions">
                <button className="modal-btn-cancel" onClick={()=>{setShowSaveModelModal(false);setSaveModelName('');}}>Отмена</button>
                <button className="modal-btn-primary" onClick={saveGenModel} disabled={!saveModelName.trim()}>Сохранить</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX with gallery navigation */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div className="lightbox-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <button className="lightbox-close" onClick={() => { setLightboxSrc(null); setLightboxGallery([]); }}>✕</button>
            {lightboxGallery.length > 1 && (
              <button className="lightbox-nav lightbox-nav--prev" onClick={e => {
                e.stopPropagation();
                const newIdx = (lightboxIdx - 1 + lightboxGallery.length) % lightboxGallery.length;
                setLightboxIdx(newIdx); setLightboxSrc(lightboxGallery[newIdx]);
              }}>‹</button>
            )}
            <img src={lightboxSrc} alt="Просмотр" className="lightbox-img" onClick={e => e.stopPropagation()} />
            {lightboxGallery.length > 1 && (
              <button className="lightbox-nav lightbox-nav--next" onClick={e => {
                e.stopPropagation();
                const newIdx = (lightboxIdx + 1) % lightboxGallery.length;
                setLightboxIdx(newIdx); setLightboxSrc(lightboxGallery[newIdx]);
              }}>›</button>
            )}
            <div className="lightbox-footer">
              {lightboxGallery.length > 1 && <span className="lightbox-counter">{lightboxIdx + 1} / {lightboxGallery.length}</span>}
              <button className="lightbox-download" onClick={e => { e.stopPropagation(); const a = document.createElement('a'); a.href = lightboxSrc; a.download = `SellerStudio_${Date.now()}.jpg`; a.click(); }}>⬇️ Скачать</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PHOTO EDITOR MODAL */}
      <AnimatePresence>
        {editingPhotoIdx !== null && photoshootImages[editingPhotoIdx] && (
          <motion.div className="photo-editor-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => { setEditingPhotoIdx(null); setPhotoEditText(''); }}>
            <motion.div className="photo-editor-modal" initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.9, opacity:0}} onClick={e => e.stopPropagation()}>
              <button className="photo-editor-close" onClick={() => { setEditingPhotoIdx(null); setPhotoEditText(''); }}>✕</button>
              <div className="photo-editor-preview">
                <img src={photoshootImages[editingPhotoIdx]} alt="Редактируемый кадр" />
                <span className="photo-editor-badge">Кадр {editingPhotoIdx + 1}</span>
              </div>
              <div className="photo-editor-controls">
                <p className="photo-editor-hint">Опишите, что изменить в этом кадре:</p>
                <textarea
                  className="photo-editor-input"
                  placeholder={appMode === 'product'
                    ? 'Сделай фон темнее, добавь блики, убери тени, поверни товар...'
                    : 'Убери татуировку, добавь очки, смени цвет волос...'}
                  value={photoEditText}
                  onChange={e => setPhotoEditText(e.target.value)}
                  rows={3}
                />
                <div className="photo-editor-quick-tags">
                  {(appMode === 'product'
                    ? ['Убрать тени', 'Ярче свет', 'Темнее фон', 'Добавить блики', 'Добавить текстуру', 'Другой ракурс']
                    : ['Убрать татуировку', 'Добавить очки', 'Сменить фон', 'Убрать пирсинг', 'Другая причёска', 'Добавить улыбку']
                  ).map(tag => (
                    <button key={tag} className="photo-editor-tag" onClick={() => setPhotoEditText(prev => prev ? `${prev}, ${tag.toLowerCase()}` : tag.toLowerCase())}>{tag}</button>
                  ))}
                </div>
                <button className="photo-editor-submit" onClick={handlePhotoEdit} disabled={!photoEditText.trim()}>
                  ✨ Применить изменения
                </button>
                <p className="photo-editor-hint" style={{fontSize:'0.7rem', opacity:0.5, textAlign:'center', marginTop:4}}>Модал закроется, редактирование пойдёт в фоне</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CALIBRATION WIZARD */}
      <AnimatePresence>
        <ModelCalibrationWizard
          show={showCalibWizard}
          onClose={() => setShowCalibWizard(false)}
          onSave={saveCalibratedModel}
          onStartCalibration={async () => {
            if (!user || user.isGuest || user.isAnonymous) {
              throw new Error('Для создания модели необходимо авторизоваться');
            }
            // Калибровка модели теперь бесплатна, кредиты не списываются.
          }}
          modelPrompt={getCurrentModelPrompt()}
          modelRefImages={getCurrentModelRefs()}
          userId={user?.uid}
        />
      </AnimatePresence>

      {/* ═══ CARD COUNT SELECTION MODAL ═══ */}
      <AnimatePresence>
        {showCardCountModal && (
          <motion.div
            className="card-examples-overlay"
            initial={{opacity:0}}
            animate={{opacity:1}}
            exit={{opacity:0}}
            onClick={() => setShowCardCountModal(false)}
          >
            <motion.div
              className="card-count-modal"
              initial={{opacity:0,scale:0.9,y:20}}
              animate={{opacity:1,scale:1,y:0}}
              exit={{opacity:0,scale:0.9,y:20}}
              transition={{type:'spring',stiffness:400,damping:25,mass:0.5}}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="card-count-title">🎯 Сколько карточек сделать?</h3>
              <p className="card-count-subtitle">Каждая карточка = 1 кредит</p>
              <div className="card-count-grid">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    className="card-count-btn"
                    onClick={() => { setCardVariantCount(n); startCardGeneration(n); }}
                  >
                    <span className="card-count-number">{n}</span>
                    <span className="card-count-label">{n === 1 ? 'карточка' : (n < 5 ? 'карточки' : 'карточек')}</span>
                  </button>
                ))}
              </div>
              <div className="card-count-custom">
                <input
                  type="number"
                  min="1"
                  max="20"
                  placeholder="Своё количество"
                  className="card-count-input"
                  value={customCardCount}
                  onChange={e => setCustomCardCount(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && parseInt(customCardCount) > 0) { startCardGeneration(parseInt(customCardCount)); }}}
                />
                <button
                  className="card-count-go"
                  disabled={!customCardCount || parseInt(customCardCount) < 1}
                  onClick={() => { const n = parseInt(customCardCount); if (n > 0) startCardGeneration(n); }}
                >
                  Создать →
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ CARD EXAMPLES MODAL ═══ */}
      <AnimatePresence>
        {showCardExamples && (
          <motion.div
            className="card-examples-overlay"
            initial={{opacity:0}}
            animate={{opacity:1}}
            exit={{opacity:0}}
            onClick={() => setShowCardExamples(false)}
          >
            <motion.div
              className="card-examples-modal"
              initial={{opacity:0,scale:0.9,y:40}}
              animate={{opacity:1,scale:1,y:0}}
              exit={{opacity:0,scale:0.9,y:40}}
              transition={{type:"spring",stiffness:400,damping:25,mass:0.5}}
              onClick={e => e.stopPropagation()}
            >
              <div className="card-examples-header">
                <h3>Примеры карточек до / после</h3>
                <button className="card-examples-close" onClick={() => setShowCardExamples(false)}>✕</button>
              </div>

              <div className="card-examples-tabs">
                <button
                  className={`card-examples-tab ${cardDesignStyle === 'natural' ? 'active' : ''}`}
                  onClick={() => setCardDesignStyle('natural')}
                >🌿 Естественная</button>
                <button
                  className={`card-examples-tab ${cardDesignStyle === 'epic' ? 'active' : ''}`}
                  onClick={() => setCardDesignStyle('epic')}
                >🔥 Эпичная</button>
              </div>

              <div className="card-examples-grid">
                {/* Glass example */}
                <div className="card-example-pair">
                  <div className="card-example-item">
                    <div className="card-example-label">До</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-glass-before.jpg' : '/examples/cards/epic-glass-before.jpg'} alt="Стакан до" />
                  </div>
                  <div className="card-example-arrow">→</div>
                  <div className="card-example-item">
                    <div className="card-example-label">После</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-glass-after.png' : '/examples/cards/epic-glass-after.png'} alt="Стакан после" />
                  </div>
                </div>

                {/* Pajama example */}
                <div className="card-example-pair">
                  <div className="card-example-item">
                    <div className="card-example-label">До</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-pajama-before.png' : '/examples/cards/epic-pajama-before.jpg'} alt="Пижама до" />
                  </div>
                  <div className="card-example-arrow">→</div>
                  <div className="card-example-item">
                    <div className="card-example-label">После</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-pajama-after.png' : '/examples/cards/epic-pajama-after.png'} alt="Пижама после" />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export default App;
