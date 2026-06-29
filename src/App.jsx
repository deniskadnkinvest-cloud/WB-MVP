import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODEL_PRESETS, POSE_PRESETS, BACKGROUND_PRESETS, ASPECT_RATIOS, CAMERA_ANGLES, getModelDetails, PRODUCT_CATEGORIES, PRODUCT_COMPOSITIONS, PRODUCT_BACKGROUNDS, PRODUCT_EFFECTS } from './data/presets';
import { runBatchQueue, MAX_BATCH_SIZE, BATCH_CONFIRM_THRESHOLD, BATCH_CONCURRENCY } from './utils/batchQueue';
// Card prompts now live on the backend only (generate-image.js)
import ModelCalibrationWizard from './components/ModelCalibrationWizard';
import GenderToggle from './components/GenderToggle';
import DetailPanel from './components/DetailPanel';
import LoraModal from './components/LoraModal';
import PersonaWizard from './components/PersonaWizard';
import TerminalOfMagic from './components/TerminalOfMagic';
import LoginPage from './components/LoginPage';
import PricingModal from './components/PricingModal';
import SubscriptionBadge from './components/SubscriptionBadge';
import MyHistoryPage from './components/MyHistoryPage';
import { useAuth } from './contexts/AuthContext';
import { getModels, saveModel, deleteModelDoc, updateModelPrompt, getLocations, saveLocation, deleteLocationDoc, updateLocationPrompt, patchLocation } from './lib/userDataService';
import { uploadBase64Image, compressImage, uploadImage, deleteImage, downloadStoragePathAsBase64 } from './lib/storageService';
import { getSubscription, checkFeature, canGenerate, activatePlan } from './lib/subscriptionService';
// CardLayerStudio removed — replaced by text-based card editing
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
  const [appMode, setAppMode] = useState(() => {
    return localStorage.getItem('vton_appMode') || 'fashion';
  });

  // Product mode selections
  const [selectedProductCategory, setSelectedProductCategory] = useState(PRODUCT_CATEGORIES[0]);
  const [selectedProductCompositions, setSelectedProductCompositions] = useState([PRODUCT_COMPOSITIONS[0]]);
  const [selectedProductBgs, setSelectedProductBgs] = useState([PRODUCT_BACKGROUNDS[0]]);
  const [selectedProductEffects, setSelectedProductEffects] = useState([PRODUCT_EFFECTS[0]]);
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
  const [selectedModels, setSelectedModels] = useState([MODEL_PRESETS[0]]);
  const [selectedPoses, setSelectedPoses] = useState([POSE_PRESETS[0]]);
  const [selectedBgs, setSelectedBgs] = useState([BACKGROUND_PRESETS[0]]);
  const [selectedRatios, setSelectedRatios] = useState([ASPECT_RATIOS[0]]);
  const [selectedCameras, setSelectedCameras] = useState([CAMERA_ANGLES[0]]);

  // Gender
  const [gender, setGender] = useState('female');

  // Model details map (saves details per model ID)
  const [modelDetailsMap, setModelDetailsMap] = useState({});
  const [activeModelDetailsId, setActiveModelDetailsId] = useState(MODEL_PRESETS[0]?.id || 'slavya');
  const [showDetails, setShowDetails] = useState(false);

  const modelDetails = modelDetailsMap[activeModelDetailsId] || initDetails();
  const setModelDetails = (updatedFields) => {
    setModelDetailsMap(prev => ({
      ...prev,
      [activeModelDetailsId]: typeof updatedFields === 'function' ? updatedFields(prev[activeModelDetailsId] || initDetails()) : updatedFields
    }));
  };

  // Custom text inputs
  const [customModelPrompt, setCustomModelPrompt] = useState('');
  const [customPoseText, setCustomPoseText] = useState('');
  const [customBgText, setCustomBgText] = useState('');

  // Custom variant chips (user-created presets alongside preset cards)
  const [customModelChips, setCustomModelChips] = useState([]);
  const [customPoseChips, setCustomPoseChips] = useState([]);
  const [customBgChips, setCustomBgChips] = useState([]);
  const [addingCustom, setAddingCustom] = useState(null); // 'model'|'pose'|'bg'|null
  const [newChipText, setNewChipText] = useState('');
  const [customChipModalSection, setCustomChipModalSection] = useState(null);
  const [editingChip, setEditingChip] = useState(null); // { id, label, section } | null

  // Locations
  const [bgTab, setBgTab] = useState('presets');
  const [myLocations, setMyLocations] = useState([]);
  const [showLocModal, setShowLocModal] = useState(false);
  const [locName, setLocName] = useState('');
  const [locFiles, setLocFiles] = useState([]);
  const [locPreviews, setLocPreviews] = useState([]);
  const [selectedLocId, setSelectedLocId] = useState(null);
  const [locBase64Cache, setLocBase64Cache] = useState({}); // id → base64 image array
  const locFileRef = useRef(null);

  // Saved models (LoRA)
  const [modelTab, setModelTab] = useState('presets');
  const [myModels, setMyModels] = useState([]);
  const [selectedSavedModelId, setSelectedSavedModelId] = useState(null);
  const [showLoraModal, setShowLoraModal] = useState(false);
  const [loraName, setLoraName] = useState('');
  const [loraPhotos, setLoraPhotos] = useState({ front: null, left34: null, right34: null, fullbody: null });
  const [showSaveModelModal, setShowSaveModelModal] = useState(false);
  const [saveModelName, setSaveModelName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Calibration wizard
  const [showCalibWizard, setShowCalibWizard] = useState(false);
  const [calibPurpose, setCalibPurpose] = useState('save'); // 'save' | 'photoshoot'
  const [showPersonaWizard, setShowPersonaWizard] = useState(false);
  const [cardWithModel, setCardWithModel] = useState(false);
  const [viewingCompCard, setViewingCompCard] = useState(null); // comp card URL for lightbox


  // Multi-upload garments
  const [imageFiles, setImageFiles] = useState([]);
  const [garmentUrls, setGarmentUrls] = useState(() => {
    try {
      const saved = localStorage.getItem('vton_garmentUrls');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }); // Firebase Storage URLs (lightweight)
  const [previewUrls, setPreviewUrls] = useState(() => {
    try {
      const saved = localStorage.getItem('vton_garmentUrls');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Processing
  const [generatedImage, setGeneratedImage] = useState(() => {
    return localStorage.getItem('vton_generatedImage') || null;
  });
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

  // Batch queue progress
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0, running: 0 });
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [pendingBatchTasks, setPendingBatchTasks] = useState(null);

  // ═══ CUSTOM CHIP HELPERS ═══
  const IMPROV_POSE = { id: 'improvisation', label: 'Импровизация', emoji: '🎲', prompt: 'random aesthetic fashion pose, natural dynamic body positioning, editorial spontaneous movement, varied creative posture' };

  const addCustomChip = (section) => {
    if (!newChipText.trim()) { setAddingCustom(null); return; }
    const chip = { id: `custom_${Date.now()}`, label: newChipText.trim(), prompt: newChipText.trim(), emoji: '✏️', isCustomChip: true };
    if (section === 'model') { 
      setCustomModelChips(prev => [...prev, chip]); 
      setCustomModelPrompt(''); 
      setActiveModelDetailsId(chip.id);
      setShowDetails(true);
    }
    else if (section === 'pose') { setCustomPoseChips(prev => [...prev, chip]); setCustomPoseText(''); }
    else if (section === 'bg') { setCustomBgChips(prev => [...prev, chip]); setCustomBgText(''); }
    setNewChipText('');
    setAddingCustom(null);
  };

  const removeCustomChip = (section, chipId) => {
    if (section === 'model') setCustomModelChips(prev => prev.filter(c => c.id !== chipId));
    else if (section === 'pose') setCustomPoseChips(prev => prev.filter(c => c.id !== chipId));
    else if (section === 'bg') setCustomBgChips(prev => prev.filter(c => c.id !== chipId));
  };

  const openEditChipModal = (section, chip) => {
    setEditingChip({ id: chip.id, label: chip.label, section });
    setNewChipText(chip.label);
  };

  const saveEditCustomChip = () => {
    if (!editingChip || !newChipText.trim()) {
      setEditingChip(null);
      setNewChipText('');
      return;
    }
    const section = editingChip.section;
    const chipId = editingChip.id;
    const updater = (prev) =>
      prev.map((c) =>
        c.id === chipId
          ? { ...c, label: newChipText.trim(), prompt: newChipText.trim() }
          : c
      );
    if (section === 'model') setCustomModelChips(updater);
    else if (section === 'pose') setCustomPoseChips(updater);
    else if (section === 'bg') setCustomBgChips(updater);
    setEditingChip(null);
    setNewChipText('');
  };

  const getActiveModelLabel = () => {
    const foundPreset = MODEL_PRESETS.find(m => m.id === activeModelDetailsId);
    if (foundPreset) return foundPreset.label;
    const foundCustom = customModelChips.find(c => c.id === activeModelDetailsId);
    if (foundCustom) return foundCustom.label;
    return 'выбранной модели';
  };

  // Is multi-model selected? (for showing Импровизация pose)
  const isMultiModel = !customModelPrompt && !selectedSavedModelId && (selectedModels.length + customModelChips.length) > 1;

  // ═══ TOTAL SHOTS CALCULATION ═══
  const totalShots = React.useMemo(() => {
    if (appMode === 'quick') return 1;

    if (appMode === 'product') {
      const compCount = customPoseText.trim() ? 1 : selectedProductCompositions.length;
      const bgCount = (customProductBg.trim() || selectedLocId) ? 1 : selectedProductBgs.length;
      const effectCount = customProductEffectText.trim() ? 1 : selectedProductEffects.length;
      const ratioCount = selectedRatios.length;
      return compCount * bgCount * effectCount * ratioCount * variantCount;
    } else {
      // appMode === 'fashion' (VTON)
      const modelCount = (customModelPrompt.trim() || selectedSavedModelId) ? 1 : (selectedModels.length + customModelChips.length);
      const poseCount = customPoseText.trim() ? 1 : (selectedPoses.length + customPoseChips.length);
      const cameraCount = selectedCameras.length;
      const bgCount = (customBgText.trim() || selectedLocId) ? 1 : (selectedBgs.length + customBgChips.length);
      const ratioCount = selectedRatios.length;
      return modelCount * poseCount * cameraCount * bgCount * ratioCount * variantCount;
    }
  }, [
    appMode,
    customPoseText,
    selectedProductCompositions,
    customProductBg,
    selectedLocId,
    selectedProductBgs,
    customProductEffectText,
    selectedProductEffects,
    selectedRatios,
    variantCount,
    customModelPrompt,
    selectedSavedModelId,
    selectedModels,
    selectedPoses,
    selectedCameras,
    customBgText,
    selectedBgs,
    customModelChips,
    customPoseChips,
    customBgChips
  ]);

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
  // [QUICK_MODE_V2] — Card generation + text-based editing
  const [quickMode, setQuickMode] = useState(() => {
    return localStorage.getItem('vton_quickMode') || 'photo';
  }); // 'photo' | 'card'
  const [quickCardImage, setQuickCardImage] = useState(() => {
    return localStorage.getItem('vton_quickCardImage') || null;
  }); // Generated card image
  const [cardEditHistory, setCardEditHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('vton_cardEditHistory');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }); // [{image, editText}]
  const [cardEditText, setCardEditText] = useState(''); // Current edit text input
  const [isCardEditing, setIsCardEditing] = useState(false); // Edit in progress
  const [userProductInfo, setUserProductInfo] = useState(() => {
    return localStorage.getItem('vton_userProductInfo') || '';
  }); // Optional product info from seller

  // Results cache + abort
  const [quickResults, setQuickResults] = useState(() => {
    try {
      const saved = localStorage.getItem('vton_quickResults');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });
  const abortControllerRef = useRef(null);
  const [isGalleryGenerating, setIsGalleryGenerating] = useState(false);
  const [isAbGenerating, setIsAbGenerating] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // null | { type, cost, onConfirm }

  // ═══ LOCALSTORAGE SYNC EFFECTS ═══
  useEffect(() => {
    localStorage.setItem('vton_appMode', appMode);
  }, [appMode]);

  useEffect(() => {
    localStorage.setItem('vton_quickMode', quickMode);
  }, [quickMode]);

  useEffect(() => {
    if (generatedImage) {
      localStorage.setItem('vton_generatedImage', generatedImage);
    } else {
      localStorage.removeItem('vton_generatedImage');
    }
  }, [generatedImage]);

  useEffect(() => {
    if (quickCardImage) {
      localStorage.setItem('vton_quickCardImage', quickCardImage);
    } else {
      localStorage.removeItem('vton_quickCardImage');
    }
  }, [quickCardImage]);

  useEffect(() => {
    localStorage.setItem('vton_cardEditHistory', JSON.stringify(cardEditHistory));
  }, [cardEditHistory]);

  useEffect(() => {
    localStorage.setItem('vton_quickResults', JSON.stringify(quickResults));
  }, [quickResults]);

  useEffect(() => {
    localStorage.setItem('vton_garmentUrls', JSON.stringify(garmentUrls));
  }, [garmentUrls]);

  useEffect(() => {
    localStorage.setItem('vton_userProductInfo', userProductInfo);
  }, [userProductInfo]);

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
    if (!user || user.isGuest || (user.isAnonymous && !user.isTelegramUser)) return;
    
    // Загружаем данные параллельно и асинхронно, не блокируя отрисовку интерфейса
    getModels(user.uid)
      .then((models) => {

        setMyModels(models || []);
      })
      .catch((err) => console.error('Ошибка загрузки моделей:', err));

    getLocations(user.uid)
      .then(async (locations) => {
        setMyLocations(locations || []);
        // Pre-fill base64 cache from saved inline base64
        const cache = {};
        (locations || []).forEach(loc => {
          if (loc.imageBase64 && loc.imageBase64.length > 0) {
            cache[loc.id] = loc.imageBase64;
          }
        });
        if (Object.keys(cache).length > 0) setLocBase64Cache(prev => ({ ...prev, ...cache }));

        // === SILENT MIGRATION: backfill imageBase64 for legacy locations ===
        const needsMigration = (locations || []).filter(
          loc => !loc.imageBase64 && loc.storagePaths && loc.storagePaths.length > 0
        );
        if (needsMigration.length > 0) {
          console.log(`🔄 Migrating ${needsMigration.length} legacy location(s) via Firebase SDK...`);
          const uid = user.uid;
          for (const loc of needsMigration) {
            try {
              // Use Firebase Storage SDK (auth-aware) — bypasses CORS and Storage Rules
              // Strategy 1: Firebase SDK getBytes (auth-aware, bypasses CORS)
              let b64arr = [];
              if (loc.storagePaths && loc.storagePaths.length > 0) {
                b64arr = await Promise.all(
                  loc.storagePaths.slice(0, 5).map(path => downloadStoragePathAsBase64(path))
                );
              }
              // Strategy 2: fallback — direct URL fetch (may work if Storage Rules allow token access)
              if (b64arr.filter(Boolean).length === 0 && loc.imageUrls && loc.imageUrls.length > 0) {
                console.log(`↩️ SDK failed for '${loc.title}', trying direct URL fetch...`);
                b64arr = await Promise.all(
                  loc.imageUrls.slice(0, 5).map(async (url) => {
                    try {
                      const resp = await fetch(url, { mode: 'cors' });
                      if (!resp.ok) return null;
                      const blob = await resp.blob();
                      return await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                      });
                    } catch { return null; }
                  })
                );
              }
              const validB64 = b64arr.filter(Boolean);
              if (validB64.length > 0) {
                await patchLocation(uid, loc.id, { imageBase64: validB64 });
                setLocBase64Cache(prev => ({ ...prev, [loc.id]: validB64 }));
                setMyLocations(prev => prev.map(l =>
                  l.id === loc.id ? { ...l, imageBase64: validB64 } : l
                ));
                console.log(`✅ Migrated loc '${loc.title}' (${validB64.length} images)`);
              } else {
                console.warn(`⚠️ Could not migrate loc '${loc.title}' — both SDK and URL fetch failed. Storage Rules may block all reads.`);
              }
            } catch (err) {
              console.warn(`⚠️ Migration failed for loc '${loc.title}':`, err.message);
            }
          }
          console.log('✅ Location migration complete');
        }
      })
      .catch((err) => console.error('Ошибка загрузки локаций:', err));
    // Загрузка подписки
    // Миграция legacy-подписок теперь происходит в /api/auth-telegram при входе,
    // поэтому здесь просто читаем подписку по стабильному UID
    getSubscription(user.uid, user.email, user.telegramId)
      .then((sub) => {
        if (sub) setSubscription(sub);
      })
      .catch((err) => {
        console.error('Ошибка загрузки подписки:', err);
        setSubscription({ plan: 'none', credits: 0, creditsTotal: 0 });
      });
  }, [user]);

  // Обновляет баланс кредитов после генерации — переполучает подписку из Firestore
  const refreshCreditsFromResponse = async (_responseData) => {
    if (!user?.uid) return;
    try {
      const fresh = await getSubscription(user.uid, user.email, user.telegramId);
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
            const sub = await getSubscription(user.uid, user.email, user.telegramId);
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
      const idToken = await user.getIdToken();
      console.log('[Payment] Starting payment for plan:', planId, 'uid:', user.uid);
      // Шаг 1: Создаём платёжную сессию ЮKassa на бэкенде
      const invoiceResp = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ planId, uid: user.uid }),
      });
      console.log('[Payment] API response status:', invoiceResp.status, invoiceResp.statusText);
      const invoiceData = await safeParseJSON(invoiceResp);
      console.log('[Payment] API response body:', JSON.stringify(invoiceData));

      if (!invoiceData.ok || !invoiceData.invoiceLink) {
        throw new Error(invoiceData.error || 'Не удалось создать платеж');
      }

      // Шаг 2: Перенаправляем пользователя на форму оплаты ЮKassa
      const paymentUrl = invoiceData.invoiceLink;
      console.log('[Payment] Redirecting to:', paymentUrl);
      
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
      console.error('[Payment] Ошибка оплаты:', err);
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
    if (filtered.length > 0) { setSelectedModels([filtered[0]]); setCustomModelPrompt(''); setSelectedSavedModelId(null); }
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
    const np = previewUrls.filter((_,i) => i !== idx);
    setImageFiles(nf);
    setPreviewUrls(np);
    setGarmentUrls(nu);
    if (!nu.length) setStatusText('');
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
    'Полное': 'BODY TYPE: obese plus-size body, BMI 35+, large round fat belly, thick heavy neck, prominent double chin, chubby cheeks, wide thick torso, US clothing size 3XL, heavy-set build with visible body fat and round chubby face. The person MUST look explicitly fat and overweight, not slim.',
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

  // ═══ AUTH FETCH: добавляет Firebase ID Token ко всем API-запросам ═══
  const authFetch = async (url, options = {}) => {
    const token = user ? await user.getIdToken() : null;
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });
  };

  const GENERATION_REQUEST_TIMEOUT_MS = 180000;
  const createIdempotencyKey = (prefix = 'gen') => {
    const randomPart = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    return `${prefix}:${Date.now()}:${randomPart}`;
  };

  const handleGenerate = async (skipConfirm = false) => {
    if (!garmentUrls.length) return;

    // ═══ SUBSCRIPTION CHECK ═══
    if (!canGenerate(subscription)) {
      setShowPricing(true);
      setStatusText('⚡ Для генерации нужен активный тариф'); setStatusType('error');
      return;
    }
    if ((subscription.credits || 0) < totalShots) {
      setStatusText(`⚡ Недостаточно кредитов: нужно ${totalShots}, доступно ${subscription.credits || 0}`); setStatusType('error');
      return;
    }

    // Лимит 20 генераций за раз
    if (totalShots > 20) {
      setStatusText('⚠️ Превышен лимит: максимум 20 генераций за раз.'); setStatusType('error');
      return;
    }

    // Если кадров >= 6, запрашиваем подтверждение
    if (totalShots >= 6 && !skipConfirm) {
      triggerConfirm('batch', totalShots, () => handleGenerate(true));
      return;
    }

    const runBatchGeneration = async () => {
      setIsProcessing(true); setGeneratedImage(null); setStatusText('');
      setProcessingMsg('Подготавливаем исходники...');
      
      let msgI = 0;
      const iv = setInterval(() => { 
        if (totalShots === 1) {
          setProcessingMsg(msgI < MSGS.length ? MSGS[msgI++] : 'Финальные штрихи...'); 
        }
      }, 8000);

      try {
        // Формируем плоский список задач
        const tasks = [];

        if (appMode === 'product') {
          // Композиции
          const compsToUse = customPoseText.trim() ? [{ id: 'custom', prompt: customPoseText.trim(), label: 'Своя композиция' }] : selectedProductCompositions;
          // Фоны
          const bgsToUse = (customProductBg.trim() || selectedLocId) 
            ? [{ id: selectedLocId || 'custom', prompt: customProductBg.trim(), isLoc: !!selectedLocId }]
            : selectedProductBgs;
          // Спецэффекты
          const effectsToUse = customProductEffectText.trim()
            ? [{ id: 'custom', prompt: customProductEffectText.trim(), label: 'Свой эффект' }]
            : selectedProductEffects;
          // Форматы
          const ratiosToUse = selectedRatios;

          compsToUse.forEach(comp => {
            bgsToUse.forEach(bg => {
              effectsToUse.forEach(effect => {
                ratiosToUse.forEach(ratio => {
                  for (let i = 0; i < variantCount; i++) {
                    const seed = Math.random().toString(36).substring(2, 10).toUpperCase();
                    tasks.push({ comp, bg, effect, ratio, variantIndex: i + 1, seed });
                  }
                });
              });
            });
          });
        } else {
          // appMode === 'fashion' (VTON)
          // Модели
          const modelsToUse = (customModelPrompt.trim() || selectedSavedModelId)
            ? [{ id: selectedSavedModelId || 'custom', prompt: customModelPrompt.trim(), isSaved: !!selectedSavedModelId }]
            : [...selectedModels, ...customModelChips];
          // Позы
          const posesToUse = customPoseText.trim()
            ? [{ id: 'custom', prompt: customPoseText.trim(), label: 'Своя поза' }]
            : [...selectedPoses, ...customPoseChips];
          // Ракурсы
          const camerasToUse = selectedCameras;
          // Фоны
          const bgsToUse = (customBgText.trim() || selectedLocId)
            ? [{ id: selectedLocId || 'custom', prompt: customBgText.trim(), isLoc: !!selectedLocId }]
            : [...selectedBgs, ...customBgChips];
          // Форматы
          const ratiosToUse = selectedRatios;

          modelsToUse.forEach(model => {
            posesToUse.forEach(pose => {
              camerasToUse.forEach(camera => {
                bgsToUse.forEach(bg => {
                  ratiosToUse.forEach(ratio => {
                    for (let i = 0; i < variantCount; i++) {
                      const seed = Math.random().toString(36).substring(2, 10).toUpperCase();
                      tasks.push({ model, pose, camera, bg, ratio, variantIndex: i + 1, seed });
                    }
                  });
                });
              });
            });
          });
        }

        setProcessingMsg('🚀 Запускаем генерации...');
        let completedCount = 0;
        let failedCount = 0;
        const results = [];

        const updateProgressText = () => {
          if (totalShots > 1) {
            setProcessingMsg(`📸 Генерация: готово ${completedCount} из ${totalShots} кадров` + 
              (failedCount > 0 ? ` (ошибок: ${failedCount})` : '') + 
              `...\nПожалуйста, не закрывайте вкладку.`);
          }
        };

        const runTask = async (taskIndex) => {
          const task = tasks[taskIndex];
          try {
            let body = {};
            if (appMode === 'product') {
              let taskBgPrompt = task.bg.prompt;
              if (task.effect.id !== 'none') {
                const effectPrompt = task.effect.id === 'custom' ? customProductEffectText.trim() : task.effect.prompt;
                if (effectPrompt) taskBgPrompt += `. Additionally: ${effectPrompt}`;
              }

              let locImages = null;
              if (task.bg.isLoc) {
                const loc = myLocations.find(l => l.id === task.bg.id);
                if (loc) {
                  locImages = locBase64Cache[loc.id] || loc.imageBase64 || loc.imageUrls;
                  taskBgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
                  if (task.effect.id !== 'none') {
                    const effectPrompt = task.effect.id === 'custom' ? customProductEffectText.trim() : task.effect.prompt;
                    if (effectPrompt) taskBgPrompt += `. Additionally: ${effectPrompt}`;
                  }
                }
              }

              let modelRefImages = null;
              let humanPrompt = undefined;
              if (productWithModel) {
                humanPrompt = customProductModelPrompt.trim() || (productModelPreset.prompt + buildDetailString(productModelDetails));
                if (productSavedModelId) {
                  const sm = myModels.find(m => m.id === productSavedModelId);
                  if (sm) {
                    humanPrompt = sm.prompt || humanPrompt;
                    modelRefImages = sm.imageUrls || [];
                  }
                }
              }

              body = {
                userId: user?.uid || null,
                garmentImageUrls: garmentUrls, 
                modelPreset: customProductPrompt.trim() || selectedProductCategory.defaultPrompt, 
                posePreset: task.comp.prompt,
                compositionId: task.comp.id,
                cameraAngle: selectedCameras[0].prompt, 
                backgroundPreset: taskBgPrompt,
                sceneId: task.bg.id,
                aspectRatio: task.ratio.id, 
                modelReferenceImages: modelRefImages,
                locationImages: locImages,
                attributes: productModelDetails, 
                isBeautyMode, 
                biometricSeed: task.seed,
                isProductMode: true,
                categoryId: selectedProductCategory.id,
                withHumanModel: productWithModel,
                humanModelPrompt: humanPrompt || undefined,
                humanModelRefImages: modelRefImages || undefined,
                idempotencyKey: createIdempotencyKey('batch')
              };
            } else {
              // appMode === 'fashion' (VTON)
              let modelPrompt = task.model.isSaved ? task.model.prompt : (customModelPrompt.trim() || (task.model.prompt + buildDetailString(modelDetailsMap[task.model.id])));
              let modelRefImages = null;
              if (task.model.isSaved) {
                const sm = myModels.find(m => m.id === task.model.id);
                if (sm) {
                  modelPrompt = sm.prompt || modelPrompt;
                  modelRefImages = sm.imageUrls || [];
                }
              }
              if (modelModifier.trim()) modelPrompt += `. Additionally: ${modelModifier.trim()}`;

              let taskBgPrompt = task.bg.prompt;
              let locImages = null;
              if (task.bg.isLoc) {
                const loc = myLocations.find(l => l.id === task.bg.id);
                if (loc) {
                  locImages = locBase64Cache[loc.id] || loc.imageBase64 || loc.imageUrls; // prefer pre-fetched base64
                  taskBgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
                }
              }
              if (locModifier.trim()) taskBgPrompt += `. Additionally: ${locModifier.trim()}`;
              if (bgExtraText.trim() && !customBgText.trim()) taskBgPrompt += `. MANDATORY SCENE ADDITION (must be visible): ${bgExtraText.trim()}`;

              body = {
                userId: user?.uid || null,
                garmentImageUrls: garmentUrls,
                modelPreset: modelPrompt,
                posePreset: task.pose.prompt,
                cameraAngle: task.camera.prompt,
                backgroundPreset: taskBgPrompt,
                sceneId: task.bg.id,
                aspectRatio: task.ratio.id,
                modelReferenceImages: modelRefImages,
                locationImages: locImages,
                customPoseText: customPoseText.trim() || undefined,
                attributes: modelDetailsMap[task.model.id] || initDetails(),
                isBeautyMode,
                biometricSeed: task.seed,
                isProductMode: false,
                idempotencyKey: createIdempotencyKey('batch')
              };
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), GENERATION_REQUEST_TIMEOUT_MS);
            let data;
            try {
              const resp = await authFetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify(body)
              });
              data = await safeParseJSON(resp);
            } finally {
              clearTimeout(timeoutId);
            }
            results.push({ ...data, task });

            if (data.success) {
              completedCount++;
              const img = data.imageBase64 || data.imageUrl;
              setGeneratedImage(img);
              setImageHistory(prev => {
                const label = appMode === 'product'
                  ? `🎨 ${task.comp.label || 'Кадр'} (${task.variantIndex})`
                  : `🎨 ${task.pose.label || 'Поза'} (${task.variantIndex})`;
                const h = [...prev, { image: img, label }];
                setHistoryIndex(h.length - 1);
                return h;
              });
            } else {
              failedCount++;
              console.error('Task failed:', data.error || data.details);
            }
          } catch (taskErr) {
            failedCount++;
            results.push({ success: false, error: taskErr.message, task });
            console.error('Task execution error:', taskErr.message);
          } finally {
            updateProgressText();
          }
        };

        await Promise.allSettled(tasks.map((_, taskIndex) => runTask(taskIndex)));

        clearInterval(iv);
        const lastWithCredits = [...results].reverse().find(r => r?.creditsRemaining != null);
        if (lastWithCredits) refreshCreditsFromResponse(lastWithCredits);

        const successItems = results.filter(r => r.success);
        if (successItems.length > 0) {
          const pluralForm = successItems.length === 1 ? '' : (successItems.length < 5 ? 'а — листайте ◀▶' : ' — листайте ◀▶');
          setStatusText(`Готово! ${successItems.length} вариант${pluralForm}${failedCount > 0 ? ` (${failedCount} не удалось — кредиты возвращены)` : ''}`); setStatusType('success');
        } else {
          setStatusText(`Ошибка: ${results[0]?.details || results[0]?.error || 'Неизвестная ошибка'}. Кредиты возвращены.`); setStatusType('error');
        }

      } catch (err) {
        setStatusText(`Ошибка: ${err.message}`); setStatusType('error');
        clearInterval(iv);
      } finally {
        setIsProcessing(false);
      }
    };

    await runBatchGeneration();
  };

  const handleDownload = () => { if (!generatedImage) return; const a = document.createElement('a'); a.href = generatedImage; a.download = `SellerStudio_${Date.now()}.jpg`; a.click(); };

  // Location helpers
  const handleLocFiles = async (files) => {
    const arr = Array.from(files).slice(0, 5);
    setLocFiles(arr);
    setLocPreviews(arr.map(f => URL.createObjectURL(f)));
  };

  // Конвертация URL → base64 на клиенте (обходим проблемы Firebase Storage Rules)
  const urlToBase64Client = async (url) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result); // data:image/...;base64,...
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('urlToBase64Client failed:', err.message);
      return null;
    }
  };

  // Выбор локации с предварительной конвертацией картинок в base64
  const selectLocation = async (locId) => {
    setSelectedLocId(locId);
    if (!locId || locBase64Cache[locId]) return; // уже есть в кеше
    const loc = myLocations.find(l => l.id === locId);
    if (!loc) return;

    // Сначала пробуем использовать готовый imageBase64 (из Firestore)
    if (loc.imageBase64 && loc.imageBase64.length > 0) {
      setLocBase64Cache(prev => ({ ...prev, [locId]: loc.imageBase64 }));
      console.log(`📍 Pre-fetched ${loc.imageBase64.length} loc images as base64 directly from Firestore for loc ${locId}`);
      return;
    }

    if (!loc.imageUrls) return;
    const b64arr = await Promise.all(loc.imageUrls.slice(0, 5).map(urlToBase64Client));
    const valid = b64arr.filter(Boolean);
    if (valid.length > 0) {
      setLocBase64Cache(prev => ({ ...prev, [locId]: valid }));
      console.log(`📍 Pre-fetched ${valid.length} loc images as base64 for loc ${locId}`);
    } else {
      console.warn(`⚠️ Could not pre-fetch any loc images for ${locId}, will use raw URLs`);
    }
  };

  const saveLoc = async () => {
    if (!locName.trim() || locFiles.length < 2 || !user) return;
    setIsSaving(true);
    try {
      let imageUrls = [];
      let storagePaths = [];
      try {
        const uploads = await Promise.all(locFiles.map(async (f) => {
          const compressed = await compressImage(f, 800);
          return uploadImage(user.uid, compressed, 'locations');
        }));
        imageUrls = uploads.map(u => u.url);
        storagePaths = uploads.map(u => u.path);
      } catch (err) {
        console.warn('Storage upload failed, proceeding with base64 only:', err);
      }

      // Сохраняем inline base64 для надёжности (обход проблем Firebase Storage Rules/CORS)
      const imageBase64 = await Promise.all(locFiles.map(async (f) => {
        const compressed = await compressImage(f, 500); // 500px — достаточно для AI-reference
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(compressed);
        });
      }));
      const validBase64 = imageBase64.filter(Boolean);

      await saveLocation(user.uid, {
        title: locName.trim(), imageUrls, storagePaths,
        thumbnail: imageUrls[0] || null,
        imageBase64: validBase64, // inline base64 для надёжного отображения и генерации
      });
      const locations = await getLocations(user.uid);
      setMyLocations(locations);
      // Сразу заполняем кеш для новой локации
      if (validBase64.length > 0) {
        const newLocId = locations.find(l => l.title === locName.trim())?.id;
        if (newLocId) setLocBase64Cache(prev => ({ ...prev, [newLocId]: validBase64 }));
      }
      setShowLocModal(false); setLocName(''); setLocFiles([]); setLocPreviews([]);
      setStatusText('📍 Локация сохранена!'); setStatusType('success');
    } catch (err) {
      console.error('Ошибка сохранения локации:', err);
      setStatusText(`❌ Ошибка сохранения локации: ${err.message || 'Неизвестная ошибка'}`); setStatusType('error');
    }
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
  const saveLoraModel = async (photosOverride) => {
    if (!loraName.trim() || !user) return;
    setIsSaving(true);
    try {
      const photos = photosOverride || loraPhotos;
      const photoEntries = Object.entries(photos).filter(([, v]) => v);
      if (photoEntries.length === 0) throw new Error('Нет фотографий для сохранения');
      const uploads = await Promise.all(photoEntries.map(async ([, base64]) => {
        return uploadBase64Image(user.uid, base64, 'models');
      }));
      const imageUrls = uploads.map(u => u.url);
      const storagePaths = uploads.map(u => u.path);
      // modelType='own_model' — маркер для VTON pipeline: все фото идут напрямую как референсы
      await saveModel(user.uid, { name: loraName.trim(), type: 'lora', modelType: 'own_model', imageUrls, storagePaths, prompt: '' });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowLoraModal(false); setLoraName(''); setLoraPhotos({ front: null, left34: null, right34: null, fullbody: null });
      setStatusText('⭐ Модель сохранена!'); setStatusType('success');
    } catch (err) {
      console.error('Ошибка сохранения модели:', err);
      // Пробрасываем ошибку наверх — LoraModal покажет её в UI
      throw err;
    }
    finally { setIsSaving(false); }
  };

  // Save generated model (Firebase)
  const saveGenModel = async () => {
    if (!saveModelName.trim() || !generatedImage || !user) return;
    setIsSaving(true);
    try {
      const { url, path } = await uploadBase64Image(user.uid, generatedImage, 'models');
      const mp = customModelPrompt.trim()
        || (customModelChips.length > 0 ? customModelChips[0].prompt : null)
        || (selectedModels[0].prompt + buildDetailString(modelDetailsMap[selectedModels[0]?.id]));
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


  // Save persona model (from PersonaWizard comp card)
  const savePersonaModel = async ({ name, type, compCardBase64, compCardUrl, sourcePhotos }) => {
    if (!user) throw new Error('Не авторизован');
    setIsSaving(true);
    try {
      const compUpload = await uploadBase64Image(user.uid, compCardBase64, 'models');
      const sourceUploads = await Promise.all(
        sourcePhotos.map(async (base64) => uploadBase64Image(user.uid, base64, 'models'))
      );
      await saveModel(user.uid, {
        name,
        type: 'persona',
        modelType: 'persona',  // ← маркер для VTON pipeline
        // imageUrls = только comp card (1 файл) — именно он уйдёт в GPT Image 2 как референс
        imageUrls: [compUpload.url],
        sourcePhotoUrls: sourceUploads.map(u => u.url),
        storagePaths: [compUpload.path, ...sourceUploads.map(u => u.path)],
        compCardUrl: compUpload.url,
        prompt: '',
      });
      const models = await getModels(user.uid);
      setMyModels(models);
      setStatusText('\u2705 Персонаж сохранён!');
      setStatusType('success');
    } catch (err) {
      console.error('Ошибка сохранения персонажа:', err);
      throw err;
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
    if (customModelChips.length > 0) return customModelChips[0].prompt;
    return selectedModels[0].prompt + buildDetailString(modelDetailsMap[selectedModels[0]?.id]);
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
        if (sm?.imageBase64?.length > 0) refs.push(...sm.imageBase64);
        else if (sm?.imageUrls) refs.push(...sm.imageUrls);
      }
    } else {
      // Fashion mode: use fashion model's saved refs
      if (selectedSavedModelId) {
        const sm = myModels.find(m => m.id === selectedSavedModelId);
        if (sm?.imageBase64?.length > 0) refs.push(...sm.imageBase64);
        else if (sm?.imageUrls) refs.push(...sm.imageUrls);
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
      const refImgs = sm?.imageBase64?.length > 0 ? sm.imageBase64 : (sm?.imageUrls || []);
      // Use loaded garments if available, otherwise send previewMode
      let garmentUrlsForPreview = garmentUrls.slice(0, 1);
      const resp = await authFetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || null,
          idempotencyKey: createIdempotencyKey('model-preview'),
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
    if (!shotModifier.trim() || !garmentUrls.length) return;

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
        posePrompt = customPoseText.trim() || selectedProductCompositions[0].prompt;
        bgPrompt = customProductBg.trim() || selectedProductBgs[0].prompt;
        
        if (selectedProductEffect && selectedProductEffect.id !== 'none') {
          const effectPrompt = selectedProductEffect.id === 'custom'
            ? customProductEffectText.trim()
            : selectedProductEffect.prompt;
          if (effectPrompt) bgPrompt += `. Additionally: ${effectPrompt}`;
        }
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) {
            locImages = locBase64Cache[loc.id] || loc.imageBase64 || loc.imageUrls;
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
        modelPrompt = customModelPrompt.trim()
          || (customModelChips.length > 0 ? customModelChips[0].prompt : null)
          || (selectedModels[0].prompt + buildDetailString(modelDetailsMap[selectedModels[0]?.id]));
        if (selectedSavedModelId) {
          const sm = myModels.find(m => m.id === selectedSavedModelId);
          if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = sm.imageUrls || []; }
        }

        posePrompt = customPoseText.trim() || selectedPoses[0].prompt;
        const poseKeywords = /(?:поз[аеуы]|сид(?:ит|я|еть)|стоит|лежит|идёт|идет|ходит|бежит|танцу|прыга|lotus|sitting|standing|lying|walking|running|dancing|crouching|leaning|kneeling|jumping|squat)/i;
        if (poseKeywords.test(mod)) {
          posePrompt = `${mod}. ${posePrompt}`;
        }

        bgPrompt = customBgText.trim() || selectedBgs[0].prompt;
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) {
            locImages = locBase64Cache[loc.id] || loc.imageBase64 || loc.imageUrls;
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
      const resp = await authFetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || null,
          garmentImageUrls: garmentUrls, modelPreset: modelPrompt, posePreset: posePrompt,
          cameraAngle: selectedCameras[0].prompt, backgroundPreset: bgPrompt,
          aspectRatio: selectedRatios[0].id, modelReferenceImages: editRefImages.length > 0 ? editRefImages : null,
          locationImages: locImages,
          editInstruction: mod,
          attributes: appMode === 'product' ? productModelDetails : modelDetails, isBeautyMode, biometricSeed,
          isProductMode: appMode === 'product',
          categoryId: appMode === 'product' ? selectedProductCategory.id : undefined,
          idempotencyKey: createIdempotencyKey('regenerate'),
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
      const promises = Array.from({ length: count }, async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GENERATION_REQUEST_TIMEOUT_MS);
        try {
          const resp = await authFetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              userId: user.uid,
              isCardDesign: true,
              cardStyle: cardDesignStyle,
              idempotencyKey: createIdempotencyKey('card-design'),
              ...(isBase64
                ? { sourceImageBase64: generatedImage }
                : { sourceImageUrl: generatedImage }),
            }),
          });
          return safeParseJSON(resp);
        } finally {
          clearTimeout(timeoutId);
        }
      });
      
      const settled = await Promise.allSettled(promises);
      const results = settled.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message || 'Ошибка генерации' });
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

  // ═══ GALLERY GENERATION ═══
  const handleGenerateGallery = async () => {
    if (!garmentUrls.length) {
      setStatusText('Сначала загрузите фото товара'); setStatusType('error');
      return;
    }
    const creditsNeeded = 4;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < creditsNeeded && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`⚡ Для генерации галереи нужно ${creditsNeeded} кредита`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < creditsNeeded) {
      setStatusText(`⚡ Для генерации галереи нужно ${creditsNeeded} кредита`); setStatusType('error');
      return;
    }
    
    setIsGalleryGenerating(true);
    setIsProcessing(true);
    setStatusType('processing');
    setStatusText('📋 Начинаем сборку галереи (4 слайда)...');

    const gallerySlides = [
      quickCardImage || generatedImage || garmentUrls[0] // Слайд 1: текущая обложка
    ];

    try {
      const isFashion = appMode === 'fashion';

      // Слайд 2: Крупный план
      setStatusText('🔍 Шаг 1/3: Генерируем крупный план деталей...');
      const detailPose = isFashion
        ? 'extreme close-up macro, focusing on fabric texture, stitching details, seams, organic texture'
        : 'extreme close-up macro, focusing on product details, premium material texture, high-end commercial shot';

      const respDetail = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          isProductMode: true,
          categoryId: 'default',
          posePreset: detailPose,
          backgroundPreset: 'minimalist clean solid color studio background',
          aspectRatio: '3:4',
          garmentImageUrls: garmentUrls,
          idempotencyKey: createIdempotencyKey('gallery-detail'),
        }),
      });
      const dataDetail = await safeParseJSON(respDetail);
      if (!dataDetail.success) throw new Error(dataDetail.error || 'Не удалось создать крупный план');
      const imgDetail = dataDetail.imageBase64 || dataDetail.imageUrl;
      gallerySlides.push(imgDetail);

      // Слайд 3: Размеры (Инфографика)
      setStatusText('📐 Шаг 2/3: Достраиваем инфографику с размерами...');
      const infoText = isFashion
        ? (userProductInfo && userProductInfo.trim()
            ? `ИНФОРМАЦИЯ О ТОВАРЕ:
${userProductInfo.trim()}

РАЗМЕРНАЯ СЕТКА:
S (42-44), M (44-46), L (46-48), XL (48-50)`
            : `ТАБЛИЦА РАЗМЕРОВ:
S (42-44)
M (44-46)
L (46-48)
XL (48-50)
Премиальный материал, идеальный крой.`)
        : (userProductInfo && userProductInfo.trim()
            ? `ИНФОРМАЦИЯ О ТОВАРЕ:
${userProductInfo.trim()}

ГАБАРИТЫ ТОВАРА:
Высота, ширина, глубина, эргономичный премиум дизайн.`
            : `ГАБАРИТЫ И ХАРАКТЕРИСТИКИ:
Оптимальный размер
Высота: 30 см
Ширина: 28 см
Глубина: 10 см
Премиальные материалы, максимальное удобство.`);
      
      const respSize = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          isQuickCard: true,
          quickCardStyle: 'natural',
          userProductInfo: infoText,
          garmentImageUrls: garmentUrls,
          idempotencyKey: createIdempotencyKey('gallery-size'),
        }),
      });
      const dataSize = await safeParseJSON(respSize);
      if (!dataSize.success) throw new Error(dataSize.error || 'Не удалось создать инфографику размеров');
      const imgSize = dataSize.imageBase64 || dataSize.imageUrl;
      gallerySlides.push(imgSize);

      // Слайд 4: Lifestyle
      setStatusText(isFashion ? '🌳 Шаг 3/3: Генерируем фото модели на улице (Lifestyle)...' : '🏠 Шаг 3/3: Генерируем фото в интерьере (Lifestyle)...');
      
      let slide4Payload = {};
      if (isFashion) {
        slide4Payload = {
          userId: user.uid,
          isProductMode: false,
          modelPreset: 'young european model',
          posePreset: 'natural candid lifestyle pose walking',
          backgroundPreset: 'cozy beautiful sunlit city street, soft warm city bokeh background, cinematic lighting',
          aspectRatio: '3:4',
          garmentImageUrls: garmentUrls,
          idempotencyKey: createIdempotencyKey('gallery-life'),
        };
      } else {
        const categoryId = selectedProductCategory?.id || 'default';
        let lifestyleBg = 'modern luxury living room interior, cozy natural morning sunlight, blurred background';
        if (categoryId === 'cosmetics' || categoryId === 'fragrance') {
          lifestyleBg = 'chic elegant bathroom vanity marble table with flowers, soft sunbeams, luxury spa aesthetic';
        } else if (categoryId === 'electronics') {
          lifestyleBg = 'modern wooden workspace desk with keyboard and coffee cup, cozy window light';
        } else if (categoryId === 'food' || categoryId === 'decor_candles') {
          lifestyleBg = 'cozy wooden kitchen table next to a window, breakfast setting, warm home atmosphere';
        } else if (categoryId === 'sports') {
          lifestyleBg = 'sunlit modern yoga studio floor, minimalist aesthetic, plants and warm light';
        } else if (categoryId === 'pet_supplies') {
          lifestyleBg = 'cozy rug in a sunlit living room, warm friendly home environment';
        }

        slide4Payload = {
          userId: user.uid,
          isProductMode: true,
          categoryId: categoryId,
          posePreset: 'natural lifestyle integration, hero placement, placed on a surface',
          backgroundPreset: lifestyleBg,
          aspectRatio: '3:4',
          garmentImageUrls: garmentUrls,
          withHumanModel: false,
          idempotencyKey: createIdempotencyKey('gallery-life'),
        };
      }

      const respLife = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slide4Payload),
      });
      const dataLife = await safeParseJSON(respLife);
      if (!dataLife.success) throw new Error(dataLife.error || 'Не удалось создать lifestyle фото');
      const imgLife = dataLife.imageBase64 || dataLife.imageUrl;
      gallerySlides.push(imgLife);

      setQuickResults(prev => ({ ...prev, gallery: gallerySlides }));
      refreshCreditsFromResponse(dataLife);
      setStatusText('✅ Галерея из 4-х слайдов успешно собрана!');
      setStatusType('success');
    } catch (err) {
      console.error('Gallery generation error:', err);
      setStatusText(`⚠️ Ошибка при генерации галереи: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsGalleryGenerating(false);
      setIsProcessing(false);
    }
  };

  // ═══ A/B TEST GENERATION ═══
  const handleGenerateABTest = async () => {
    if (!garmentUrls.length) {
      setStatusText('Сначала загрузите фото товара'); setStatusType('error');
      return;
    }
    const creditsNeeded = 4;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < creditsNeeded && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`⚡ Для запуска A/B теста нужно ${creditsNeeded} кредита`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < creditsNeeded) {
      setStatusText(`⚡ Для запуска A/B теста нужно ${creditsNeeded} кредита`); setStatusType('error');
      return;
    }

    setIsAbGenerating(true);
    setIsProcessing(true);
    setStatusType('processing');
    setStatusText('⚖️ Запускаем A/B Тестирование (2 обложки)...');

    try {
      // Вариант A (Natural)
      setStatusText('⚖️ Шаг 1/2: Генерируем светлый вариант (Natural)...');
      const seedA = Math.floor(Math.random() * 1000000);
      const respA = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          isQuickCard: true,
          quickCardStyle: 'natural',
          userProductInfo: userProductInfo.trim() || '',
          garmentImageUrls: garmentUrls,
          biometricSeed: seedA,
          idempotencyKey: createIdempotencyKey('ab-a'),
        }),
      });
      const dataA = await safeParseJSON(respA);
      if (!dataA.success) throw new Error(dataA.error || 'Не удалось создать вариант А');
      const imgA = dataA.imageBase64 || dataA.imageUrl;

      // Вариант B (Epic)
      setStatusText('⚖️ Шаг 2/2: Генерируем тёмный вариант (Epic)...');
      const seedB = Math.floor(Math.random() * 1000000) + 7; // Другой сид для уникальности
      const respB = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          isQuickCard: true,
          quickCardStyle: 'epic',
          userProductInfo: userProductInfo.trim() || '',
          garmentImageUrls: garmentUrls,
          biometricSeed: seedB,
          idempotencyKey: createIdempotencyKey('ab-b'),
        }),
      });
      const dataB = await safeParseJSON(respB);
      if (!dataB.success) throw new Error(dataB.error || 'Не удалось создать вариант B');
      const imgB = dataB.imageBase64 || dataB.imageUrl;

      setQuickResults(prev => ({ ...prev, abTest: [imgA, imgB] }));
      refreshCreditsFromResponse(dataB);
      setStatusText('✅ Альтернативные обложки для A/B Теста готовы!');
      setStatusType('success');
    } catch (err) {
      console.error('A/B test generation error:', err);
      setStatusText(`⚠️ Ошибка при A/B тестировании: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsAbGenerating(false);
      setIsProcessing(false);
    }
  };

  const triggerConfirm = (type, cost, onConfirm) => {
    setConfirmModal({ type, cost, onConfirm });
  };

  // ═══ QUICK MODE V2 — GPT Image 2 card generation ═══
  const handleQuickGenerate = async () => {
    if (!garmentUrls.length) {
      setStatusText('Сначала загрузите фото товара'); setStatusType('error');
      return;
    }
    const isCardMode = quickMode === 'card';
    const isUgcMode = quickMode === 'ugc';
    const isModelMode = quickMode === 'model';
    const creditsNeeded = isCardMode ? 2 : 1;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < creditsNeeded && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`⚡ Для генерации нужно ${creditsNeeded} кредит${creditsNeeded > 1 ? 'а' : ''}`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < creditsNeeded) {
      setStatusText(`⚡ Для генерации нужно ${creditsNeeded} кредит${creditsNeeded > 1 ? 'а' : ''}`); setStatusType('error');
      return;
    }

    // Save current result to cache before clearing
    if (quickCardImage) {
      setQuickResults(prev => ({...prev, [quickMode]: { image: quickCardImage, editHistory: cardEditHistory }}));
    } else if (generatedImage) {
      setQuickResults(prev => ({...prev, [quickMode]: { image: generatedImage }}));
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GENERATION_REQUEST_TIMEOUT_MS);
    abortControllerRef.current = controller;

    setIsProcessing(true);
    setGeneratedImage(null);
    setCardResult(null);
    setQuickCardImage(null);
    setCardEditHistory([]);
    setCardEditText('');
    setStatusText(isCardMode ? '📋 Создаём карточку маркетплейса...' : isUgcMode ? '📱 Создаём фото от покупателя...' : isModelMode ? '👤 Создаём карточку с моделью...' : '🎨 Генерируем студийный кадр...');
    setStatusType('processing');

    const statusMessages = isCardMode
      ? ['📋 Анализируем товар...', '🎨 Подбираем дизайн и тексты...', '📐 Компонуем карточку...', '✨ Финальная полировка...']
      : isModelMode
      ? ['👤 Анализируем товар...', '👗 Подбираем модель...', '🎨 Компонуем карточку...', '✨ Финальная полировка...']
      : isUgcMode
      ? ['📱 Распознаём товар...', '🏠 Подбираем домашнюю сцену...', '📷 Имитируем снимок на смартфон...', '✨ Добавляем реализм...']
      : ['📸 Выставляем свет...', '🎨 Рендерим кадр...', '✨ Финальная полировка...'];
    let msgIdx = 0;
    const statusIv = setInterval(() => {
      msgIdx = (msgIdx + 1) % statusMessages.length;
      setStatusText(statusMessages[msgIdx]);
    }, 6000);

    try {
      if (isModelMode) {
        // ═══ MODEL MODE: карточка с моделью через GPT Image 2 ═══
        const resp = await authFetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            userId: user.uid,
            isModelCard: true,
            isPhotoOnly: true,
            garmentImageUrls: garmentUrls,
            idempotencyKey: createIdempotencyKey('quick-model'),
          }),
        });
        clearInterval(statusIv);
        const data = await safeParseJSON(resp);

        if (data.success && (data.imageBase64 || data.imageUrl)) {
          const img = data.imageBase64 || data.imageUrl;
          refreshCreditsFromResponse(data);
          setQuickCardImage(img);
          setGeneratedImage(img);
          setCardEditHistory([{ image: img, editText: 'Оригинал' }]);
          setQuickResults(prev => ({...prev, model: { image: img, editHistory: [{ image: img, editText: 'Оригинал' }] }}));
          setStatusText('✅ Карточка с моделью готова!');
          setStatusType('success');
        } else {
          setStatusText(`⚠️ ${data.error || 'Не удалось создать фото с моделью'}`);
          setStatusType('error');
        }
      } else if (isUgcMode) {
        // ═══ UGC MODE: реалистичное фото «от покупателя» через GPT Image 2 ═══
        const resp = await authFetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            userId: user.uid,
            isUgcMode: true,
            garmentImageUrls: garmentUrls,
            idempotencyKey: createIdempotencyKey('quick-ugc'),
          }),
        });
        clearInterval(statusIv);
        const data = await safeParseJSON(resp);

        if (data.success && (data.imageBase64 || data.imageUrl)) {
          const img = data.imageBase64 || data.imageUrl;
          refreshCreditsFromResponse(data);
          setGeneratedImage(img);
          setQuickResults(prev => ({...prev, ugc: { image: img }}));
          setStatusText('✅ Фото «от покупателя» готово!');
          setStatusType('success');
        } else {
          setStatusText(`⚠️ ${data.error || 'Не удалось создать UGC-фото'}`);
          setStatusType('error');
        }
      } else if (isCardMode) {
        // ═══ CARD MODE: полноценная карточка маркетплейса через GPT Image 2 ═══
        const resp = await authFetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            userId: user.uid,
            isQuickCard: !cardWithModel,
            isModelCard: cardWithModel || false,
            quickCardStyle: quickCardStyle,
            userProductInfo: userProductInfo.trim() || '',
            garmentImageUrls: garmentUrls,
            idempotencyKey: createIdempotencyKey('quick-card'),
          }),
        });
        clearInterval(statusIv);
        const data = await safeParseJSON(resp);

        if (data.success && (data.imageBase64 || data.imageUrl)) {
          const img = data.imageBase64 || data.imageUrl;
          refreshCreditsFromResponse(data);
          setQuickCardImage(img);
          setGeneratedImage(img);
          setCardEditHistory([{ image: img, editText: 'Оригинал' }]);
          setQuickResults(prev => ({...prev, card: { image: img, editHistory: [{ image: img, editText: 'Оригинал' }] }}));
          setStatusText('✅ Карточка готова! Вы можете отредактировать результат.');
          setStatusType('success');
        } else {
          setStatusText(`⚠️ ${data.error || 'Не удалось создать карточку'}`);
          setStatusType('error');
        }
      } else {
        // ═══ PHOTO MODE: красивый студийный кадр (Product Mode pipeline) ═══
        const modelPrompt = quickWithModel
          ? (customProductModelPrompt || productModelPreset?.prompt || 'young European female model')
          : '';
        const resp = await authFetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            userId: user.uid,
            isProductMode: true,
            categoryId: 'default',
            modelPreset: 'product photo',
            posePreset: 'centered product, hero composition',
            backgroundPreset: 'clean minimalist white cyclorama',
            aspectRatio: '3:4',
            garmentImageUrls: garmentUrls,
            withHumanModel: quickWithModel,
            humanModelPrompt: modelPrompt,
            attributes: quickWithModel ? productModelDetails : undefined,
            isBeautyMode: false,
            idempotencyKey: createIdempotencyKey('quick-photo'),
          }),
        });
        clearInterval(statusIv);
        const data = await safeParseJSON(resp);

        if (data.success && (data.imageBase64 || data.imageUrl)) {
          const img = data.imageBase64 || data.imageUrl;
          refreshCreditsFromResponse(data);
          setGeneratedImage(img);
          setQuickResults(prev => ({...prev, photo: { image: img }}));
          setStatusText('✅ Студийное фото готово!');
          setStatusType('success');
        } else {
          setStatusText(`⚠️ ${data.error || 'Не удалось создать фото'}`);
          setStatusType('error');
        }
      }
    } catch (err) {
      clearInterval(statusIv);
      if (err.name === 'AbortError') {
        const cached = quickResults[modeToUse];
        if (cached) {
          setGeneratedImage(cached.image);
          if (cached.editHistory) { setQuickCardImage(cached.image); setCardEditHistory(cached.editHistory); }
        }
        setStatusText('⛔ Генерация отменена');
        setStatusType('error');
      } else {
        setStatusText(`⚠️ Ошибка: ${err.message}`);
        setStatusType('error');
      }
    } finally {
      clearTimeout(timeoutId);
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // ═══ CARD EDIT — текстовое редактирование карточки через GPT Image 2 ═══
  const handleCardEdit = async () => {
    if (!cardEditText.trim() || !quickCardImage) return;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < 1 && !subscription?.local) {
      setShowPricing(true);
      setStatusText('⚡ Для редактирования нужен 1 кредит'); setStatusType('error');
      return;
    }

    setIsCardEditing(true);
    setStatusText('✏️ Применяем изменения...'); setStatusType('processing');

    try {
      const resp = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit-card',
          sourceImageBase64: quickCardImage,
          editInstruction: cardEditText.trim(),
          idempotencyKey: createIdempotencyKey('card-edit'),
        }),
      });
      const data = await safeParseJSON(resp);

      if (data.success && (data.imageBase64 || data.imageUrl)) {
        const newImg = data.imageBase64 || data.imageUrl;
        refreshCreditsFromResponse(data);
        setQuickCardImage(newImg);
        setGeneratedImage(newImg);
        setCardEditHistory(prev => [...prev, { image: newImg, editText: cardEditText.trim() }]);
        setCardEditText('');
        setStatusText('✅ Изменения применены!'); setStatusType('success');
      } else {
        setStatusText(`⚠️ ${data.error || 'Ошибка редактирования'}`); setStatusType('error');
      }
    } catch (err) {
      setStatusText(`⚠️ Ошибка: ${err.message}`); setStatusType('error');
    } finally {
      setIsCardEditing(false);
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
          vibe: customBgText.trim() || selectedBgs[0].prompt
        })
      });
      const data = await safeParseJSON(resp);
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
    if (!garmentUrls.length || isPhotoshooting) return;
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
        bgPrompt = customProductBg.trim() || selectedProductBgs[0].prompt;
        if (selectedProductEffect && selectedProductEffect.id !== 'none') {
          const effectPrompt = selectedProductEffect.id === 'custom'
            ? customProductEffectText.trim()
            : selectedProductEffect.prompt;
          if (effectPrompt) bgPrompt += `. Additionally: ${effectPrompt}`;
        }
        // Модель-человек в фотосессии товаров
        if (productWithModel) {
          let humanPrompt = customProductModelPrompt.trim() || (productModelPreset.prompt + buildDetailString(productModelDetails));
          if (productSavedModelId) {
            const sm = myModels.find(m => m.id === productSavedModelId);
            if (sm) { humanPrompt = sm.prompt || humanPrompt; modelRefImages = sm.imageBase64?.length > 0 ? sm.imageBase64 : (sm.imageUrls || []); }
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
            locImages = locBase64Cache[loc.id] || loc.imageBase64 || loc.imageUrls;
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
        modelPrompt = customModelPrompt.trim()
          || (customModelChips.length > 0 ? customModelChips[0].prompt : null)
          || (selectedModels[0].prompt + buildDetailString(modelDetailsMap[selectedModels[0]?.id]));
        if (selectedSavedModelId) {
          const sm = myModels.find(m => m.id === selectedSavedModelId);
          if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = sm.imageBase64?.length > 0 ? sm.imageBase64 : (sm.imageUrls || []); }
        }
        bgPrompt = customBgText.trim() || selectedBgs[0].prompt;
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) { locImages = locBase64Cache[loc.id] || loc.imageBase64 || loc.imageUrls; bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos'; }
        }
      }

      // PARALLEL generation
      let successCount = 0;
      setStatusText(`📸 Генерируем кадры (параллельно)...`); setStatusType('');
      const promises = angles.map(async (angle, idx) => {
        const slotIdx = existingCount + idx;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), GENERATION_REQUEST_TIMEOUT_MS);
          const biometricSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
          const resp = await authFetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              userId: user?.uid || null,
              garmentImageUrls: garmentUrls, modelPreset: modelPrompt,
              posePreset: angle.pose, cameraAngle: angle.camera,
              backgroundPreset: bgPrompt, aspectRatio: selectedRatios[0].id,
              modelReferenceImages: modelRefImages, locationImages: locImages,
              attributes: appMode === 'product' ? productModelDetails : modelDetails, isBeautyMode, biometricSeed,
              isProductMode: appMode === 'product',
              categoryId: appMode === 'product' ? selectedProductCategory.id : undefined,
              withHumanModel: appMode === 'product' && productWithModel,
              humanModelPrompt: window.__humanModelPrompt || undefined,
              humanModelRefImages: window.__humanModelRefImages || undefined,
              idempotencyKey: createIdempotencyKey('photoshoot'),
            }),
          });
          clearTimeout(timeoutId);
          const data = await safeParseJSON(resp);
          if (data.success) {
            const imgData = data.imageUrl || data.imageBase64;
            setPhotoshootImages(prev => { const n = [...prev]; n[slotIdx] = imgData; return n; });
            setPhotoHistory(prev => ({ ...prev, [slotIdx]: [imgData] }));
            setPhotoViewIdx(prev => ({ ...prev, [slotIdx]: 0 }));
            return { success: true, creditsRemaining: data.creditsRemaining };
          } else {
            console.warn(`Кадр ${idx + 1}: ${data.details || data.error}`);
            setPhotoshootImages(prev => { const n = [...prev]; n[slotIdx] = null; return n; });
            return { success: false, error: data.details || data.error };
          }
        } catch (frameErr) {
          if (frameErr.name === 'AbortError') {
            console.warn(`Кадр ${idx + 1}: Превышен таймаут 180 сек`);
          } else {
            console.warn(`Кадр ${idx + 1} ошибка:`, frameErr.message);
          }
          setPhotoshootImages(prev => { const n = [...prev]; n[slotIdx] = null; return n; });
          return { success: false, error: frameErr.message };
        }
      });

      const results = await Promise.allSettled(promises);
      successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const lastWithCredits = [...results].reverse().find(r => r.status === 'fulfilled' && r.value?.creditsRemaining != null);
      if (lastWithCredits) refreshCreditsFromResponse(lastWithCredits.value);
      // Clean up nulls from failed frames
      setPhotoshootImages(prev => prev.filter(Boolean));
      setStatusText(successCount > 0 ? `🎉 Фотосессия: ${successCount} кадров готово!` : 'Упс! Не удалось сгенерировать кадры. Попробуйте снова.');
      setStatusType(successCount > 0 ? 'success' : 'error');
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
      const resp = await authFetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.uid || null,
          isPhotoEdit: true,
          sourceImageUrl: sourceUrl,
          editInstruction: instruction,
          idempotencyKey: createIdempotencyKey('photo-edit'),
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
        refreshCreditsFromResponse(data);
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
      if (cam) setSelectedCameras([cam]);
    }

    if (gen.type === 'product') {
      if (gen.categoryId) {
        const cat = PRODUCT_CATEGORIES.find(c => c.id === gen.categoryId);
        if (cat) setSelectedProductCategory(cat);
      }
      if (gen.backgroundPreset) {
        const bg = [...PRODUCT_BACKGROUNDS, ...BACKGROUND_PRESETS].find(b => b.prompt === gen.backgroundPreset || b.id === gen.backgroundPreset);
        if (bg) { setSelectedProductBgs([bg]); setCustomProductBg(''); }
        else { setCustomProductBg(gen.backgroundPreset); setSelectedProductBgs([PRODUCT_BACKGROUNDS[0]]); }
      }
      if (gen.attributes && typeof gen.attributes === 'object') {
        setProductModelDetails({ ...initDetails(), ...gen.attributes });
      } else {
        setProductModelDetails(initDetails());
      }
      if (gen.withHumanModel !== undefined) setProductWithModel(gen.withHumanModel);
    } else {
      let targetModelId = MODEL_PRESETS[0].id;
      if (gen.modelPreset) {
        const m = MODEL_PRESETS.find(p => p.prompt === gen.modelPreset || p.id === gen.modelPreset);
        if (m) { 
          setSelectedModels([m]); 
          setCustomModelPrompt(''); 
          setActiveModelDetailsId(m.id);
          targetModelId = m.id;
        } else { 
          setCustomModelPrompt(gen.modelPreset); 
          setSelectedModels([MODEL_PRESETS[0]]); 
          setActiveModelDetailsId(MODEL_PRESETS[0].id);
          targetModelId = MODEL_PRESETS[0].id;
        }
      }
      if (gen.attributes && typeof gen.attributes === 'object') {
        setModelDetailsMap(prev => ({
          ...prev,
          [targetModelId]: { ...initDetails(), ...gen.attributes }
        }));
      } else {
        setModelDetailsMap(prev => ({
          ...prev,
          [targetModelId]: initDetails()
        }));
      }
      
      if (gen.posePreset) {
        const p = POSE_PRESETS.find(x => x.prompt === gen.posePreset || x.id === gen.posePreset);
        if (p) { setSelectedPoses([p]); setCustomPoseText(''); }
        else { setCustomPoseText(gen.posePreset); setSelectedPoses([POSE_PRESETS[0]]); }
      }
      if (gen.customPoseText) setCustomPoseText(gen.customPoseText);
      
      if (gen.backgroundPreset) {
        const bg = BACKGROUND_PRESETS.find(b => b.prompt === gen.backgroundPreset || b.id === gen.backgroundPreset);
        if (bg) { setSelectedBgs([bg]); setCustomBgText(''); }
        else { setCustomBgText(gen.backgroundPreset); setSelectedBgs([BACKGROUND_PRESETS[0]]); }
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
              onClick={() => { setAppMode('fashion'); setQuickCardImage(null); setCardEditHistory([]); }}
            >
              👕 Одежда
            </button>
            <button
              className={`mode-btn ${appMode === 'product' ? 'active' : ''}`}
              onClick={() => { setAppMode('product'); setQuickCardImage(null); setCardEditHistory([]); }}
            >
              📦 Предметка
            </button>
            <button
              className={`mode-btn ${appMode === 'quick' ? 'active' : ''}`}
              onClick={() => { setAppMode('quick'); setGeneratedImage(null); }}
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

      {/* ═══ CONFIRM MODAL ═══ */}
      {confirmModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(3,3,5,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: 20
        }}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.5 }}
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 24,
              padding: 30,
              maxWidth: 440,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              position: 'relative'
            }}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: 22, fontWeight: 800, color: '#fff', textAlign: 'center' }}>
              {confirmModal.type === 'gallery' ? '📸 Собрать галерею?' : 
               confirmModal.type === 'ab' ? '⚖️ Запустить A/B Тест?' : 
               confirmModal.type === 'video' ? '🎬 Оживить в Видеообложку?' : 
               confirmModal.type === 'batch' ? '📸 Запустить серию генераций?' :
               '📱 Создать фото от покупателей?'}
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px 0', textAlign: 'center', lineHeight: 1.5 }}>
              {confirmModal.type === 'gallery' ? 'ИИ сгенерирует 3 дополнительных слайда воронки (крупный план деталей, размеры и lifestyle-кадр) на основе выбранного кадра.' : 
               confirmModal.type === 'ab' ? 'ИИ создаст 2 альтернативных варианта обложки (светлый и темный стили) для тестирования CTR.' : 
               confirmModal.type === 'video' ? 'ИИ создаст 3D-анимацию и motion-эффекты для видеообложки.' : 
               confirmModal.type === 'batch' ? `ИИ сгенерирует серию из ${confirmModal.cost} кадров на основе ваших настроек мультивыбора. Кадры будут создаваться параллельно.` :
               'ИИ перенесет товар с выбранного кадра в домашнюю реалистичную обстановку.'}
            </p>

            {/* Preview of active frame */}
            {confirmModal.type !== 'batch' && (quickCardImage || generatedImage) && (
              <div style={{
                width: 140,
                aspectRatio: '3/4',
                borderRadius: 12,
                overflow: 'hidden',
                border: '2px solid #ffd700',
                boxShadow: '0 4px 20px rgba(255,215,0,0.25)',
                marginBottom: 10,
                background: '#000',
                position: 'relative'
              }}>
                <img 
                  src={quickCardImage || generatedImage} 
                  alt="Исходный кадр" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'rgba(0,0,0,0.7)',
                color: '#ffd700',
                fontSize: 9,
                fontWeight: 800,
                padding: '4px 0',
                textAlign: 'center',
                textTransform: 'uppercase'
              }}>
                Исходный кадр
              </div>
            </div>
            )}

            <div style={{ margin: '15px 0 25px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Стоимость генерации</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#ffd700', marginTop: 4 }}>
                {confirmModal.cost} кр.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button 
                onClick={() => setConfirmModal(null)}
                style={{
                  flex: 1, 
                  background: 'rgba(255,255,255,0.05)', 
                  color: '#fff', 
                  border: '1px solid rgba(255,255,255,0.15)', 
                  padding: '12px', 
                  borderRadius: 12, 
                  fontSize: 14, 
                  fontWeight: 600, 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Отмена
              </button>
              <button 
                onClick={() => {
                  const cb = confirmModal.onConfirm;
                  setConfirmModal(null);
                  cb();
                }}
                style={{
                  flex: 1, 
                  background: '#ffd700', 
                  color: '#000', 
                  border: 'none', 
                  padding: '12px', 
                  borderRadius: 12, 
                  fontSize: 14, 
                  fontWeight: 800, 
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(255,215,0,0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                Да, создать
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ═══ МОИ РАБОТЫ ═══ */}
      {showHistory && <MyHistoryPage onClose={() => setShowHistory(false)} onReuseSettings={handleReuseSettings} />}

      {/* ═══ QUICK MODE PANEL ═══ */}
      {appMode === 'quick' && !generatedImage && (
        <motion.div className="section quick-mode-panel" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.1,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
            <span><span className="icon">⚡</span> В два клика</span>
            {Object.keys(quickResults).length > 0 && (
              <button
                onClick={() => {
                  if (quickResults.card) {
                    setQuickMode('card');
                    setQuickCardImage(quickResults.card.image);
                    setGeneratedImage(quickResults.card.image);
                    setCardEditHistory(quickResults.card.editHistory || []);
                  } else {
                    const firstKey = Object.keys(quickResults)[0];
                    setQuickMode(firstKey);
                    if (firstKey === 'card' || firstKey === 'model') {
                      setQuickCardImage(quickResults[firstKey].image);
                    } else {
                      setQuickCardImage(null);
                    }
                    setGeneratedImage(quickResults[firstKey].image);
                    setCardEditHistory(quickResults[firstKey].editHistory || []);
                  }
                }}
                className="restore-results-btn"
                style={{
                  background: 'rgba(255, 215, 0, 0.08)',
                  border: '1px solid rgba(255, 215, 0, 0.3)',
                  borderRadius: '10px',
                  color: '#ffd700',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 215, 0, 0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 215, 0, 0.08)'}
              >
                👁️ Показать созданное
              </button>
            )}
          </div>
          <p className="quick-mode-subtitle">Загрузите фото товара — получите готовую карточку для маркетплейса</p>

          {/* Upload zone — reuse garmentUrls */}
          <div className="quick-upload-zone">
            {previewUrls.length > 0 ? (
              <div className="multi-preview-grid">
                {previewUrls.map((url, i) => (
                  <div key={i} className="multi-preview-item">
                    <img src={url} alt={`Товар ${i+1}`} style={{cursor:'zoom-in'}} onClick={() => setLightboxSrc(url)} />
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

          {/* ═══ MODE TOGGLE: Красивый кадр / Готовая карточка / UGC ═══ */}
          <div className="card-style-picker" style={{marginBottom: 16}}>
            <div className="card-style-label">Что создаём:</div>
            <div className="card-style-options">
              <button
                className={`card-style-btn ${quickMode === 'photo' ? 'active' : ''}`}
                onClick={() => setQuickMode('photo')}
              >
                <span className="card-style-icon">🎨</span>
                <span className="card-style-name">Красивый кадр</span>
                <span className="card-style-desc">Студийное фото товара</span>
              </button>
              <button
                className={`card-style-btn ${quickMode === 'card' ? 'active' : ''}`}
                onClick={() => setQuickMode('card')}
              >
                <span className="card-style-icon">📋</span>
                <span className="card-style-name">Готовая карточка</span>
                <span className="card-style-desc">Инфографика для маркетплейса</span>
              </button>
              <button
                className={`card-style-btn ${quickMode === 'ugc' ? 'active' : ''}`}
                onClick={() => setQuickMode('ugc')}
              >
                <span className="card-style-icon">📱</span>
                <span className="card-style-name">Фото от покупателей</span>
                <span className="card-style-desc">Реалистичные фото для отзывов</span>
              </button>
              <button
                className={`card-style-btn ${quickMode === 'model' ? 'active' : ''}`}
                onClick={() => setQuickMode('model')}
              >
                <span className="card-style-icon">👤</span>
                <span className="card-style-name">Фото с моделью</span>
                <span className="card-style-desc">Модель позирует с товаром</span>
              </button>
            </div>
          </div>

          {/* ═══ CARD MODE: стиль + информация о товаре ═══ */}
          <AnimatePresence mode="wait">
            {quickMode === 'card' && (
              <motion.div
                key="card-settings"
                initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                transition={{type:'spring',stiffness:400,damping:25,mass:0.5}}
                style={{overflow:'hidden'}}
              >
                {/* Card info banner */}
                <div style={{background:'rgba(255,215,0,0.06)', border:'1px solid rgba(255,215,0,0.15)', borderRadius:12, padding:'12px 16px', marginBottom:16}}>
                  <p style={{margin:0, fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:'1.5'}}>
                    ⚡ Система автоматически создаст профессиональную карточку товара с текстами, дизайном и типографикой. Стоимость: <strong style={{color:'#ffd700'}}>2 кредита</strong>. После генерации вы сможете отредактировать результат (<strong>1 кредит</strong> за правку).
                  </p>
                </div>

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
                      <span className="card-style-desc">Элегантная, минимализм</span>
                    </button>
                    <button
                      className={`card-style-btn ${quickCardStyle === 'epic' ? 'active' : ''}`}
                      onClick={() => setQuickCardStyle('epic')}
                    >
                      <span className="card-style-icon">🔥</span>
                      <span className="card-style-name">Эпичная</span>
                      <span className="card-style-desc">Кинематограф, wow</span>
                    </button>
                  </div>
                </div>

                {/* Optional product info */}
                <div style={{marginTop: 16}}>
                  <div className="detail-label" style={{marginBottom: 8}}>
                    💡 Информация о товаре <span style={{color:'rgba(255,255,255,0.4)', fontSize:12}}>(необязательно)</span>
                  </div>
                  <textarea
                    className="modifier-input"
                    rows={3}
                    placeholder="Например: «Офисный стул, стальной каркас, до 120 кг, ткань оксфорд». ИИ сам определит товар по фото — здесь можно уточнить детали, чтобы тексты на карточке были точнее."
                    value={userProductInfo}
                    onChange={e => setUserProductInfo(e.target.value)}
                    style={{width:'100%', resize:'vertical'}}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ PHOTO MODE: модель-человек ═══ */}
          <AnimatePresence mode="wait">
            {quickMode === 'photo' && (
              <motion.div
                key="photo-settings"
                initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                transition={{type:'spring',stiffness:400,damping:25,mass:0.5}}
                style={{overflow:'hidden'}}
              >
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
                                  <button className="zoom-btn" onClick={e => { e.stopPropagation(); setLightboxSrc(m.fullbodyUrl || m.imageUrls?.[0] || ''); }}>🔍</button>
                                  <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteModel(m.id); }}>✕</button>
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
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ MODEL MODE: инфо-баннер ═══ */}
          <AnimatePresence mode="wait">
            {quickMode === 'model' && (
              <motion.div
                key="model-card-settings"
                initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                transition={{type:'spring',stiffness:400,damping:25,mass:0.5}}
                style={{overflow:'hidden'}}
              >
                <div style={{background:'rgba(168,85,247,0.06)', border:'1px solid rgba(168,85,247,0.15)', borderRadius:12, padding:'12px 16px', marginBottom:16}}>
                  <p style={{margin:0, fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.5}}>
                    👤 <strong>ИИ поместит товар в руки модели</strong> — сам определит, как человек будет держать, носить или использовать ваш товар.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══ UGC MODE: настройки фото от покупателей ═══ */}
          <AnimatePresence mode="wait">
            {quickMode === 'ugc' && (
              <motion.div
                key="ugc-settings"
                initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}}
                transition={{type:'spring',stiffness:400,damping:25,mass:0.5}}
                style={{overflow:'hidden'}}
              >
                <div style={{background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.15)', borderRadius:12, padding:'12px 16px', marginBottom:16}}>
                  <p style={{margin:0, fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.5}}>
                    📱 <strong>ИИ создаст реалистичные фото товара</strong>, похожие на снимки реальных покупателей — с домашним фоном, естественным светом и лёгким шумом смартфона.
                    Стоимость: <strong style={{color:'#22c55e'}}>1 кредит</strong> за фото.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
              {isProcessing ? '⏳ Генерируем...' : (quickMode === 'card' ? '📋 Создать карточку' : quickMode === 'ugc' ? '📱 Создать фото от покупателя' : quickMode === 'model' ? '👤 Создать карточку с моделью' : '🎨 Создать фото')}
            </button>
            <span className="quick-credits-hint">{quickMode === 'card' ? '2 кредита' : '1 кредит'}</span>
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
                <img src={url} alt={`Объект ${i+1}`} style={{cursor:'zoom-in'}} onClick={() => setLightboxSrc(url)} />
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
                            <button className="zoom-btn" onClick={e => { e.stopPropagation(); setLightboxSrc(m.fullbodyUrl || m.imageUrls?.[0] || ''); }}>🔍</button>
                            <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteModel(m.id); }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {myModels.length === 0 && (
                      <p className="section-hint" style={{textAlign:'center',padding:'20px 0'}}>У вас пока нет сохранённых моделей</p>
                    )}
                    <div className="add-location-card" style={{marginTop: myModels.length ? 12 : 0, background:'rgba(168,85,247,0.08)', borderColor:'rgba(168,85,247,0.2)'}} onClick={() => setShowPersonaWizard(true)}>
                      <span className="plus-icon" style={{color:'#a855f7'}}>🧑</span>
                      <span style={{color:'#a855f7'}}>Создать персонажа</span>
                    </div>
                    <div className="add-location-card" style={{marginTop: 8}} onClick={() => setShowLoraModal(true)}>
                      <span className="plus-icon">+</span>
                      <span>Добавить свою модель</span>
                    </div>
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
              {/* Multi-select info popover */}
              {!customModelPrompt && !selectedSavedModelId && (selectedModels.length + customModelChips.length) > 1 && (
                <div className="multi-select-info">
                  <span className="info-icon">ℹ️</span>
                  Выбрано {selectedModels.length + customModelChips.length} типов моделей — каждый тип = отдельная генерация. Итого: ×{selectedModels.length + customModelChips.length} к количеству кадров. Максимум 20 за раз.
                </div>
              )}
              <div className={`preset-grid${customModelPrompt && !selectedSavedModelId ? ' dimmed' : ''}`}>
                {filteredModels.map(m => {
                  const isActive = selectedModels.some(s => s.id === m.id) && !customModelPrompt && !selectedSavedModelId;
                  const isHighlighted = activeModelDetailsId === m.id;
                  const canRemove = isActive && (selectedModels.length + customModelChips.length) > 1;
                  return (
                    <div key={m.id} className={`preset-card ${isActive ? 'active' : ''} ${isHighlighted ? 'active-highlight' : ''}`}
                      style={{ position: 'relative' }}
                      onClick={() => { 
                        if (customModelPrompt || selectedSavedModelId) {
                          setSelectedModels([m]); 
                          setCustomModelPrompt(''); 
                          setSelectedSavedModelId(null); 
                          setActiveModelDetailsId(m.id);
                          setShowDetails(true);
                        } else {
                          const alreadySelected = selectedModels.some(s => s.id === m.id);
                          if (alreadySelected) {
                            if (activeModelDetailsId === m.id) {
                              // Повторный клик на уже активную карточку — скрыть/показать панель
                              setShowDetails(v => !v);
                            } else {
                              // Клик на другую выбранную карточку — переключить фокус, НЕ снимать выделение
                              setActiveModelDetailsId(m.id);
                              setShowDetails(true);
                            }
                          } else {
                            setSelectedModels(prev => [...prev, m]);
                            setActiveModelDetailsId(m.id);
                            setShowDetails(true);
                          }
                        }
                      }}>
                      <span className="emoji">{m.emoji}</span><span className="label">{m.label}</span>
                      {canRemove && (
                        <button
                          className="preset-card-remove"
                          onClick={e => { e.stopPropagation(); setSelectedModels(prev => prev.filter(s => s.id !== m.id)); if (activeModelDetailsId === m.id) { const remaining = selectedModels.filter(s => s.id !== m.id); if (remaining.length > 0) setActiveModelDetailsId(remaining[0].id); } }}
                          title="Снять выбор"
                        >✕</button>
                      )}
                    </div>
                  );
                })}
                {/* Custom chips */}
                {customModelChips.map(chip => {
                  const isHighlighted = activeModelDetailsId === chip.id;
                  return (
                    <div key={chip.id} className={`preset-card active custom-chip-card ${isHighlighted ? 'active-highlight' : ''}`}
                      onClick={() => {
                        if (activeModelDetailsId === chip.id) {
                          setShowDetails(v => !v);
                        } else {
                          setActiveModelDetailsId(chip.id);
                          setShowDetails(true);
                        }
                      }}>
                      <span className="emoji">{chip.emoji}</span><span className="label">{chip.label}</span>
                      <div className="chip-actions">
                        <button className="chip-action-btn edit-btn" onClick={e => { e.stopPropagation(); openEditChipModal('model', chip); }}>✏️</button>
                        <button className="chip-action-btn delete-btn" onClick={e => { e.stopPropagation(); removeCustomChip('model', chip.id); }}>✕</button>
                      </div>
                    </div>
                  );
                })}
                {/* Add custom variant button */}
                {!customModelPrompt && !selectedSavedModelId && (
                  <div className="preset-card add-custom-card" onClick={() => { setCustomChipModalSection('model'); setNewChipText(''); }}>
                    <span className="emoji">➕</span><span className="label">Свой вариант</span>
                  </div>
                )}
              </div>
              <DetailPanel modelDetails={modelDetails} setModelDetails={setModelDetails} visible={showDetails && !customModelPrompt && !selectedSavedModelId} gender={gender} extraPrompt={extraModelPrompt} setExtraPrompt={setExtraModelPrompt} title={getActiveModelLabel()} onClose={() => setShowDetails(false)} />
              {(customModelChips.some(c => /тату|tattoo/i.test(c.prompt)) || /тату|tattoo/i.test(customModelPrompt)) && (
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
                        <button className="zoom-btn" onClick={e => { e.stopPropagation(); setLightboxSrc(m.fullbodyUrl || m.imageUrls?.[0] || ''); }}>🔍</button>
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
              <div className="add-location-card" style={{marginTop: myModels.length ? 12 : 0, background:'rgba(168,85,247,0.08)', borderColor:'rgba(168,85,247,0.2)'}} onClick={() => setShowPersonaWizard(true)}>
                <span className="plus-icon" style={{color:'#a855f7'}}>🧑</span>
                <span style={{color:'#a855f7'}}>Создать персонажа</span>
              </div>
              <div className="add-location-card" style={{marginTop: 8}} onClick={() => setShowLoraModal(true)}>
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
            {PRODUCT_COMPOSITIONS.map(p => {
              const isActive = selectedProductCompositions.some(c => c.id === p.id) && !customPoseText;
              return (
                <div key={p.id} className={`preset-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setCustomPoseText('');
                    setSelectedProductCompositions(prev => {
                      if (prev.some(c => c.id === p.id)) {
                        if (prev.length <= 1) return prev;
                        return prev.filter(c => c.id !== p.id);
                      }
                      return [...prev, p];
                    });
                  }}>
                  <span className="emoji">{p.emoji}</span><span className="label">{p.label}</span>
                </div>
              );
            })}
          </div>
          <div className="custom-variant-row">
            <input className="custom-variant-input" type="text" placeholder="Или опишите свою композицию: «Товар лежит на зеркальной поверхности под углом»"
              value={customPoseText} onChange={e => setCustomPoseText(e.target.value)} />
          </div>
        </motion.div>
      ) : (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.45,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">🧍</span> Поза модели</div>
          {/* Multi-select info */}
          {!customPoseText && (selectedPoses.length + customPoseChips.length) > 1 && (
            <div className="multi-select-info">
              <span className="info-icon">ℹ️</span>
              Выбрано {selectedPoses.length + customPoseChips.length} поз — каждая поза = отдельная генерация. Итого: ×{selectedPoses.length + customPoseChips.length} к количеству кадров.
            </div>
          )}
          <div className={`preset-grid${customPoseText ? ' dimmed' : ''}`}>
            {POSE_PRESETS.map(p => {
              const isActive = selectedPoses.some(s => s.id === p.id) && !customPoseText;
              return (
                <div key={p.id} className={`preset-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (customPoseText) {
                      setSelectedPoses([p]); setCustomPoseText('');
                    } else {
                      setSelectedPoses(prev => {
                        if (prev.some(s => s.id === p.id)) {
                          if (prev.length <= 1 && customPoseChips.length === 0) return prev;
                          return prev.filter(s => s.id !== p.id);
                        }
                        return [...prev, p];
                      });
                    }
                  }}>
                  <span className="emoji">{p.emoji}</span><span className="label">{p.label}</span>
                </div>
              );
            })}
            {/* Импровизация — always visible */}
            {(() => {
              const isImprovActive = selectedPoses.some(s => s.id === IMPROV_POSE.id) && !customPoseText;
              return (
                <div className={`preset-card ${isImprovActive ? 'active' : ''}`}
                  onClick={() => {
                    if (customPoseText) {
                      setSelectedPoses([IMPROV_POSE]); setCustomPoseText('');
                    } else {
                      setSelectedPoses(prev => {
                        if (prev.some(s => s.id === IMPROV_POSE.id)) {
                          if (prev.length <= 1 && customPoseChips.length === 0) return prev;
                          return prev.filter(s => s.id !== IMPROV_POSE.id);
                        }
                        return [...prev, IMPROV_POSE];
                      });
                    }
                  }}>
                  <span className="emoji">{IMPROV_POSE.emoji}</span><span className="label">{IMPROV_POSE.label}</span>
                </div>
              );
            })()}
            {/* Custom chips */}
            {customPoseChips.map(chip => (
              <div key={chip.id} className="preset-card active custom-chip-card">
                <span className="emoji">{chip.emoji}</span><span className="label">{chip.label}</span>
                <div className="chip-actions">
                  <button className="chip-action-btn edit-btn" onClick={e => { e.stopPropagation(); openEditChipModal('pose', chip); }}>✏️</button>
                  <button className="chip-action-btn delete-btn" onClick={e => { e.stopPropagation(); removeCustomChip('pose', chip.id); }}>✕</button>
                </div>
              </div>
            ))}
            {/* Add custom variant */}
            {!customPoseText && (
              <div className="preset-card add-custom-card" onClick={() => { setCustomChipModalSection('pose'); setNewChipText(''); }}>
                <span className="emoji">➕</span><span className="label">Свой вариант</span>
              </div>
            )}
          </div>
        </motion.div>
      ))}

      {/* 4. РАКУРС КАМЕРЫ (Только в режиме одежды) */}
      {appMode === 'fashion' && (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.6,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">📷</span> Ракурс камеры</div>
          {selectedCameras.length > 1 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
              ✅ {selectedCameras.length} ракурса выбрано
            </div>
          )}
          <div className="preset-grid">
            {CAMERA_ANGLES.map(c => {
              const isActive = selectedCameras.some(s => s.id === c.id);
              return (
                <div key={c.id} className={`preset-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCameras(prev => {
                      if (prev.some(s => s.id === c.id)) {
                        if (prev.length <= 1) return prev;
                        return prev.filter(s => s.id !== c.id);
                      }
                      return [...prev, c];
                    });
                  }}>
                  <span className="label">{c.label}</span>
                </div>
              );
            })}
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
                {!customProductBg && !selectedLocId && selectedProductBgs.length > 1 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
                    ✅ {selectedProductBgs.length} сцены выбрано — сгенерируется {selectedProductBgs.length * selectedProductCompositions.length} {selectedProductBgs.length * selectedProductCompositions.length === 1 ? 'вариант' : 'варианта'}
                  </div>
                )}
                <div className="preset-grid">
                  {PRODUCT_BACKGROUNDS.map(b => {
                    const isActive = selectedProductBgs.some(s => s.id === b.id) && !selectedLocId && !customProductBg;
                    return (
                      <div key={b.id} className={`preset-card ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          if (customProductBg || selectedLocId) {
                            setSelectedProductBgs([b]); setSelectedLocId(null); setCustomProductBg('');
                          } else {
                            setSelectedProductBgs(prev => {
                              if (prev.some(s => s.id === b.id)) {
                                if (prev.length <= 1) return prev;
                                return prev.filter(s => s.id !== b.id);
                              }
                              return [...prev, b];
                            });
                          }
                        }}>
                        <span className="emoji">{b.emoji}</span><span className="label">{b.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="custom-variant-row" style={{marginTop: 12}}>
                  <input className="custom-variant-input" placeholder="Локация с нуля: «деревянный стол в скандинавском стиле, на фоне размытое окно»"
                    value={customProductBg} onChange={e => { setCustomProductBg(e.target.value); setSelectedLocId(null); }} />
                </div>
                <div className="section-subtitle-small" style={{marginTop: 18, marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <span>✨</span> Добавить спецэффект
                </div>
                <div className="preset-grid">
                  {PRODUCT_EFFECTS.map(e => {
                    const isActive = selectedProductEffects.some(s => s.id === e.id);
                    return (
                      <div key={e.id} className={`preset-card ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          if (e.id === 'none') {
                            setSelectedProductEffects([e]);
                          } else {
                            setSelectedProductEffects(prev => {
                              const filtered = prev.filter(s => s.id !== 'none');
                              if (filtered.some(s => s.id === e.id)) {
                                if (filtered.length <= 1) {
                                  return [PRODUCT_EFFECTS.find(x => x.id === 'none')];
                                }
                                return filtered.filter(s => s.id !== e.id);
                              }
                              return [...filtered, e];
                            });
                          }
                        }}>
                        <span className="emoji">{e.emoji}</span><span className="label">{e.label}</span>
                      </div>
                    );
                  })}
                </div>
                {selectedProductEffects.some(s => s.id === 'custom') && (
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
                {/* Multi-select info */}
                {!customBgText && !selectedLocId && (selectedBgs.length + customBgChips.length) > 1 && (
                  <div className="multi-select-info">
                    <span className="info-icon">ℹ️</span>
                    Выбрано {selectedBgs.length + customBgChips.length} фонов — каждый фон = отдельная генерация. Итого: ×{selectedBgs.length + customBgChips.length} к количеству кадров.
                  </div>
                )}
                <div className={`preset-grid${customBgText ? ' dimmed' : ''}`}>
                  {BACKGROUND_PRESETS.map(b => {
                    const isActive = selectedBgs.some(s => s.id === b.id) && !selectedLocId && !customBgText;
                    return (
                      <div key={b.id} className={`preset-card ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          if (customBgText || selectedLocId) {
                            setSelectedBgs([b]); setSelectedLocId(null); setCustomBgText('');
                          } else {
                            setSelectedBgs(prev => {
                              if (prev.some(s => s.id === b.id)) {
                                if (prev.length <= 1 && customBgChips.length === 0) return prev;
                                return prev.filter(s => s.id !== b.id);
                              }
                              return [...prev, b];
                            });
                          }
                        }}>
                        <span className="emoji">{b.emoji}</span><span className="label">{b.label}</span>
                      </div>
                    );
                  })}
                  {/* Custom chips */}
                  {customBgChips.map(chip => (
                    <div key={chip.id} className="preset-card active custom-chip-card">
                      <span className="emoji">{chip.emoji}</span><span className="label">{chip.label}</span>
                      <div className="chip-actions">
                        <button className="chip-action-btn edit-btn" onClick={e => { e.stopPropagation(); openEditChipModal('bg', chip); }}>✏️</button>
                        <button className="chip-action-btn delete-btn" onClick={e => { e.stopPropagation(); removeCustomChip('bg', chip.id); }}>✕</button>
                      </div>
                    </div>
                  ))}
                  {/* Add custom variant */}
                  {!customBgText && !selectedLocId && (
                    <div className="preset-card add-custom-card" onClick={() => { setCustomChipModalSection('bg'); setNewChipText(''); }}>
                      <span className="emoji">➕</span><span className="label">Свой вариант</span>
                    </div>
                  )}
                </div>
                <div className="modifier-block" style={{marginTop:10}}>
                  <textarea className="modifier-input" rows={1} placeholder="Добавить к локации: «закат, мокрый асфальт, неоновые огни»"
                    value={bgExtraText} onChange={e => setBgExtraText(e.target.value)} />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="location-card-grid">
              {myLocations.map(loc => (
                <div key={loc.id} className={`location-card ${selectedLocId===loc.id?'active':''}`} onClick={() => selectLocation(loc.id)}>
                  <img src={loc.imageBase64?.[0] || loc.thumbnail || loc.imageUrls?.[0] || ''} alt={loc.title || loc.name || ''} onError={(e) => { e.target.style.display = 'none'; }} />
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
                  {PRODUCT_EFFECTS.map(e => {
                    const isActive = selectedProductEffects.some(s => s.id === e.id);
                    return (
                      <div key={e.id} className={`preset-card ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          if (e.id === 'none') {
                            setSelectedProductEffects([e]);
                          } else {
                            setSelectedProductEffects(prev => {
                              const filtered = prev.filter(s => s.id !== 'none');
                              if (filtered.some(s => s.id === e.id)) {
                                if (filtered.length <= 1) {
                                  return [PRODUCT_EFFECTS.find(x => x.id === 'none')];
                                }
                                return filtered.filter(s => s.id !== e.id);
                              }
                              return [...filtered, e];
                            });
                          }
                        }}>
                        <span className="emoji">{e.emoji}</span><span className="label">{e.label}</span>
                      </div>
                    );
                  })}
                </div>
                {selectedProductEffects.some(s => s.id === 'custom') && (
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
        {selectedRatios.length > 1 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
            ✅ {selectedRatios.length} формата выбрано — будет создано несколько копий для каждого формата
          </div>
        )}
        <div className="preset-grid">
          {ASPECT_RATIOS.map(r => {
            const isActive = selectedRatios.some(s => s.id === r.id);
            return (
              <div key={r.id} className={`preset-card ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setSelectedRatios(prev => {
                    if (prev.some(s => s.id === r.id)) {
                      if (prev.length <= 1) return prev;
                      return prev.filter(s => s.id !== r.id);
                    }
                    return [...prev, r];
                  });
                }}>
                <span className="emoji">{r.icon}</span><span className="label">{r.label}</span>
              </div>
            );
          })}
        </div>
      </motion.div>}

      {/* 7. ГЕНЕРАЦИЯ */}
      {appMode !== 'quick' && <motion.div className="generate-section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:1.05,duration:0.5,ease:[0.16,1,0.3,1]}}>
        {/* Beauty toggle — только когда есть живая модель-человек */}
        {(appMode === 'fashion' || (appMode === 'product' && productWithModel)) && (
          <div className="beauty-toggle">
            <label className={`beauty-switch ${isBeautyMode ? 'active' : ''}`}>
              <input type="checkbox" checked={isBeautyMode} onChange={e => setIsBeautyMode(e.target.checked)} />
              <span className="beauty-label">{isBeautyMode ? '✨ Beauty-ретушь' : '📷 Реализм'}</span>
            </label>
            <span className="beauty-hint">
              {isBeautyMode
                ? 'Выбран журнальный глянец «Идеальная кожа». Нажмите, чтобы вернуть реализм'
                : 'Выбран реализм: натуральная кожа с текстурой. Нажмите, чтобы включить журнальный глянец «Идеальная кожа»'}
            </span>
          </div>
        )}

        {/* Селектор количества вариантов */}
        {(() => {
          return (
            <div className="variant-count-section">
              <div className="variant-count-title">🎯 Количество вариантов на одну комбинацию</div>
              {totalShots > variantCount && (
                <div style={{fontSize:'0.75rem',color:'var(--gold)',textAlign:'center',marginBottom:8,opacity:0.8}}>
                  Комбинаций параметров × {variantCount} вариант{variantCount === 1 ? '' : (variantCount < 5 ? 'а' : 'ов')} = <strong>{totalShots} кадр{totalShots === 1 ? '' : (totalShots < 5 ? 'а' : 'ов')}</strong>
                </div>
              )}
              <div className="variant-count-grid">
                {[1, 2, 3, 4].map(n => {
                  const multiplier = totalShots / variantCount;
                  const total = Math.round(multiplier * n);
                  return (
                    <button
                      key={n}
                      className={`variant-count-btn ${variantCount === n ? 'active' : ''}`}
                      onClick={() => setVariantCount(n)}
                    >
                      <span className="variant-count-number">{n}</span>
                      <span className="variant-count-label">{n === 1 ? 'вариант' : (n < 5 ? 'варианта' : 'вариантов')}</span>
                      <span className="variant-count-credits">{total} {total === 1 ? 'кредит' : (total < 5 ? 'кредита' : 'кредитов')}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
        
        <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
          <div style={{display: 'flex', gap: '10px', alignItems: 'center', width: '100%'}}>
            <button 
              className="generate-btn" 
              style={{flex:1}} 
              onClick={handleGenerate} 
              onMouseEnter={() => { fetch('/api/generate-image', { method: 'OPTIONS', keepalive: true }).catch(() => {}); }} 
              disabled={!garmentUrls.length||isProcessing||isUploading||totalShots > 20}
            >
              {isUploading 
                ? '☁️ Загрузка в облако...' 
                : `✨ Сгенерировать ${totalShots > 1 ? totalShots + ' кадр' + (totalShots < 5 ? 'а' : 'ов') : 'студийный кадр'}`}
            </button>
            <button
              className="auto-catalog-mini-btn"
              onClick={handleAutoCatalog}
              disabled={!garmentUrls.length||isProcessing||isUploading}
              title="Отправить в Auto-Catalog (Batch)"
            >🏭</button>
          </div>
          {totalShots > 20 && (
            <div style={{color:'var(--gold)',fontSize:'0.75rem',textAlign:'center',fontWeight:500}}>
              ⚠️ Выбрано {totalShots} генераций. Лимит — 20 за один раз. Пожалуйста, снимите выделение с некоторых параметров.
            </div>
          )}
        </div>

        <div className="status-bar">{statusText && <p className={`status-text ${statusType}`}>{statusText}</p>}</div>
      </motion.div>}

      {/* ═══ STATUS BAR for quick mode ═══ */}
      {appMode === 'quick' && statusText && (
        <div className="status-bar" style={{textAlign:'center',padding:'12px 0'}}>
          <p className={`status-text ${statusType}`}>{statusText}</p>
          {isProcessing && (
            <button
              onClick={() => abortControllerRef.current?.abort()}
              style={{marginTop: 8, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
              onMouseEnter={e => {e.currentTarget.style.background = 'rgba(239,68,68,0.3)'}}
              onMouseLeave={e => {e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}}
            >
              ✕ Отменить генерацию
            </button>
          )}
        </div>
      )}

      {/* 8а. QUICK MODE RESULT — Photo or Card */}
      {generatedImage && appMode === 'quick' && !quickCardImage && (
        <motion.div className="section result-section quick-hero-result" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{duration:0.5}}>
          <h3>{quickMode === 'ugc' ? '📱 Фото от покупателя' : '📸 Ваше студийное фото'}</h3>
          <div className="result-image-wrap" style={{position:'relative'}}>
            <img src={generatedImage} alt={quickMode === 'ugc' ? "Фото от покупателя" : "Студийное фото"} onClick={() => setLightboxSrc(generatedImage)} style={{cursor:'pointer'}} />
          </div>
          <div className="quick-hero-actions">
            <button className="download-btn" onClick={async () => {
              const filename = quickMode === 'ugc' ? `ugc-photo-${Date.now()}.png` : `studio-photo-${Date.now()}.png`;
              if (generatedImage.startsWith('data:')) {
                const link = document.createElement('a');
                link.href = generatedImage;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } else {
                try {
                  const resp = await fetch(generatedImage, { mode: 'cors' });
                  const blob = await resp.blob();
                  const blobUrl = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = blobUrl;
                  link.download = filename;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(blobUrl);
                } catch (err) {
                  window.open(generatedImage, '_blank');
                }
              }
            }}>⬇️ Скачать фото</button>
          </div>
          {/* Nav between cached results */}
          {Object.keys(quickResults).length > 0 && (
            <div style={{display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap'}}>
              {quickResults.card && (
                <button onClick={() => { setQuickMode('card'); setQuickCardImage(quickResults.card.image); setGeneratedImage(quickResults.card.image); setCardEditHistory(quickResults.card.editHistory || []); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.08)', color: '#ffd700', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>📋 Карточка</button>
              )}
              {quickResults.ugc && quickMode !== 'ugc' && (
                <button onClick={() => { setQuickMode('ugc'); setQuickCardImage(null); setGeneratedImage(quickResults.ugc.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>📱 UGC</button>
              )}
              {quickResults.photo && quickMode !== 'photo' && (
                <button onClick={() => { setQuickMode('photo'); setQuickCardImage(null); setGeneratedImage(quickResults.photo.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>📸 Студийное</button>
              )}
              {quickResults.model && quickMode !== 'model' && (
                <button onClick={() => { setQuickMode('model'); setQuickCardImage(quickResults.model.image); setGeneratedImage(quickResults.model.image); setCardEditHistory(quickResults.model.editHistory || []); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: '#d8b4fe', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>👤 С моделью</button>
              )}
            </div>
          )}
          <button className="sc-btn-close" style={{marginTop: 12}} onClick={() => {
            if (quickResults.card && quickMode !== 'card') {
              setQuickMode('card');
              setQuickCardImage(quickResults.card.image);
              setGeneratedImage(quickResults.card.image);
              setCardEditHistory(quickResults.card.editHistory || []);
            } else {
              setGeneratedImage(null);
              setQuickCardImage(null);
            }
          }}>{quickResults.card && quickMode !== 'card' ? '← Назад к обложке' : '← Новая генерация'}</button>
        </motion.div>
      )}

      {/* 8а-2. QUICK MODE CARD RESULT — карточка + текстовое редактирование */}
      {quickCardImage && appMode === 'quick' && (
        <motion.div className="section result-section" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{duration:0.5}} style={{maxWidth: 900, margin: '0 auto', padding: '10px 20px'}}>
                    {/* Nav between cached results */}
          {Object.keys(quickResults).filter(k => k !== quickMode && quickResults[k]).length > 0 && (
            <div style={{display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap'}}>
              {quickResults.ugc && quickMode !== 'ugc' && (
                <button onClick={() => { setQuickMode('ugc'); setQuickCardImage(null); setGeneratedImage(quickResults.ugc.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>📱 UGC</button>
              )}
              {quickResults.photo && quickMode !== 'photo' && (
                <button onClick={() => { setQuickMode('photo'); setQuickCardImage(null); setGeneratedImage(quickResults.photo.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>📸 Студийное</button>
              )}
              {quickResults.model && quickMode !== 'model' && (
                <button onClick={() => { setQuickMode('model'); setQuickCardImage(quickResults.model.image); setGeneratedImage(quickResults.model.image); setCardEditHistory(quickResults.model.editHistory || []); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: '#d8b4fe', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>👤 С моделью</button>
              )}
            </div>
          )}

          <div style={{textAlign: 'center', marginBottom: 30}}>
            <h3 style={{fontSize: 28, margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 1}}>🔥 Обложка готова!</h3>
            <p style={{color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 15}}>Карточка успешно сгенерирована. Что делаем дальше?</p>
          </div>

          {/* MAIN STAGE */}
          <div style={{position: 'relative', background: 'rgba(0,0,0,0.4)', borderRadius: 24, padding: 20, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 40}}>
            <div className="result-image-wrap" style={{
              position:'relative', 
              borderRadius: 16, 
              overflow: 'hidden', 
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
              aspectRatio: '3/4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.6)'
            }}>
              {isCardEditing ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  padding: 20,
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    border: '3px solid rgba(255, 215, 0, 0.1)',
                    borderTopColor: '#ffd700',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <style>{`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                  <div style={{color: '#ffd700', fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1}}>
                    ✏️ Применяем изменения...
                  </div>
                  <div style={{color: 'rgba(255,255,255,0.5)', fontSize: 13}}>
                    ИИ перерисовывает карточку по вашему описанию
                  </div>
                </div>
              ) : (
                <img src={quickCardImage} alt="Карточка товара" onClick={() => setLightboxSrc(quickCardImage)} style={{cursor:'pointer', width: '100%', height: '100%', objectFit: 'contain', display: 'block'}} />
              )}
            </div>
            {/* Action buttons BELOW image */}
            <div style={{display: 'flex', justifyContent: 'center', gap: 16, padding: '20px 0 0', flexWrap: 'wrap'}}>
              <button 
                onClick={async () => {
                  const filename = `marketplace-card-${Date.now()}.png`;
                  if (quickCardImage.startsWith('data:')) {
                    const link = document.createElement('a'); link.href = quickCardImage; link.download = filename;
                    document.body.appendChild(link); link.click(); document.body.removeChild(link);
                  } else {
                    try {
                      const resp = await fetch(quickCardImage, { mode: 'cors' });
                      const blob = await resp.blob(); const blobUrl = URL.createObjectURL(blob);
                      const link = document.createElement('a'); link.href = blobUrl; link.download = filename;
                      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(blobUrl);
                    } catch (err) { window.open(quickCardImage, '_blank'); }
                  }
                }}
                disabled={isCardEditing}
                style={{
                  background: '#ffd700', color: '#000', border: 'none', borderRadius: 12, padding: '14px 28px', fontSize: 16, fontWeight: 800, cursor: isCardEditing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(255,215,0,0.4)', transition: 'transform 0.2s', opacity: isCardEditing ? 0.5 : 1
                }}
                onMouseEnter={e => { if (!isCardEditing) e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={e => { if (!isCardEditing) e.currentTarget.style.transform = 'scale(1)'; }}
              >
                📥 Скачать HD
              </button>
              <button 
                onClick={() => {
                  const el = document.getElementById('edit-panel');
                  if (el) {
                    el.style.display = 'block';
                    el.scrollIntoView({behavior: 'smooth', block: 'center'});
                  }
                }}
                disabled={isCardEditing}
                style={{
                  background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px 24px', fontSize: 15, fontWeight: 600, cursor: isCardEditing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s', opacity: isCardEditing ? 0.5 : 1
                }}
                onMouseEnter={e => { if (!isCardEditing) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; } }}
                onMouseLeave={e => { if (!isCardEditing) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; } }}
              >
                🪄 Точечная правка (1 кр.)
              </button>
            </div>
          </div>

          <div style={{display: 'flex', alignItems: 'center', margin: '0 0 30px 0'}}>
            <div style={{flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1))'}}></div>
            <div style={{padding: '0 20px', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2}}>Прокачать карточку для ТОПа</div>
            <div style={{flex: 1, height: 1, background: 'linear-gradient(-90deg, transparent, rgba(255,255,255,0.1))'}}></div>
          </div>

          {/* UPSELL DASHBOARD */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 40}}>
            
            {/* Widget 1: Funnel */}
            <div style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 28, marginBottom: 12}}>📸</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>Собрать галерею (4 слайда)</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                ИИ достроит воронку: крупный план, габариты, интерьер. 100% единый стиль.
              </p>
              
              {/* Examples / Real Images */}
              <div style={{display: 'flex', gap: 8, marginBottom: 20}}>
                {quickResults.gallery ? (
                  quickResults.gallery.map((img, idx) => {
                    const isActive = (quickCardImage === img) || (generatedImage === img && !quickCardImage);
                    return (
                      <div key={idx} style={{
                        flex: 1, 
                        aspectRatio: '3/4', 
                        position: 'relative', 
                        borderRadius: 8, 
                        overflow: 'hidden', 
                        border: isActive ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.15)', 
                        boxShadow: isActive ? '0 0 12px rgba(255,215,0,0.35)' : 'none',
                        background: 'rgba(0,0,0,0.3)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'flex-end',
                        transition: 'all 0.2s'
                      }}>
                        <img 
                          src={img} 
                          alt={`Слайд ${idx+1}`} 
                          style={{width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0, cursor: 'pointer'}} 
                          onClick={() => {
                            if (idx === 0 || idx === 2) {
                              setQuickCardImage(img);
                              setGeneratedImage(img);
                              setQuickMode('card');
                            } else {
                              setQuickCardImage(null);
                              setGeneratedImage(img);
                              setQuickMode('photo');
                            }
                          }} 
                        />
                        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 50%)', pointerEvents: 'none'}} />
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const filename = `gallery-slide-${idx+1}-${Date.now()}.png`;
                            if (img.startsWith('data:')) {
                              const link = document.createElement('a'); link.href = img; link.download = filename;
                              document.body.appendChild(link); link.click(); document.body.removeChild(link);
                            } else {
                              fetch(img, { mode: 'cors' }).then(r => r.blob()).then(b => {
                                const u = URL.createObjectURL(b);
                                const link = document.createElement('a'); link.href = u; link.download = filename;
                                document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(u);
                              }).catch(() => window.open(img, '_blank'));
                            }
                          }}
                          style={{position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 22, height: 22, color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10}}
                          title="Скачать"
                        >
                          📥
                        </button>
                        <span style={{position: 'relative', zIndex: 1, color: '#fff', fontSize: 9, fontWeight: 600, padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%'}}>
                          {idx === 0 ? 'Обложка' : idx === 1 ? 'Детали' : idx === 2 ? 'Размеры' : 'Lifestyle'}
                        </span>
                        {isActive && (
                          <div style={{position: 'absolute', top: 4, left: 4, background: '#ffd700', color: '#000', fontSize: 7, fontWeight: 900, padding: '1px 3px', borderRadius: 3, textTransform: 'uppercase', zIndex: 10}}>Активен</div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  [
                    { title: 'Обложка', src: '/examples/gallery/slide1_cover.png' },
                    { title: 'Детали', src: '/examples/gallery/slide2_detail.png' },
                    { title: 'Размеры', src: '/examples/gallery/slide3_size.png' },
                    { title: 'Lifestyle', src: '/examples/gallery/slide4_lifestyle.png' }
                  ].map((slide, idx) => (
                    <div key={idx} style={{flex: 1, aspectRatio: '3/4', position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', opacity: 0.75}}>
                      <img src={slide.src} alt={slide.title} style={{width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0}} />
                      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 50%)'}} />
                      <span style={{position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.95)', fontSize: 8, fontWeight: 600, padding: '4px 4px', textAlign: 'center', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%'}}>
                        {slide.title}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {quickResults.gallery ? (
                <div style={{display: 'flex', gap: 8, marginTop: 'auto'}}>
                  <button 
                    onClick={() => openLightboxGallery(quickResults.gallery, 0)}
                    style={{flex: 1, background: 'rgba(255,215,0,0.2)', color: '#ffd700', border: '1px solid rgba(255,215,0,0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.3)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.2)'}}
                  >
                    👁️ Просмотр
                  </button>
                  <button 
                    onClick={() => triggerConfirm('gallery', 5, handleGenerateGallery)}
                    style={{background: 'rgba(255,215,0,0.08)', color: '#ffd700', border: '1px solid rgba(255,215,0,0.3)', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.18)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.08)'}}
                    title="Пересоздать галерею"
                  >
                    🔄
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => triggerConfirm('gallery', 5, handleGenerateGallery)}
                  disabled={isGalleryGenerating}
                  style={{width: '100%', background: 'rgba(255,215,0,0.1)', color: '#ffd700', border: '1px solid rgba(255,215,0,0.3)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto'}}
                  onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.2)'}}
                  onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.1)'}}
                >
                  {isGalleryGenerating ? '⏳ Создаём...' : <>Создать за 5 кр. <span style={{textDecoration: 'line-through', opacity: 0.5, fontSize: 11, marginLeft: 6, fontWeight: 400}}>8 кр.</span></>}
                </button>
              )}
            </div>

            {/* Widget 3: A/B Test */}
            <div style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 28, marginBottom: 12}}>⚖️</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>Найти лучший CTR (A/B Тест)</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                Не гадайте. ИИ сгенерирует 2 альтернативные обложки с другими хуками и композицией.
              </p>

              {/* A/B Test Variants view */}
              {quickResults.abTest ? (
                <div style={{display: 'flex', gap: 12, marginBottom: 20}}>
                  {quickResults.abTest.map((img, idx) => {
                    const isActive = quickCardImage === img;
                    return (
                      <div key={idx} style={{
                        flex: 1, 
                        aspectRatio: '3/4', 
                        position: 'relative', 
                        borderRadius: 8, 
                        overflow: 'hidden', 
                        border: isActive ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.15)', 
                        boxShadow: isActive ? '0 0 12px rgba(255,215,0,0.35)' : 'none',
                        background: 'rgba(0,0,0,0.3)',
                        transition: 'all 0.2s'
                      }}>
                        <img 
                          src={img} 
                          alt={`Вариант ${idx === 0 ? 'A' : 'B'}`} 
                          style={{width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer'}} 
                          onClick={() => {
                            setQuickCardImage(img);
                            setGeneratedImage(img);
                            setQuickMode('card');
                            setQuickResults(prev => ({
                              ...prev, 
                              card: { image: img, editHistory: [{ image: img, editText: `Выбран вариант ${idx === 0 ? 'A' : 'B'}` }] }
                            }));
                          }} 
                        />
                        <div style={{position: 'absolute', top: 4, left: 4, background: idx === 0 ? '#4ade80' : '#3b82f6', color: '#000', fontSize: 8, fontWeight: 900, padding: '2px 4px', borderRadius: 4, zIndex: 10}}>
                          {idx === 0 ? 'A' : 'B'}
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const filename = `ab-test-variant-${idx === 0 ? 'A' : 'B'}-${Date.now()}.png`;
                            if (img.startsWith('data:')) {
                              const link = document.createElement('a'); link.href = img; link.download = filename;
                              document.body.appendChild(link); link.click(); document.body.removeChild(link);
                            } else {
                              fetch(img, { mode: 'cors' }).then(r => r.blob()).then(b => {
                                const u = URL.createObjectURL(b);
                                const link = document.createElement('a'); link.href = u; link.download = filename;
                                document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(u);
                              }).catch(() => window.open(img, '_blank'));
                            }
                          }}
                          style={{position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 22, height: 22, color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10}}
                          title="Скачать"
                        >
                          📥
                        </button>
                        {isActive && (
                          <div style={{position: 'absolute', bottom: 4, left: 4, right: 4, background: '#ffd700', color: '#000', fontSize: 7, fontWeight: 900, padding: '1px 0', borderRadius: 3, textTransform: 'uppercase', textAlign: 'center', zIndex: 10}}>Активен</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {quickResults.abTest ? (
                <div style={{display: 'flex', gap: 8, marginTop: 'auto'}}>
                  <button 
                    onClick={() => openLightboxGallery(quickResults.abTest, 0)}
                    style={{flex: 1, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}}
                  >
                    ⚖️ Сравнить
                  </button>
                  <button 
                    onClick={() => triggerConfirm('ab', 2, handleGenerateABTest)}
                    style={{background: 'rgba(255,255,255,0.03)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}}
                    title="Пересоздать A/B Тест"
                  >
                    🔄
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => triggerConfirm('ab', 2, handleGenerateABTest)}
                  disabled={isAbGenerating}
                  style={{width: '100%', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto'}}
                  onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}}
                  onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}}
                >
                  {isAbGenerating ? '⏳ Создаём...' : 'Создать за 2 кр.'}
                </button>
              )}
            </div>

            {/* Widget 2: Video */}
            <div style={{background: 'linear-gradient(145deg, rgba(167, 139, 250, 0.08) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(167, 139, 250, 0.2)', borderRadius: 20, padding: 24, position: 'relative', display: 'flex', flexDirection: 'column'}}>
              <div style={{position: 'absolute', top: 20, right: 20, background: 'rgba(167, 139, 250, 0.2)', color: '#d8b4fe', fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 6, textTransform: 'uppercase', border: '1px solid rgba(167, 139, 250, 0.3)'}}>Тренд 2026</div>
              <div style={{fontSize: 28, marginBottom: 12}}>🎬</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>Оживить в Видеообложку</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                Алгоритмы WB обожают Motion. Добавим 3D-параллакс, игру света и анимацию УТП.
              </p>
              <button 
                onClick={() => triggerConfirm('video', 4, () => { setStatusText('🎬 Видеогенерация скоро будет доступна! Мы уже работаем над этим.'); setStatusType('processing'); })}
                style={{width: '100%', background: 'rgba(167, 139, 250, 0.15)', color: '#d8b4fe', border: '1px solid rgba(167, 139, 250, 0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto'}}
                onMouseEnter={e => {e.currentTarget.style.background = 'rgba(167, 139, 250, 0.25)'}}
                onMouseLeave={e => {e.currentTarget.style.background = 'rgba(167, 139, 250, 0.15)'}}
              >
                Создать видео за 4 кр.
              </button>
            </div>

            {/* Widget 4: UGC Photo */}
            <div style={{background: 'linear-gradient(145deg, rgba(34, 197, 94, 0.08) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 28, marginBottom: 12}}>📱</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>Фото от покупателей</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                Реалистичные фото товара в домашней или естественной обстановке — как из отзывов.
              </p>
              {quickResults.ugc ? (
                <div style={{display: 'flex', gap: 8, marginTop: 'auto'}}>
                  <button 
                    onClick={() => { setQuickMode('ugc'); setQuickCardImage(null); setGeneratedImage(quickResults.ugc.image); setCardEditHistory([]); }}
                    style={{flex: 1, background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.35)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'}}
                  >
                    📱 Показать
                  </button>
                  <button 
                    onClick={() => triggerConfirm('ugc', 1, () => handleQuickGenerate('ugc'))}
                    style={{background: 'rgba(34, 197, 94, 0.08)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.08)'}}
                    title="Создать новое UGC-фото"
                  >
                    🔄
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => triggerConfirm('ugc', 1, () => handleQuickGenerate('ugc'))}
                  style={{width: '100%', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto'}}
                  onMouseEnter={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.25)'}}
                  onMouseLeave={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'}}
                >
                  Создать за 1 кр.
                </button>
              )}
            </div>

          </div>

          {/* EDIT PANEL (Hidden by default, shown via button) */}
          <div id="edit-panel" style={{display: 'none', background: 'rgba(255,255,255,0.02)', borderRadius: 24, padding: '24px', border: '1px dashed rgba(255,255,255,0.1)', marginBottom: 40}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
              <div style={{fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.95)'}}>
                🪄 Точечная правка
              </div>
              <button 
                onClick={() => document.getElementById('edit-panel').style.display = 'none'}
                style={{background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 24, padding: '0 10px'}}
              >×</button>
            </div>
            <p style={{fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px 0', lineHeight: '1.5'}}>
              Опишите текстом, что нужно изменить. Каждая правка стоит <strong style={{color:'#ffd700'}}>1 кредит</strong>.
            </p>
            <div style={{display:'flex', flexDirection: 'column', gap: 16}}>
              <textarea
                className="modifier-input"
                rows={3}
                placeholder="Например: «Убери текст справа вверху» или «Сделай фон темнее»"
                value={cardEditText}
                onChange={e => setCardEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCardEdit(); } }}
                style={{width: '100%', minHeight: 80, resize: 'vertical', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 16, color: '#fff'}}
                disabled={isCardEditing}
              />
              <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                <button
                  className="generate-btn"
                  onClick={handleCardEdit}
                  disabled={isCardEditing || !cardEditText.trim()}
                  style={{padding: '12px 28px', width: 'auto', minWidth: 200, whiteSpace: 'nowrap'}}
                >
                  {isCardEditing ? '⏳ Применяем...' : '🔄 Применить — 1 кр.'}
                </button>
              </div>
            </div>

            {/* Edit history */}
            {cardEditHistory.length > 1 && (
              <div style={{marginTop: 24}}>
                <div style={{fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12}}>История правок</div>
                <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                  {cardEditHistory.map((entry, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQuickCardImage(entry.image);
                        setGeneratedImage(entry.image);
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: `1px solid ${quickCardImage === entry.image ? 'rgba(255,215,0,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        background: quickCardImage === entry.image ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.03)',
                        color: quickCardImage === entry.image ? '#ffd700' : 'rgba(255,255,255,0.6)',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {idx === 0 ? '🎨 Оригинал' : `v${idx + 1}: ${entry.editText.substring(0, 25)}${entry.editText.length > 25 ? '...' : ''}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* BOTTOM ACTION */}
          <div style={{textAlign: 'center'}}>
            <button
              onClick={() => {
                setGeneratedImage(null);
                setQuickCardImage(null);
                setCardEditHistory([]);
                setCardEditText('');
                setUserProductInfo('');
                setQuickResults({});
                setImageFiles([]);
                setGarmentUrls([]);
                setPreviewUrls([]);
                localStorage.removeItem('vton_generatedImage');
                localStorage.removeItem('vton_quickCardImage');
                localStorage.removeItem('vton_cardEditHistory');
                localStorage.removeItem('vton_quickResults');
                localStorage.removeItem('vton_garmentUrls');
                localStorage.removeItem('vton_userProductInfo');
              }}
              style={{
                background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer', transition: 'all 0.2s', textDecoration: 'underline'
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
            >
              Сбросить и начать заново с другим фото
            </button>
          </div>

        </motion.div>
      )}

      {/* 8б. РЕЗУЛЬТАТ — режимы Одежда / Предметка */}
      <AnimatePresence>
        {generatedImage && appMode !== 'quick' && (
          <motion.div key="result-section" className="section result-section" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:0.5}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
              <h3 style={{margin:0}}>Финальный Рендер</h3>
              <button
                onClick={() => {
                  setGeneratedImage(null);
                  setImageHistory([]);
                  setHistoryIndex(0);
                  localStorage.removeItem('vton_generatedImage');
                }}
                title="Закрыть рендер"
                style={{background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', fontSize:'16px', color:'rgba(255,255,255,0.6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.2s'}}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,80,80,0.25)'; e.currentTarget.style.color='#ff6060'; e.currentTarget.style.borderColor='rgba(255,80,80,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; }}
              >✕</button>
            </div>
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

            {/* CARD DESIGNER CTA — removed from results, lives in "В два клика" mode only */}

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
                {locPreviews.length>0 && <div className="drop-zone-previews">{locPreviews.map((p,i)=><img key={i} src={p} alt="" style={{cursor:'zoom-in'}} onClick={(e) => { e.stopPropagation(); setLightboxSrc(p); }} />)}</div>}
              </div>
              <div className="modal-actions">
                <button className="modal-btn-cancel" onClick={()=>{setShowLocModal(false);setLocName('');setLocPreviews([]);}}>Отмена</button>
                <button className="modal-btn-primary" onClick={saveLoc} disabled={!locName.trim()||locPreviews.length<2}>Сохранить</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ВИЗАРД: Создание персонажа */}
      <AnimatePresence>
        {showPersonaWizard && (
          <PersonaWizard
            onClose={() => setShowPersonaWizard(false)}
            onSave={savePersonaModel}
            authHeaders={(() => { const token = user?.accessToken || user?.stsTokenManager?.accessToken; return token ? { Authorization: `Bearer ${token}` } : {}; })()}
            credits={subscription?.credits || 0}
          />
        )}
      </AnimatePresence>

      {/* Comp card lightbox */}
      <AnimatePresence>
        {viewingCompCard && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setViewingCompCard(null)} style={{zIndex:1000}}>
            <motion.div initial={{scale:0.8}} animate={{scale:1}} exit={{scale:0.8}} onClick={e => e.stopPropagation()} style={{maxWidth:'90vw', maxHeight:'90vh'}}>
              <img src={viewingCompCard} alt="Comp Card" style={{maxWidth:'100%', maxHeight:'90vh', borderRadius:16}} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* МОДАЛКА: LoRA модель */}
      <AnimatePresence>
        <LoraModal show={showLoraModal} onClose={()=>{setShowLoraModal(false);setLoraName('');setLoraPhotos({front:null,left34:null,right34:null,fullbody:null});}}
          onSave={saveLoraModel} loraName={loraName} setLoraName={setLoraName} loraPhotos={loraPhotos} setLoraPhotos={setLoraPhotos}
          authHeaders={(() => { const t = user?.accessToken; return t ? { Authorization: 'Bearer ' + t } : {}; })()} />
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
        {showCalibWizard && (
          <ModelCalibrationWizard
            show={showCalibWizard}
            onClose={() => setShowCalibWizard(false)}
            onSave={saveCalibratedModel}
            onStartCalibration={async () => {
              if (!user || user.isGuest || (user.isAnonymous && !user.isTelegramUser)) {
                throw new Error('Для создания модели необходимо авторизоваться');
              }
              // Калибровка модели теперь бесплатна, кредиты не списываются.
            }}
            modelPrompt={getCurrentModelPrompt()}
            modelRefImages={getCurrentModelRefs()}
            userId={user?.uid}
            getAuthToken={async () => user?.getIdToken?.()}
          />
        )}
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

      {/* МОДАЛКА: Добавление/Редактирование кастомного чипа */}
      <AnimatePresence>
        {(customChipModalSection || editingChip) && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} 
            onClick={() => { setCustomChipModalSection(null); setEditingChip(null); setNewChipText(''); }}>
            <motion.div className="modal-content" initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} onClick={e=>e.stopPropagation()}>
              <div className="modal-title">
                {editingChip ? '✏️ Редактировать вариант' : (
                  customChipModalSection === 'model' ? '➕ Свой вариант модели' :
                  customChipModalSection === 'pose' ? '➕ Свой вариант позы' :
                  '➕ Свой вариант фона'
                )}
              </div>
              <input 
                className="modal-input" 
                autoFocus 
                placeholder={
                  (editingChip?.section || customChipModalSection) === 'model' ? "Например: рыжая девушка в очках..." :
                  (editingChip?.section || customChipModalSection) === 'pose' ? "Например: модель сидит на стуле..." :
                  "Например: кирпичная стена, неоновый свет..."
                } 
                value={newChipText} 
                onChange={e=>setNewChipText(e.target.value)} 
                onKeyDown={e => {
                  if (e.key === 'Enter' && newChipText.trim()) {
                    if (editingChip) saveEditCustomChip();
                    else {
                      addCustomChip(customChipModalSection);
                      setCustomChipModalSection(null);
                    }
                  }
                  if (e.key === 'Escape') {
                    setCustomChipModalSection(null);
                    setEditingChip(null);
                    setNewChipText('');
                  }
                }}
              />
              <div className="modal-actions">
                <button className="modal-btn-cancel" onClick={()=>{ setCustomChipModalSection(null); setEditingChip(null); setNewChipText(''); }}>Отмена</button>
                <button className="modal-btn-primary" onClick={() => {
                  if (editingChip) saveEditCustomChip();
                  else {
                    addCustomChip(customChipModalSection);
                    setCustomChipModalSection(null);
                  }
                }} disabled={!newChipText.trim()}>
                  {editingChip ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export default App;
