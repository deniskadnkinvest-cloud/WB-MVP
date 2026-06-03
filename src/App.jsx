import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODEL_PRESETS, POSE_PRESETS, BACKGROUND_PRESETS, ASPECT_RATIOS, CAMERA_ANGLES, getModelDetails, PRODUCT_CATEGORIES, PRODUCT_COMPOSITIONS, PRODUCT_BACKGROUNDS, PRODUCT_EFFECTS } from './data/presets';
import GenderToggle from './components/GenderToggle';
import DetailPanel from './components/DetailPanel';
import LoraModal from './components/LoraModal';
import ModelCalibrationWizard from './components/ModelCalibrationWizard';
import TerminalOfMagic from './components/TerminalOfMagic';
import LoginPage from './components/LoginPage';
import PricingModal from './components/PricingModal';
import SubscriptionBadge from './components/SubscriptionBadge';
import { useAuth } from './contexts/AuthContext';
import { getModels, saveModel, deleteModelDoc, updateModelPrompt, getLocations, saveLocation, deleteLocationDoc, updateLocationPrompt } from './lib/firestoreService';
import { uploadBase64Image, compressImage, uploadImage, deleteImage } from './lib/storageService';
import { getSubscription, useCredit, checkFeature, canGenerate, activatePlan } from './lib/subscriptionService';
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
  const [pricingLoading, setPricingLoading] = useState(false);

  // App mode: 'fashion' | 'product'
  const [appMode, setAppMode] = useState('fashion');

  // Product mode selections
  const [selectedProductCategory, setSelectedProductCategory] = useState(PRODUCT_CATEGORIES[0]);
  const [selectedProductComposition, setSelectedProductComposition] = useState(PRODUCT_COMPOSITIONS[0]);
  const [selectedProductBg, setSelectedProductBg] = useState(PRODUCT_BACKGROUNDS[0]);
  const [selectedProductEffect, setSelectedProductEffect] = useState(PRODUCT_EFFECTS[0]);

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
    const loadData = async () => {
      try {
        const [models, locations, sub] = await Promise.all([
          getModels(user.uid),
          getLocations(user.uid),
          getSubscription(user.uid),
        ]);
        setMyModels(models);
        setMyLocations(locations);
        setSubscription(sub);
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
        // Fallback to default 'none' plan so the app doesn't hang in null state
        setSubscription({ plan: 'none', credits: 0, creditsTotal: 0 });
      }
    };
    loadData();
  }, [user]);

  // Handle plan selection from PricingModal
  const handleSelectPlan = async (planId) => {
    if (!user) return;
    setPricingLoading(true);
    try {
      // ═══ TELEGRAM STARS PAYMENT FLOW ═══
      // В Telegram: создаём инвойс → openInvoice → webhook записывает в Firestore
      // Вне Telegram: fallback на прямую активацию (тестовый режим)
      if (isTelegram && window.Telegram?.WebApp?.openInvoice) {
        // Шаг 1: Создаём инвойс через API
        const invoiceResp = await fetch('/api/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, uid: user.uid }),
        });
        const invoiceData = await invoiceResp.json();

        if (!invoiceData.ok || !invoiceData.invoiceLink) {
          throw new Error(invoiceData.error || 'Не удалось создать счёт');
        }

        // Шаг 2: Открываем нативное окно оплаты Telegram Stars
        await new Promise((resolve, reject) => {
          window.Telegram.WebApp.openInvoice(invoiceData.invoiceLink, (status) => {
            if (status === 'paid') {
              resolve();
            } else if (status === 'cancelled') {
              reject(new Error('CANCELLED'));
            } else {
              reject(new Error(`Оплата не прошла: ${status}`));
            }
          });
        });

        // Шаг 3: Ждём пока webhook запишет подписку в Firestore (до 5 секунд)
        let sub = null;
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 500));
          sub = await getSubscription(user.uid);
          if (sub.plan === planId) break;
        }

        if (sub && sub.plan === planId) {
          setSubscription(sub);
          setShowPricing(false);
          setStatusText(`✅ Тариф «${planId.toUpperCase()}» оплачен! ${sub.credits} кредитов`);
          setStatusType('success');
        } else {
          // Webhook ещё не дошёл — показываем промежуточный статус
          setShowPricing(false);
          setStatusText('⏳ Оплата принята, активация через несколько секунд...');
          setStatusType('success');
          // Попробуем ещё раз через 5 секунд
          setTimeout(async () => {
            const freshSub = await getSubscription(user.uid);
            setSubscription(freshSub);
            if (freshSub.plan === planId) {
              setStatusText(`✅ Тариф «${planId.toUpperCase()}» активирован! ${freshSub.credits} кредитов`);
            }
          }, 5000);
        }
        return;

      } else {
        // ═══ FALLBACK: Прямая активация (вне Telegram / тестовый режим) ═══
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 8000)
        );

        let result;
        try {
          result = await Promise.race([
            activatePlan(user.uid, planId, { method: 'direct', note: 'Активация вне Telegram' }),
            timeoutPromise,
          ]);
        } catch (firestoreErr) {
          if (firestoreErr.message === 'TIMEOUT' || firestoreErr.code?.includes('permission')) {
            console.warn('⚠️ Firestore write blocked/timed out — activating plan locally (session only)');
            const { PLANS } = await import('./lib/subscriptionService');
            const plan = PLANS[planId];
            setSubscription({ plan: planId, credits: plan.credits, creditsTotal: plan.credits, planActivatedAt: new Date(), local: true });
            setShowPricing(false);
            setStatusText(`✅ Тариф «${planId.toUpperCase()}» активирован (сессия)! ${plan.credits} кредитов`);
            setStatusType('success');
            return;
          }
          throw firestoreErr;
        }

        setSubscription(await getSubscription(user.uid));
        setShowPricing(false);
        setStatusText(`✅ Тариф «${planId.toUpperCase()}» активирован! ${result.credits} кредитов`);
        setStatusType('success');
      }
    } catch (err) {
      if (err.message === 'CANCELLED') {
        setStatusText('Оплата отменена');
        setStatusType('');
      } else {
        console.error('Ошибка оплаты:', err);
        setStatusText(`Ошибка: ${err.message}`);
        setStatusType('error');
      }
    } finally {
      setPricingLoading(false);
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
  const buildDetailString = () => {
    const parts = [];
    Object.entries(modelDetails).forEach(([k, v]) => {
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

    // Deduct 1 credit (2 variants = 1 credit)
    if (subscription.local) {
      setSubscription(prev => ({ ...prev, credits: Math.max(0, prev.credits - 1) }));
    } else {
      try {
        const result = await useCredit(user.uid, 1);
        setSubscription(prev => ({ ...prev, credits: result.creditsRemaining }));
      } catch (err) {
        if (err.message === 'NO_CREDITS') {
          setShowPricing(true);
          setStatusText('⚡ Кредиты закончились — выберите тариф'); setStatusType('error');
          return;
        }
        if (err.message === 'NO_PLAN') {
          setShowPricing(true);
          return;
        }
      }
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
        
        if (selectedProductEffect && selectedProductEffect.prompt) {
          bgPrompt += `. Additionally: ${selectedProductEffect.prompt}`;
        }
        
        // Модель-человек в предметной съёмке
        if (productWithModel) {
          let humanPrompt = customProductModelPrompt.trim() || productModelPreset.prompt;
          if (productSavedModelId) {
            const sm = myModels.find(m => m.id === productSavedModelId);
            if (sm) { humanPrompt = sm.prompt || humanPrompt; modelRefImages = sm.imageUrls || []; }
          }
          // humanModelPrompt будет передан отдельно
          modelPrompt = modelPrompt; // product description stays
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
            if (selectedProductEffect && selectedProductEffect.prompt) {
              bgPrompt += `. Additionally: ${selectedProductEffect.prompt}`;
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

      // Generate 2 variants in parallel for user choice
      const seeds = [
        Math.random().toString(36).substring(2, 10).toUpperCase(),
        Math.random().toString(36).substring(2, 10).toUpperCase(),
      ];
      const buildBody = (seed) => JSON.stringify({
        garmentImageUrls: garmentUrls, modelPreset: modelPrompt, posePreset: posePrompt,
        cameraAngle: selectedCamera.prompt, backgroundPreset: bgPrompt,
        aspectRatio: selectedRatio.id, modelReferenceImages: modelRefImages,
        locationImages: locImages, customPoseText: customPoseText.trim() || undefined,
        attributes: modelDetails, isBeautyMode, biometricSeed: seed,
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
        setGeneratedImage(successImages[0]);
        setImageHistory(prev => {
          const h = [...prev, ...successImages.map((img, i) => ({ image: img, label: i === 0 ? '🎨 Вариант A' : '🎨 Вариант B' }))];
          setHistoryIndex(h.length - successImages.length);
          return h;
        });
        setStatusText(`Готово! ${successImages.length} вариант${successImages.length > 1 ? 'а — листайте ◀▶' : ''}`); setStatusType('success');
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
      console.log('📦 Saving calibrated model:', name, 'photos:', Object.keys(photos).filter(k => photos[k]));
      const photoEntries = Object.entries(photos).filter(([, v]) => v);
      const uploads = await Promise.all(photoEntries.map(async ([, base64]) => {
        return uploadBase64Image(user.uid, base64, 'models');
      }));
      const imageUrls = uploads.map(u => u.url);
      const storagePaths = uploads.map(u => u.path);
      await saveModel(user.uid, {
        name,
        type: 'calibrated',
        imageUrls,
        storagePaths,
        prompt: prompt || '',
      });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowCalibWizard(false);
      setStatusText('✅ Откалиброванная модель сохранена!');
      setStatusType('success');
      console.log('✅ Model saved successfully:', name);
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
    if (customModelPrompt.trim()) return customModelPrompt.trim();
    if (selectedSavedModelId) {
      const sm = myModels.find(m => m.id === selectedSavedModelId);
      if (sm?.prompt) return sm.prompt;
    }
    return selectedModel.prompt + buildDetailString();
  };

  // Get current model ref images for calibration
  // CRITICAL: Include generatedImage as PRIMARY reference so calibration
  // generates the SAME person that's currently on screen, not a new one.
  const getCurrentModelRefs = () => {
    const refs = [];
    // The generated render IS the person we want to calibrate
    if (generatedImage) refs.push(generatedImage);
    // Also include saved model refs if any
    if (selectedSavedModelId) {
      const sm = myModels.find(m => m.id === selectedSavedModelId);
      if (sm?.imageUrls) refs.push(...sm.imageUrls);
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
      return;
    }
    if (subscription.local) {
      setSubscription(prev => ({ ...prev, credits: Math.max(0, prev.credits - 1) }));
    } else {
      try {
        const result = await useCredit(user.uid, 1);
        setSubscription(prev => ({ ...prev, credits: result.creditsRemaining }));
      } catch (err) {
        if (err.message === 'NO_CREDITS' || err.message === 'NO_PLAN') {
          setShowPricing(true);
          setStatusText('⚡ Кредиты закончились'); setStatusType('error');
          return;
        }
      }
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
        
        if (selectedProductEffect && selectedProductEffect.prompt) {
          bgPrompt += `. Additionally: ${selectedProductEffect.prompt}`;
        }
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) {
            locImages = loc.imageUrls;
            bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
            if (selectedProductEffect && selectedProductEffect.prompt) {
              bgPrompt += `. Additionally: ${selectedProductEffect.prompt}`;
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
          garmentImageUrls: garmentUrls, modelPreset: modelPrompt, posePreset: posePrompt,
          cameraAngle: selectedCamera.prompt, backgroundPreset: bgPrompt,
          aspectRatio: selectedRatio.id, modelReferenceImages: editRefImages.length > 0 ? editRefImages : null,
          locationImages: locImages,
          editInstruction: mod,
          attributes: modelDetails, isBeautyMode, biometricSeed,
          isProductMode: appMode === 'product',
          categoryId: appMode === 'product' ? selectedProductCategory.id : undefined,
        }),
      });
      clearInterval(iv);
      const data = await safeParseJSON(resp);
      if (data.success) {
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

  // Auto-Catalog integration
  const handleAutoCatalog = async () => {
    if (!garmentUrls.length) {
      setStatusText('Сначала загрузите фото одежды'); setStatusType('error');
      return;
    }
    
    // ═══ SUBSCRIPTION CHECK ═══
    if (!canGenerate(subscription)) {
      setShowPricing(true);
      return;
    }
    if (subscription.local) {
      setSubscription(prev => ({ ...prev, credits: Math.max(0, prev.credits - 3) }));
    } else {
      try {
        // 3 credits for a batch run (discounted)
        const result = await useCredit(user.uid, 3);
        setSubscription(prev => ({ ...prev, credits: result.creditsRemaining }));
      } catch (err) {
        if (err.message === 'NO_CREDITS' || err.message === 'NO_PLAN') {
          setShowPricing(true);
          setStatusText('⚡ Кредиты закончились'); setStatusType('error');
          return;
        }
      }
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
      const resp = await fetch('http://localhost:3002/api/auto-catalog/start', {
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
        if (selectedProductEffect && selectedProductEffect.prompt) {
          bgPrompt += `. Additionally: ${selectedProductEffect.prompt}`;
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
            if (selectedProductEffect && selectedProductEffect.prompt) {
              bgPrompt += `. Additionally: ${selectedProductEffect.prompt}`;
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
            garmentImageUrls: garmentUrls, modelPreset: modelPrompt,
            posePreset: angle.pose, cameraAngle: angle.camera,
            backgroundPreset: bgPrompt, aspectRatio: selectedRatio.id,
            modelReferenceImages: modelRefImages, locationImages: locImages,
            attributes: modelDetails, isBeautyMode, biometricSeed,
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

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <motion.h1 className="app-logo" initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} transition={{duration:0.6}}>Селлер-Студия</motion.h1>
        <p className="app-subtitle">ИИ-фотостудия для маркетплейсов Ozon, WB и других</p>
        
        {/* Премиальный переключатель режимов */}
        <div className="mode-selector-wrapper">
          <div className="mode-selector-bg">
            <motion.div
              className="mode-selector-slider"
              animate={{ x: appMode === 'product' ? '100%' : '0%' }}
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
              📦 Товары (Предметка)
            </button>
          </div>
        </div>

        <div style={{marginTop:16,display:'flex',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap'}}>
          <SubscriptionBadge subscription={subscription} onClick={() => setShowPricing(true)} />
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
      />

      {/* 1. МУЛЬТИЗАГРУЗКА */}
      <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.15,duration:0.5,ease:[0.16,1,0.3,1]}}>
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
      </motion.div>

      {/* 2. НАСТРОЙКА ОБЪЕКТА / КАСТИНГ-РУМ */}
      {appMode === 'product' ? (
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
                            <img src={m.imageUrls?.[0] || ''} alt={m.name} />
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
                        <img src={m.imageUrls?.[0] || ''} alt={m.name} />
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
      )}

      {/* 3. ПОЗА ИЛИ КОМПОЗИЦИЯ */}
      {appMode === 'product' ? (
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
      )}

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
      <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.75,duration:0.5,ease:[0.16,1,0.3,1]}}>
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
              </>
            )}
          </>
        )}
      </motion.div>

      {/* 6. ФОРМАТ */}
      <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.9,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title"><span className="icon">📐</span> Формат изображения</div>
        <div className="preset-grid">
          {ASPECT_RATIOS.map(r => (
            <div key={r.id} className={`preset-card ${selectedRatio.id===r.id?'active':''}`} onClick={() => setSelectedRatio(r)}>
              <span className="emoji">{r.icon}</span><span className="label">{r.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* 7. ГЕНЕРАЦИЯ */}
      <motion.div className="generate-section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:1.05,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="beauty-toggle">
          <label className={`beauty-switch ${isBeautyMode ? 'active' : ''}`}>
            <input type="checkbox" checked={isBeautyMode} onChange={e => setIsBeautyMode(e.target.checked)} />
            <span className="beauty-label">{isBeautyMode ? '✨ Beauty-ретушь' : '📷 Реализм'}</span>
          </label>
          <span className="beauty-hint">
            {appMode === 'product' && !productWithModel
              ? (isBeautyMode ? 'Коммерческий глянец, идеальные поверхности' : 'Натуральные текстуры и материалы')
              : (isBeautyMode ? 'Журнальный глянец, идеальная кожа' : 'Натуральная кожа с текстурой')}
          </span>
        </div>
        
        <div style={{display: 'flex', gap: '10px', flexDirection: 'column'}}>
          <button className="generate-btn" onClick={handleGenerate} onMouseEnter={() => { fetch('/api/generate-image', { method: 'OPTIONS', keepalive: true }).catch(() => {}); }} disabled={!garmentUrls.length||isProcessing||isUploading}>{isUploading ? '☁️ Загрузка в облако...' : '✨ Сгенерировать студийный кадр'}</button>
          <button className="generate-btn" style={{background: 'linear-gradient(135deg, #8b5cf6, #d946ef)'}} onClick={handleAutoCatalog} disabled={!garmentUrls.length||isProcessing||isUploading}>{isUploading ? '☁️ Загрузка...' : '🏭 Отправить в Auto-Catalog (Batch)'}</button>
        </div>

        <div className="status-bar">{statusText && <p className={`status-text ${statusType}`}>{statusText}</p>}</div>
      </motion.div>

      {/* 8. РЕЗУЛЬТАТ */}
      <AnimatePresence>
        {generatedImage && (
          <motion.div className="section result-section" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:0.5}}>
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
          modelPrompt={getCurrentModelPrompt()}
          modelRefImages={getCurrentModelRefs()}
        />
      </AnimatePresence>
    </div>
  );
}
export default App;
