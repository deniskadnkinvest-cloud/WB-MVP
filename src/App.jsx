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
import { getModels, saveModel, deleteModelDoc, updateModelPrompt, getLocations, saveLocation, deleteLocationDoc, updateLocationPrompt, patchLocation } from './lib/firestoreService';
import { uploadBase64Image, compressImage, uploadImage, deleteImage, downloadStoragePathAsBase64 } from './lib/storageService';
import { getSubscription, checkFeature, canGenerate, activatePlan } from './lib/subscriptionService';
// CardLayerStudio removed вЂ” replaced by text-based card editing
import './App.css';

const MSGS = ['РђРЅР°Р»РёР·РёСЂСѓРµРј С‚РµРєСЃС‚СѓСЂСѓ С‚РєР°РЅРё...','Р’С‹СЃС‚Р°РІР»СЏРµРј СЃС‚СѓРґРёР№РЅС‹Р№ СЃРІРµС‚...','РЎС‚СЂРѕРёРј 3D-РјРѕРґРµР»СЊ С„РёРіСѓСЂС‹...','РќР°С‚СЏРіРёРІР°РµРј РѕРґРµР¶РґСѓ СЃ СѓС‡РµС‚РѕРј С„РёР·РёРєРё...','Р РµРЅРґРµСЂРёРј С„РёРЅР°Р»СЊРЅС‹Р№ РєР°РґСЂ...'];
const initDetails = () => { const d={}; Object.keys(getModelDetails('female')).forEach(k=>{d[k]=null;}); return d; };

// Safe JSON parser вЂ” handles Vercel timeouts that return HTML instead of JSON
const safeParseJSON = async (resp) => {
  // Check HTTP status first
  if (resp.status === 413) {
    console.error('вљ пёЏ 413 Payload Too Large вЂ” image files are too big');
    return { success: false, error: 'Р¤Р°Р№Р» СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№. РџРѕРїСЂРѕР±СѓР№С‚Рµ С„РѕС‚Рѕ РјРµРЅСЊС€РµРіРѕ СЂР°Р·РјРµСЂР°.' };
  }
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    // Vercel returned HTML error page (timeout/crash)
    console.error('вљ пёЏ Non-JSON response from API:', resp.status, text.substring(0, 200));
    if (text.includes('FUNCTION_INVOCATION_TIMEOUT') || text.includes('An error occurred')) {
      return { success: false, error: 'РЎРµСЂРІРµСЂ РЅРµ СѓСЃРїРµР» РѕС‚РІРµС‚РёС‚СЊ (С‚Р°Р№РјР°СѓС‚). РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р·.' };
    }
    return { success: false, error: `РћС€РёР±РєР° СЃРµСЂРІРµСЂР° (${resp.status}). РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.` };
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
  const [locBase64Cache, setLocBase64Cache] = useState({}); // id в†’ base64 image array
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

  // в•ђв•ђв•ђ CUSTOM CHIP HELPERS в•ђв•ђв•ђ
  const IMPROV_POSE = { id: 'improvisation', label: 'РРјРїСЂРѕРІРёР·Р°С†РёСЏ', emoji: 'рџЋІ', prompt: 'random aesthetic fashion pose, natural dynamic body positioning, editorial spontaneous movement, varied creative posture' };

  const addCustomChip = (section) => {
    if (!newChipText.trim()) { setAddingCustom(null); return; }
    const chip = { id: `custom_${Date.now()}`, label: newChipText.trim(), prompt: newChipText.trim(), emoji: 'вњЏпёЏ', isCustomChip: true };
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
    return 'РІС‹Р±СЂР°РЅРЅРѕР№ РјРѕРґРµР»Рё';
  };

  // Is multi-model selected? (for showing РРјРїСЂРѕРІРёР·Р°С†РёСЏ pose)
  const isMultiModel = !customModelPrompt && !selectedSavedModelId && (selectedModels.length + customModelChips.length) > 1;

  // в•ђв•ђв•ђ TOTAL SHOTS CALCULATION в•ђв•ђв•ђ
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

  // в•ђв•ђв•ђ CARD DESIGNER (marketplace card) в•ђв•ђв•ђ
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
  // [QUICK_MODE_V2] вЂ” Card generation + text-based editing
  const [quickMode, setQuickMode] = useState(() => {
    return localStorage.getItem('vton_quickMode') || 'card';
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

  // в•ђв•ђв•ђ LOCALSTORAGE SYNC EFFECTS в•ђв•ђв•ђ
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

  // в•ђв•ђв•ђ TELEGRAM BACK BUTTON в•ђв•ђв•ђ
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
    
    // Р—Р°РіСЂСѓР¶Р°РµРј РґР°РЅРЅС‹Рµ РїР°СЂР°Р»Р»РµР»СЊРЅРѕ Рё Р°СЃРёРЅС…СЂРѕРЅРЅРѕ, РЅРµ Р±Р»РѕРєРёСЂСѓСЏ РѕС‚СЂРёСЃРѕРІРєСѓ РёРЅС‚РµСЂС„РµР№СЃР°
    getModels(user.uid)
      .then((models) => {

        setMyModels(models || []);
      })
      .catch((err) => console.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РјРѕРґРµР»РµР№:', err));

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
          console.log(`рџ”„ Migrating ${needsMigration.length} legacy location(s) via Firebase SDK...`);
          const uid = user.uid;
          for (const loc of needsMigration) {
            try {
              // Use Firebase Storage SDK (auth-aware) вЂ” bypasses CORS and Storage Rules
              // Strategy 1: Firebase SDK getBytes (auth-aware, bypasses CORS)
              let b64arr = [];
              if (loc.storagePaths && loc.storagePaths.length > 0) {
                b64arr = await Promise.all(
                  loc.storagePaths.slice(0, 5).map(path => downloadStoragePathAsBase64(path))
                );
              }
              // Strategy 2: fallback вЂ” direct URL fetch
              if (b64arr.filter(Boolean).length === 0 && loc.imageUrls && loc.imageUrls.length > 0) {
                console.log(`в†©пёЏ SDK failed for '${loc.title}', trying direct URL fetch...`);
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
              // Strategy 3: Server-side Admin SDK migration (bypasses ALL client restrictions)
              if (b64arr.filter(Boolean).length === 0 && loc.storagePaths && loc.storagePaths.length > 0) {
                console.log(`рџ–ҐпёЏ Trying server-side migration for '${loc.title}'...`);
                try {
                  const idToken = await user.getIdToken();
                  if (idToken) {
                    const resp = await fetch('/api/admin/migrate-location', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                      body: JSON.stringify({ locationId: loc.id, storagePaths: loc.storagePaths }),
                    });
                    const data = await resp.json();
                    if (data.ok && data.base64 && data.base64.length > 0) {
                      b64arr = data.base64;
                      console.log(`вњ… Server migration succeeded for '${loc.title}' (${data.count} images)`);
                    } else {
                      console.warn(`вљ пёЏ Server migration failed for '${loc.title}':`, data.error);
                    }
                  }
                } catch (srvErr) {
                  console.warn(`вљ пёЏ Server migration request failed:`, srvErr.message);
                }
              }
              const validB64 = b64arr.filter(Boolean);
              if (validB64.length > 0) {
                // Server already patched Firestore if strategy 3 worked, but update local state
                await patchLocation(uid, loc.id, { imageBase64: validB64 });
                setLocBase64Cache(prev => ({ ...prev, [loc.id]: validB64 }));
                setMyLocations(prev => prev.map(l =>
                  l.id === loc.id ? { ...l, imageBase64: validB64 } : l
                ));
                console.log(`вњ… Migrated loc '${loc.title}' (${validB64.length} images)`);
              } else {
                console.warn(`вљ пёЏ Could not migrate loc '${loc.title}' вЂ” all 3 strategies failed. Files may be permanently inaccessible.`);
              }
            } catch (err) {
              console.warn(`вљ пёЏ Migration failed for loc '${loc.title}':`, err.message);
            }
          }
          console.log('вњ… Location migration complete');
        }
      })
      .catch((err) => console.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё Р»РѕРєР°С†РёР№:', err));
    // Р—Р°РіСЂСѓР·РєР° РїРѕРґРїРёСЃРєРё
    // РњРёРіСЂР°С†РёСЏ legacy-РїРѕРґРїРёСЃРѕРє С‚РµРїРµСЂСЊ РїСЂРѕРёСЃС…РѕРґРёС‚ РІ /api/auth-telegram РїСЂРё РІС…РѕРґРµ,
    // РїРѕСЌС‚РѕРјСѓ Р·РґРµСЃСЊ РїСЂРѕСЃС‚Рѕ С‡РёС‚Р°РµРј РїРѕРґРїРёСЃРєСѓ РїРѕ СЃС‚Р°Р±РёР»СЊРЅРѕРјСѓ UID
    getSubscription(user.uid, user.email, user.telegramId)
      .then((sub) => {
        if (sub) setSubscription(sub);
      })
      .catch((err) => {
        console.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РїРѕРґРїРёСЃРєРё:', err);
        setSubscription({ plan: 'none', credits: 0, creditsTotal: 0 });
      });
  }, [user]);

  // РћР±РЅРѕРІР»СЏРµС‚ Р±Р°Р»Р°РЅСЃ РєСЂРµРґРёС‚РѕРІ РїРѕСЃР»Рµ РіРµРЅРµСЂР°С†РёРё вЂ” РїРµСЂРµРїРѕР»СѓС‡Р°РµС‚ РїРѕРґРїРёСЃРєСѓ РёР· Firestore
  const refreshCreditsFromResponse = async (_responseData) => {
    if (!user?.uid) return;
    try {
      const fresh = await getSubscription(user.uid, user.email, user.telegramId);
      if (fresh) setSubscription(fresh);
    } catch (_e) {
      // Silent fail вЂ” UI balance stays until next reload
    }
  };

  // РџСЂРѕРІРµСЂРєР° СѓСЃРїРµС€РЅРѕР№ РѕРїР»Р°С‚С‹ Р®Kassa РїСЂРё РІРѕР·РІСЂР°С‚Рµ РЅР° СЃР°Р№С‚ (return_url)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      const plan = params.get('plan') || '';
      setStatusText(`вЏі РџР»Р°С‚РµР¶ РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚СЃСЏ. Р’Р°С€ С‚Р°СЂРёС„ В«${plan.toUpperCase()}В» Р°РєС‚РёРІРёСЂСѓРµС‚СЃСЏ...`);
      setStatusType('success');

      // РћС‡РёС‰Р°РµРј РїР°СЂР°РјРµС‚СЂС‹ РёР· Р°РґСЂРµСЃРЅРѕР№ СЃС‚СЂРѕРєРё Р±РµР· РїРµСЂРµР·Р°РіСЂСѓР·РєРё
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      // Р—Р°РїСѓСЃРєР°РµРј РїРѕР»Р»РёРЅРі РїРѕРґРїРёСЃРєРё РІ С‚РµС‡РµРЅРёРµ 12 СЃРµРєСѓРЅРґ
      if (user && user.uid) {
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const sub = await getSubscription(user.uid, user.email, user.telegramId);
            if (sub && sub.plan === plan) {
              setSubscription(sub);
              setStatusText(`вњ… РўР°СЂРёС„ В«${plan.toUpperCase()}В» СѓСЃРїРµС€РЅРѕ Р°РєС‚РёРІРёСЂРѕРІР°РЅ! РќР°С‡РёСЃР»РµРЅРѕ ${sub.credits} РєР°РґСЂРѕРІ.`);
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
      // РЁР°Рі 1: РЎРѕР·РґР°С‘Рј РїР»Р°С‚С‘Р¶РЅСѓСЋ СЃРµСЃСЃРёСЋ Р®Kassa РЅР° Р±СЌРєРµРЅРґРµ
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
        throw new Error(invoiceData.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїР»Р°С‚РµР¶');
      }

      // РЁР°Рі 2: РџРµСЂРµРЅР°РїСЂР°РІР»СЏРµРј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РЅР° С„РѕСЂРјСѓ РѕРїР»Р°С‚С‹ Р®Kassa
      const paymentUrl = invoiceData.invoiceLink;
      console.log('[Payment] Redirecting to:', paymentUrl);
      
      setShowPricing(false);
      setStatusText('вЏі РџРµСЂРµРЅР°РїСЂР°РІР»СЏРµРј РЅР° Р·Р°С‰РёС‰РµРЅРЅСѓСЋ СЃС‚СЂР°РЅРёС†Сѓ РѕРїР»Р°С‚С‹ Р®Kassa...');
      setStatusType('success');

      if (window.Telegram?.WebApp?.openLink) {
        // РћС‚РєСЂС‹РІР°РµРј РїР»Р°С‚РµР¶РЅС‹Р№ С€Р»СЋР· РїСЂСЏРјРѕ РІ Telegram
        window.Telegram.WebApp.openLink(paymentUrl);
      } else {
        // Fallback РґР»СЏ РѕР±С‹С‡РЅРѕРіРѕ РІРµР±-РёРЅС‚РµСЂС„РµР№СЃР°
        window.location.href = paymentUrl;
      }
    } catch (err) {
      console.error('[Payment] РћС€РёР±РєР° РѕРїР»Р°С‚С‹:', err);
      setStatusText(`РћС€РёР±РєР°: ${err.message}`);
      setStatusType('error');
    } finally {
      setPricingLoading(false);
    }
  };

  // Disable subscription auto-renew while keeping the paid period active.
  const handleCancelAutoRenew = async () => {
    if (!user) return;
    if (!window.confirm('Р’С‹ РґРµР№СЃС‚РІРёС‚РµР»СЊРЅРѕ С…РѕС‚РёС‚Рµ РѕС‚РєР»СЋС‡РёС‚СЊ Р°РІС‚РѕРїСЂРѕРґР»РµРЅРёРµ РІР°С€РµР№ РїРѕРґРїРёСЃРєРё?')) return;

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
        throw new Error(data.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєР»СЋС‡РёС‚СЊ Р°РІС‚РѕРїСЂРѕРґР»РµРЅРёРµ');
      }

      setSubscription(prev => ({ ...prev, autoRenew: false }));
      alert('РђРІС‚РѕРїСЂРѕРґР»РµРЅРёРµ РїРѕРґРїРёСЃРєРё РѕС‚РєР»СЋС‡РµРЅРѕ. РўР°СЂРёС„ РїСЂРѕРґРѕР»Р¶РёС‚ РґРµР№СЃС‚РІРѕРІР°С‚СЊ РґРѕ РєРѕРЅС†Р° РѕРїР»Р°С‡РµРЅРЅРѕРіРѕ РїРµСЂРёРѕРґР°.');
    } catch (err) {
      console.error('Failed to cancel auto-renew:', err);
      alert(err.message || 'РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё РѕС‚РјРµРЅРµ Р°РІС‚РѕРїСЂРѕРґР»РµРЅРёСЏ');
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

  // Multi-file upload вЂ” try Firebase Storage first, fall back to base64
  const handleFilesChange = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newFiles = [...imageFiles, ...files].slice(0, 9);
    setImageFiles(newFiles);
    const localUrls = newFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(localUrls);
    setGeneratedImage(null);
    setStatusText('вЃпёЏ Р—Р°РіСЂСѓР¶Р°РµРј С„РѕС‚Рѕ...');
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
          console.warn('вљ пёЏ Storage unavailable, using base64 fallback:', storageErr.message);
          return await fileToBase64(compressed);
        }
      }));
      const allUrls = [...garmentUrls, ...newUrls].slice(0, 9);
      setGarmentUrls(allUrls);
      setStatusText(`Р—Р°РіСЂСѓР¶РµРЅРѕ ${newFiles.length} РІРµС‰${newFiles.length === 1 ? 'СЊ' : newFiles.length < 5 ? 'Рё' : 'РµР№'}. Р’СЃРµ Р±СѓРґСѓС‚ РЅР°РґРµС‚С‹ РЅР° РјРѕРґРµР»СЊ.`);
    } catch (err) {
      console.error('Upload error:', err);
      setStatusText('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰С‘ СЂР°Р·.');
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

  // в•ђв•ђв•ђ RUв†’EN Prompt Mapping вЂ” ULTRA-DETAILED descriptors в•ђв•ђв•ђ
  // Each characteristic MUST be described in enough detail that Gemini cannot skip it.
  const DETAIL_TO_PROMPT = {
    // в”Ђв”Ђв”Ђ BODY TYPE (critical вЂ” needs strongest overrides) в”Ђв”Ђв”Ђ
    'РҐСѓРґРѕС‰Р°РІРѕРµ': 'BODY TYPE: slim lean body with thin limbs, narrow bony shoulders, visible collarbones and wrist bones, very low body fat, elongated proportions, delicate frame. The person must look noticeably thin.',
    'РЎРїРѕСЂС‚РёРІРЅРѕРµ': 'BODY TYPE: athletic fit body with visibly toned muscles, defined arms and shoulders, flat toned stomach, healthy skin glow. Body of a person who exercises regularly. NOT overweight, NOT skinny.',
    'РЎСЂРµРґРЅРµРµ': 'BODY TYPE: average normal healthy body build, neither thin nor heavy, standard proportions, BMI 20-25. Natural everyday person, not a fitness model.',
    'РџРѕР»РЅРѕРµ': 'BODY TYPE: obese plus-size body, BMI 35+, large round fat belly, thick heavy neck, prominent double chin, chubby cheeks, wide thick torso, US clothing size 3XL, heavy-set build with visible body fat and round chubby face. The person MUST look explicitly fat and overweight, not slim.',
    'РњСѓСЃРєСѓР»РёСЃС‚РѕРµ': 'BODY TYPE: muscular body with clearly visible muscle definition on arms, shoulders, chest and legs. Broad powerful shoulders, narrow waist (V-taper), low body fat 12-18%. Veins visible on forearms. Strong thick neck. The body MUST look like a fitness competitor or bodybuilder вЂ” NOT soft, NOT average, NOT overweight.',

    // в”Ђв”Ђв”Ђ HAIR COLOR (specific tones, not generic words) в”Ђв”Ђв”Ђ
    'Р‘СЂСЋРЅРµС‚РєР°': 'HAIR: rich dark brunette brown hair color', 'Р‘СЂСЋРЅРµС‚': 'HAIR: rich dark brunette brown hair color',
    'РЁР°С‚РµРЅРєР°': 'HAIR: warm chestnut medium-brown hair color with natural highlights', 'РЁР°С‚РµРЅ': 'HAIR: warm chestnut medium-brown hair color with natural highlights',
    'Р‘Р»РѕРЅРґРёРЅРєР°': 'HAIR: light golden blonde hair color', 'Р‘Р»РѕРЅРґРёРЅ': 'HAIR: light golden blonde hair color',
    'Р С‹Р¶Р°СЏ': 'HAIR: vibrant red-ginger copper hair color (clearly red, not brown)', 'Р С‹Р¶РёР№': 'HAIR: vibrant red-ginger copper hair color (clearly red, not brown)',
    'Р§С‘СЂРЅС‹Рµ': 'HAIR: jet black hair color, deep dark without any brown tint',
    'РЎРµРґС‹Рµ': 'HAIR: natural silver-gray hair color suggesting age 50+',

    // в”Ђв”Ђв”Ђ HAIR LENGTH (explicit visual description) в”Ђв”Ђв”Ђ
    'РљРѕСЂРѕС‚РєРёРµ': 'HAIR LENGTH: short hair above the ears, cropped close to the head',
    'РЎСЂРµРґРЅРёРµ': 'HAIR LENGTH: medium-length hair reaching the shoulders',
    'Р”Р»РёРЅРЅС‹Рµ': 'HAIR LENGTH: long flowing hair reaching well below the shoulders, past the chest',
    'Р‘СЂРёС‚Р°СЏ': 'HAIR LENGTH: completely shaved bald head, no hair visible', 'Р‘СЂРёС‚С‹Р№': 'HAIR LENGTH: completely shaved bald head, no hair visible',

    // в”Ђв”Ђв”Ђ EMOTION (describe facial muscles, not abstract feelings) в”Ђв”Ђв”Ђ
    'РќРµР№С‚СЂР°Р»СЊРЅР°СЏ': 'EXPRESSION: neutral calm relaxed face, mouth closed, no smile, eyes looking directly at camera',
    'Р›С‘РіРєР°СЏ СѓР»С‹Р±РєР°': 'EXPRESSION: gentle slight warm smile with lips slightly curved upward, soft friendly eyes',
    'РЎРµСЂСЊС‘Р·РЅР°СЏ': 'EXPRESSION: serious intense focused expression, strong direct eye contact, slight frown, no smile', 'РЎРµСЂСЊС‘Р·РЅС‹Р№': 'EXPRESSION: serious intense focused expression, strong direct eye contact, slight frown, no smile',
    'РЈРІРµСЂРµРЅРЅР°СЏ': 'EXPRESSION: confident powerful self-assured expression, chin slightly raised, bold direct gaze, subtle commanding smile', 'РЈРІРµСЂРµРЅРЅС‹Р№': 'EXPRESSION: confident powerful self-assured expression, chin slightly raised, bold direct gaze, subtle commanding smile',
    'Р”РµСЂР·РєР°СЏ': 'EXPRESSION: bold edgy rebellious attitude, slightly squinted eyes, smirk, defiant look', 'Р”РµСЂР·РєРёР№': 'EXPRESSION: bold edgy rebellious attitude, slightly squinted eyes, smirk, defiant look',

    // в”Ђв”Ђв”Ђ PIERCING (specific placement and visibility) в”Ђв”Ђв”Ђ
    'РЈС€Рё': 'PIERCING: visible small metallic stud earrings in both earlobes, must be clearly visible',
    'РќРѕСЃ': 'PIERCING: visible small subtle nose ring or stud piercing on one nostril, must be clearly visible',
    'РЈС€Рё + РќРѕСЃ': 'PIERCING: visible metallic stud earrings in both earlobes AND a small nose ring/stud on one nostril вЂ” both must be clearly visible',

    // в”Ђв”Ђв”Ђ TATTOO (MANDATORY visibility вЂ” these must actually appear) в”Ђв”Ђв”Ђ
    'РњРёРЅРёРјР°Р»РёР·Рј': 'TATTOO (MANDATORY вЂ” MUST BE VISIBLE): small minimalist fine-line black ink tattoos on visible skin areas such as wrists, collarbones, or fingers. The tattoos MUST be clearly visible in the final image.',
    'Р СѓРєР°РІ': 'TATTOO (MANDATORY вЂ” MUST BE VISIBLE): full detailed tattoo sleeve covering one entire arm from shoulder to wrist with intricate dark ink artwork. The tattooed arm MUST be clearly visible in the final image.',
    'РЁРµСЏ': 'TATTOO (MANDATORY вЂ” MUST BE VISIBLE): prominent artistic tattoo on the neck/throat area with dark ink design clearly visible against the skin. The neck tattoo MUST be unmistakably present in the final image.',
  };

  // Build detail string (supports arrays for multi-select fields like tattoo)
  const buildDetailString = (detailsOverride) => {
    const parts = [];
    const details = detailsOverride || modelDetails;
    Object.entries(details).forEach(([k, v]) => {
      // EXPLICIT NEGATIVE CONSTRAINTS вЂ” when "РќРµС‚" is selected, add hard prohibition
      if (v === 'РќРµС‚' || (Array.isArray(v) && v.length === 1 && v[0] === 'РќРµС‚')) {
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
        const filtered = v.filter(x => x !== 'РќРµС‚');
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

  // в•ђв•ђв•ђ AUTH FETCH: РґРѕР±Р°РІР»СЏРµС‚ Firebase ID Token РєРѕ РІСЃРµРј API-Р·Р°РїСЂРѕСЃР°Рј в•ђв•ђв•ђ
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

  const handleGenerate = async (skipConfirm = false) => {
    if (!garmentUrls.length) return;

    // в•ђв•ђв•ђ SUBSCRIPTION CHECK в•ђв•ђв•ђ
    if (!canGenerate(subscription)) {
      setShowPricing(true);
      setStatusText('вљЎ Р”Р»СЏ РіРµРЅРµСЂР°С†РёРё РЅСѓР¶РµРЅ Р°РєС‚РёРІРЅС‹Р№ С‚Р°СЂРёС„'); setStatusType('error');
      return;
    }
    if ((subscription.credits || 0) < totalShots) {
      setStatusText(`вљЎ РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РєСЂРµРґРёС‚РѕРІ: РЅСѓР¶РЅРѕ ${totalShots}, РґРѕСЃС‚СѓРїРЅРѕ ${subscription.credits || 0}`); setStatusType('error');
      return;
    }

    // Р›РёРјРёС‚ 20 РіРµРЅРµСЂР°С†РёР№ Р·Р° СЂР°Р·
    if (totalShots > 20) {
      setStatusText('вљ пёЏ РџСЂРµРІС‹С€РµРЅ Р»РёРјРёС‚: РјР°РєСЃРёРјСѓРј 20 РіРµРЅРµСЂР°С†РёР№ Р·Р° СЂР°Р·.'); setStatusType('error');
      return;
    }

    // Р•СЃР»Рё РєР°РґСЂРѕРІ >= 6, Р·Р°РїСЂР°С€РёРІР°РµРј РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ
    if (totalShots >= 6 && !skipConfirm) {
      triggerConfirm('batch', totalShots, () => handleGenerate(true));
      return;
    }

    const runBatchGeneration = async () => {
      setIsProcessing(true); setGeneratedImage(null); setStatusText('');
      setProcessingMsg('РџРѕРґРіРѕС‚Р°РІР»РёРІР°РµРј РёСЃС…РѕРґРЅРёРєРё...');
      
      let msgI = 0;
      const iv = setInterval(() => { 
        if (totalShots === 1) {
          setProcessingMsg(msgI < MSGS.length ? MSGS[msgI++] : 'Р¤РёРЅР°Р»СЊРЅС‹Рµ С€С‚СЂРёС…Рё...'); 
        }
      }, 8000);

      try {
        // Р¤РѕСЂРјРёСЂСѓРµРј РїР»РѕСЃРєРёР№ СЃРїРёСЃРѕРє Р·Р°РґР°С‡
        const tasks = [];

        if (appMode === 'product') {
          // РљРѕРјРїРѕР·РёС†РёРё
          const compsToUse = customPoseText.trim() ? [{ id: 'custom', prompt: customPoseText.trim(), label: 'РЎРІРѕСЏ РєРѕРјРїРѕР·РёС†РёСЏ' }] : selectedProductCompositions;
          // Р¤РѕРЅС‹
          const bgsToUse = (customProductBg.trim() || selectedLocId) 
            ? [{ id: selectedLocId || 'custom', prompt: customProductBg.trim(), isLoc: !!selectedLocId }]
            : selectedProductBgs;
          // РЎРїРµС†СЌС„С„РµРєС‚С‹
          const effectsToUse = customProductEffectText.trim()
            ? [{ id: 'custom', prompt: customProductEffectText.trim(), label: 'РЎРІРѕР№ СЌС„С„РµРєС‚' }]
            : selectedProductEffects;
          // Р¤РѕСЂРјР°С‚С‹
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
          // РњРѕРґРµР»Рё
          const modelsToUse = (customModelPrompt.trim() || selectedSavedModelId)
            ? [{ id: selectedSavedModelId || 'custom', prompt: customModelPrompt.trim(), isSaved: !!selectedSavedModelId }]
            : [...selectedModels, ...customModelChips];
          // РџРѕР·С‹
          const posesToUse = customPoseText.trim()
            ? [{ id: 'custom', prompt: customPoseText.trim(), label: 'РЎРІРѕСЏ РїРѕР·Р°' }]
            : [...selectedPoses, ...customPoseChips];
          // Р Р°РєСѓСЂСЃС‹
          const camerasToUse = selectedCameras;
          // Р¤РѕРЅС‹
          const bgsToUse = (customBgText.trim() || selectedLocId)
            ? [{ id: selectedLocId || 'custom', prompt: customBgText.trim(), isLoc: !!selectedLocId }]
            : [...selectedBgs, ...customBgChips];
          // Р¤РѕСЂРјР°С‚С‹
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

        // 1. Р‘СЂРѕРЅРёСЂСѓРµРј/СЃРїРёСЃС‹РІР°РµРј РєСЂРµРґРёС‚С‹ РїР°РєРµС‚РЅРѕ РїРµСЂРµРґ Р·Р°РїСѓСЃРєРѕРј
        setProcessingMsg('вљЎ Р‘СЂРѕРЅРёСЂСѓРµРј РєСЂРµРґРёС‚С‹...');
        const deductResp = await authFetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'deduct-credit',
            amount: totalShots
          })
        });
        const deductData = await safeParseJSON(deductResp);
        if (!deductData.success) {
          throw new Error(deductData.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРїРёСЃР°С‚СЊ РєСЂРµРґРёС‚С‹');
        }
        refreshCreditsFromResponse(deductData);

        // 2. РћС‡РµСЂРµРґСЊ РІС‹РїРѕР»РЅРµРЅРёСЏ Р·Р°РґР°С‡ СЃ РєРѕРЅРєСѓСЂРµРЅС‚РЅРѕСЃС‚СЊСЋ = 3
        let completedCount = 0;
        let failedCount = 0;
        const results = [];

        const updateProgressText = () => {
          if (totalShots > 1) {
            setProcessingMsg(`рџ“ё Р“РµРЅРµСЂР°С†РёСЏ: РіРѕС‚РѕРІРѕ ${completedCount} РёР· ${totalShots} РєР°РґСЂРѕРІ` + 
              (failedCount > 0 ? ` (РѕС€РёР±РѕРє: ${failedCount})` : '') + 
              `...\nРџРѕР¶Р°Р»СѓР№СЃС‚Р°, РЅРµ Р·Р°РєСЂС‹РІР°Р№С‚Рµ РІРєР»Р°РґРєСѓ.`);
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
                    // Prefer base64 (works when Firebase Storage quota exceeded)
                    modelRefImages = (sm.imageBase64?.length ? sm.imageBase64 : null) || sm.imageUrls || [];
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
                skipCreditDeduction: true
              };
            } else {
              // appMode === 'fashion' (VTON)
              let modelPrompt = task.model.isSaved ? task.model.prompt : (customModelPrompt.trim() || (task.model.prompt + buildDetailString(modelDetailsMap[task.model.id])));
              let modelRefImages = null;
              if (task.model.isSaved) {
                const sm = myModels.find(m => m.id === task.model.id);
                if (sm) {
                  modelPrompt = sm.prompt || modelPrompt;
                  // Prefer base64 (works when Firebase Storage quota exceeded)
                  modelRefImages = (sm.imageBase64?.length ? sm.imageBase64 : null) || sm.imageUrls || [];
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
                skipCreditDeduction: true
              };
            }

            const resp = await authFetch('/api/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            const data = await safeParseJSON(resp);
            results.push({ ...data, task });

            if (data.success) {
              completedCount++;
              const img = data.imageBase64 || data.imageUrl;
              setGeneratedImage(img);
              setImageHistory(prev => {
                const label = appMode === 'product'
                  ? `рџЋЁ ${task.comp.label || 'РљР°РґСЂ'} (${task.variantIndex})`
                  : `рџЋЁ ${task.pose.label || 'РџРѕР·Р°'} (${task.variantIndex})`;
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

        // Р—Р°РїСѓСЃРє РѕС‡РµСЂРµРґРё СЃ concurrency = 3
        let taskIndex = 0;
        const worker = async () => {
          while (taskIndex < tasks.length) {
            const currentIdx = taskIndex++;
            await runTask(currentIdx);
          }
        };

        const workers = [];
        for (let i = 0; i < Math.min(3, tasks.length); i++) {
          workers.push(worker());
        }
        await Promise.all(workers);

        clearInterval(iv);

        // в•ђв•ђв•ђ REFUND РєСЂРµРґРёС‚РѕРІ Р·Р° РЅРµСѓРґР°С‡РЅС‹Рµ РіРµРЅРµСЂР°С†РёРё в•ђв•ђв•ђ
        if (failedCount > 0) {
          try {
            const refundResp = await authFetch('/api/generate-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'refund-credit', amount: failedCount })
            });
            const refundData = await safeParseJSON(refundResp);
            if (refundData.success) {
              refreshCreditsFromResponse(refundData);
              console.log(`рџ’° Refunded ${failedCount} credit(s) for failed generations`);
            }
          } catch (refundErr) {
            console.warn('Failed to refund credits:', refundErr.message);
          }
        }

        const successItems = results.filter(r => r.success);
        if (successItems.length > 0) {
          const pluralForm = successItems.length === 1 ? '' : (successItems.length < 5 ? 'Р° вЂ” Р»РёСЃС‚Р°Р№С‚Рµ в—Ђв–¶' : ' вЂ” Р»РёСЃС‚Р°Р№С‚Рµ в—Ђв–¶');
          setStatusText(`Р“РѕС‚РѕРІРѕ! ${successItems.length} РІР°СЂРёР°РЅС‚${pluralForm}${failedCount > 0 ? ` (${failedCount} РЅРµ СѓРґР°Р»РѕСЃСЊ вЂ” РєСЂРµРґРёС‚С‹ РІРѕР·РІСЂР°С‰РµРЅС‹)` : ''}`); setStatusType('success');
        } else {
          setStatusText(`РћС€РёР±РєР°: ${results[0]?.details || results[0]?.error || 'РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°'}. РљСЂРµРґРёС‚С‹ РІРѕР·РІСЂР°С‰РµРЅС‹.`); setStatusType('error');
        }

      } catch (err) {
        setStatusText(`РћС€РёР±РєР°: ${err.message}`); setStatusType('error');
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

  // РљРѕРЅРІРµСЂС‚Р°С†РёСЏ URL в†’ base64 РЅР° РєР»РёРµРЅС‚Рµ (РѕР±С…РѕРґРёРј РїСЂРѕР±Р»РµРјС‹ Firebase Storage Rules)
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

  // Р’С‹Р±РѕСЂ Р»РѕРєР°С†РёРё СЃ РїСЂРµРґРІР°СЂРёС‚РµР»СЊРЅРѕР№ РєРѕРЅРІРµСЂС‚Р°С†РёРµР№ РєР°СЂС‚РёРЅРѕРє РІ base64
  const selectLocation = async (locId) => {
    setSelectedLocId(locId);
    if (!locId || locBase64Cache[locId]) return; // СѓР¶Рµ РµСЃС‚СЊ РІ РєРµС€Рµ
    const loc = myLocations.find(l => l.id === locId);
    if (!loc || !loc.imageUrls) return;
    const b64arr = await Promise.all(loc.imageUrls.slice(0, 5).map(urlToBase64Client));
    const valid = b64arr.filter(Boolean);
    if (valid.length > 0) {
      setLocBase64Cache(prev => ({ ...prev, [locId]: valid }));
      console.log(`рџ“Ќ Pre-fetched ${valid.length} loc images as base64 for loc ${locId}`);
    } else {
      console.warn(`вљ пёЏ Could not pre-fetch any loc images for ${locId}, will use raw URLs`);
    }
  };

  const saveLoc = async () => {
    if (!locName.trim() || locFiles.length < 2 || !user) return;
    setIsSaving(true);
    try {
      // PRIMARY: РЎРѕС…СЂР°РЅСЏРµРј inline base64 (РіР»Р°РІРЅС‹Р№ РјРµС…Р°РЅРёР·Рј вЂ” РЅРµ Р·Р°РІРёСЃРёС‚ РѕС‚ Firebase Storage)
      const imageBase64 = await Promise.all(locFiles.map(async (f) => {
        const compressed = await compressImage(f, 500); // 500px вЂ” РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РґР»СЏ AI-reference
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(compressed);
        });
      }));
      const validBase64 = imageBase64.filter(Boolean);
      if (validBase64.length === 0) throw new Error('РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±СЂР°Р±РѕС‚Р°С‚СЊ С„РѕС‚РѕРіСЂР°С„РёРё');

      // BONUS: РїСЂРѕР±СѓРµРј Р·Р°РіСЂСѓР·РёС‚СЊ РІ Firebase Storage (РЅРµ РєСЂРёС‚РёС‡РЅРѕ РµСЃР»Рё СѓРїР°РґС‘С‚)
      let imageUrls = [];
      let storagePaths = [];
      try {
        const uploads = await Promise.all(locFiles.map(async (f) => {
          const compressed = await compressImage(f, 800);
          return uploadImage(user.uid, compressed, 'locations');
        }));
        imageUrls = uploads.map(u => u.url);
        storagePaths = uploads.map(u => u.path);
      } catch (storageErr) {
        console.warn('вљ пёЏ Firebase Storage upload failed (non-critical):', storageErr.message);
        // РџСЂРѕРґРѕР»Р¶Р°РµРј вЂ” Сѓ РЅР°СЃ РµСЃС‚СЊ base64, СЌС‚РѕРіРѕ РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ
      }

      await saveLocation(user.uid, {
        title: locName.trim(),
        imageUrls,      // РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј РµСЃР»Рё Storage РЅРµРґРѕСЃС‚СѓРїРµРЅ
        storagePaths,   // РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј РµСЃР»Рё Storage РЅРµРґРѕСЃС‚СѓРїРµРЅ
        thumbnail: imageUrls[0] || null,
        imageBase64: validBase64, // Р“Р›РђР’РќР«Р™ РёСЃС‚РѕС‡РЅРёРє С„РѕС‚Рѕ
      });
      const locations = await getLocations(user.uid);
      setMyLocations(locations);
      // РЎСЂР°Р·Сѓ Р·Р°РїРѕР»РЅСЏРµРј РєРµС€ РґР»СЏ РЅРѕРІРѕР№ Р»РѕРєР°С†РёРё
      if (validBase64.length > 0) {
        const newLocId = locations.find(l => l.title === locName.trim())?.id;
        if (newLocId) setLocBase64Cache(prev => ({ ...prev, [newLocId]: validBase64 }));
      }
      setShowLocModal(false); setLocName(''); setLocFiles([]); setLocPreviews([]);
      setStatusText('рџ“Ќ Р›РѕРєР°С†РёСЏ СЃРѕС…СЂР°РЅРµРЅР°!'); setStatusType('success');
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ Р»РѕРєР°С†РёРё:', err);
      setStatusText(`вќЊ РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ Р»РѕРєР°С†РёРё: ${err.message || 'РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°'}`); setStatusType('error');
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

  // LoRA model save (Firebase) вЂ” base64-first, Storage optional
  const saveLoraModel = async (photosOverride) => {
    if (!loraName.trim() || !user) return;
    setIsSaving(true);
    try {
      const photos = photosOverride || loraPhotos;
      const photoEntries = Object.entries(photos).filter(([, v]) => v);
      if (photoEntries.length === 0) throw new Error('РќРµС‚ С„РѕС‚РѕРіСЂР°С„РёР№ РґР»СЏ СЃРѕС…СЂР°РЅРµРЅРёСЏ');

      // PRIMARY: base64 inline (РіР°СЂР°РЅС‚РёСЂРѕРІР°РЅРЅРѕ СЂР°Р±РѕС‚Р°РµС‚)
      const imageBase64 = photoEntries.map(([, base64]) => base64);

      // BONUS: Storage upload (РЅРµ Р±Р»РѕРєРёСЂСѓРµС‚ РµСЃР»Рё СѓРїР°РґС‘С‚)
      let imageUrls = [];
      let storagePaths = [];
      try {
        const uploads = await Promise.all(photoEntries.map(async ([, base64]) => {
          return uploadBase64Image(user.uid, base64, 'models');
        }));
        imageUrls = uploads.map(u => u.url);
        storagePaths = uploads.map(u => u.path);
      } catch (storageErr) {
        console.warn('вљ пёЏ Storage upload failed (non-critical):', storageErr.message);
      }

      await saveModel(user.uid, { name: loraName.trim(), type: 'lora', modelType: 'own_model', imageUrls, storagePaths, imageBase64, prompt: '' });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowLoraModal(false); setLoraName(''); setLoraPhotos({ front: null, left34: null, right34: null, fullbody: null });
      setStatusText('в­ђ РњРѕРґРµР»СЊ СЃРѕС…СЂР°РЅРµРЅР°!'); setStatusType('success');
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РјРѕРґРµР»Рё:', err);
      throw err;
    }
    finally { setIsSaving(false); }
  };

  // Save generated model (Firebase) вЂ” base64-first, Storage optional
  const saveGenModel = async () => {
    if (!saveModelName.trim() || !generatedImage || !user) return;
    setIsSaving(true);
    try {
      const mp = customModelPrompt.trim()
        || (customModelChips.length > 0 ? customModelChips[0].prompt : null)
        || (selectedModels[0].prompt + buildDetailString(modelDetailsMap[selectedModels[0]?.id]));

      // PRIMARY: base64 inline
      const imageBase64 = [generatedImage];

      // BONUS: Storage upload
      let imageUrls = [];
      let storagePaths = [];
      try {
        const { url, path } = await uploadBase64Image(user.uid, generatedImage, 'models');
        imageUrls = [url];
        storagePaths = [path];
      } catch (storageErr) {
        console.warn('вљ пёЏ Storage upload failed (non-critical):', storageErr.message);
      }

      await saveModel(user.uid, { name: saveModelName.trim(), type: 'generated', imageUrls, storagePaths, imageBase64, prompt: mp });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowSaveModelModal(false); setSaveModelName('');
      setStatusText('вњ… РњРѕРґРµР»СЊ СЃРѕС…СЂР°РЅРµРЅР°!');
      setStatusType('success');
    } catch (err) { console.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РјРѕРґРµР»Рё:', err); setStatusText('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ'); setStatusType('error'); }
    finally { setIsSaving(false); }
  };

  // Save calibrated model from wizard (3-angle photos) вЂ” base64-first
  const saveCalibratedModel = async (name, photos, prompt) => {
    if (!user) {
      throw new Error('РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ. Р’РѕР№РґРёС‚Рµ РІ Р°РєРєР°СѓРЅС‚.');
    }
    setIsSaving(true);
    try {
      const photoEntries = Object.entries(photos).filter(([, v]) => v);

      // PRIMARY: base64 inline
      const imageBase64 = photoEntries.map(([, base64]) => base64);
      const fullbodyBase64 = photos.fullbody || null;

      // BONUS: Storage upload
      let imageUrls = [];
      let storagePaths = [];
      let fullbodyUrl = null;
      try {
        const uploadResults = await Promise.all(
          photoEntries.map(async ([key, base64]) => {
            const result = await uploadBase64Image(user.uid, base64, 'models');
            return { key, ...result };
          })
        );
        imageUrls = uploadResults.map(u => u.url);
        storagePaths = uploadResults.map(u => u.path);
        const fullbodyEntry = uploadResults.find(u => u.key === 'fullbody');
        fullbodyUrl = fullbodyEntry?.url || null;
      } catch (storageErr) {
        console.warn('вљ пёЏ Storage upload failed (non-critical):', storageErr.message);
      }

      await saveModel(user.uid, {
        name,
        type: 'calibrated',
        imageUrls,
        storagePaths,
        imageBase64,
        prompt: prompt || '',
        ...(fullbodyUrl ? { fullbodyUrl } : {}),
        ...(fullbodyBase64 ? { fullbodyBase64 } : {}),
      });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowCalibWizard(false);
      setStatusText('вњ… РћС‚РєР°Р»РёР±СЂРѕРІР°РЅРЅР°СЏ РјРѕРґРµР»СЊ СЃРѕС…СЂР°РЅРµРЅР°!');
      setStatusType('success');

    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РјРѕРґРµР»Рё:', err);
      setStatusText('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РјРѕРґРµР»Рё');
      setStatusType('error');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };


  // Save persona model (from PersonaWizard comp card)
  const savePersonaModel = async ({ name, type, compCardBase64, compCardUrl, sourcePhotos }) => {
    if (!user) throw new Error('РќРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ');
    setIsSaving(true);
    try {
      const compUpload = await uploadBase64Image(user.uid, compCardBase64, 'models');
      const sourceUploads = await Promise.all(
        sourcePhotos.map(async (base64) => uploadBase64Image(user.uid, base64, 'models'))
      );
      await saveModel(user.uid, {
        name,
        type: 'persona',
        modelType: 'persona',  // в†ђ РјР°СЂРєРµСЂ РґР»СЏ VTON pipeline
        // imageUrls = С‚РѕР»СЊРєРѕ comp card (1 С„Р°Р№Р») вЂ” РёРјРµРЅРЅРѕ РѕРЅ СѓР№РґС‘С‚ РІ GPT Image 2 РєР°Рє СЂРµС„РµСЂРµРЅСЃ
        imageUrls: [compUpload.url],
        sourcePhotoUrls: sourceUploads.map(u => u.url),
        storagePaths: [compUpload.path, ...sourceUploads.map(u => u.path)],
        compCardUrl: compUpload.url,
        prompt: '',
      });
      const models = await getModels(user.uid);
      setMyModels(models);
      setStatusText('\u2705 РџРµСЂСЃРѕРЅР°Р¶ СЃРѕС…СЂР°РЅС‘РЅ!');
      setStatusType('success');
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РїРµСЂСЃРѕРЅР°Р¶Р°:', err);
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
  // CRITICAL: Do NOT include generatedImage вЂ” it may contain product objects (cups, bottles etc.)
  // Only include clean model reference photos from saved models.
  const getCurrentModelRefs = () => {
    const refs = [];
    if (appMode === 'product') {
      // Product mode: use product model's saved refs
      if (productSavedModelId) {
        const sm = myModels.find(m => m.id === productSavedModelId);
        // Prefer base64 (works even if Storage quota exceeded)
        if (sm?.imageBase64?.length) refs.push(...sm.imageBase64);
        else if (sm?.imageUrls) refs.push(...sm.imageUrls);
      }
    } else {
      // Fashion mode: use fashion model's saved refs
      if (selectedSavedModelId) {
        const sm = myModels.find(m => m.id === selectedSavedModelId);
        if (sm?.imageBase64?.length) refs.push(...sm.imageBase64);
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
      const refImgs = sm?.imageUrls || [];
      // Use loaded garments if available, otherwise send previewMode
      let garmentUrlsForPreview = garmentUrls.slice(0, 1);
      const resp = await authFetch('/api/generate-image', {
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
        setStatusText('РџСЂРµРІСЊСЋ РјРѕРґРµР»Рё РіРѕС‚РѕРІРѕ! РЎРѕС…СЂР°РЅРёС‚СЊ РєР°Рє РЅРѕРІСѓСЋ?'); setStatusType('success');
      } else { setStatusText(`РћС€РёР±РєР°: ${data.details||data.error}`); setStatusType('error'); }
    } catch (err) { setStatusText(`РћС€РёР±РєР°: ${err.message}`); setStatusType('error'); }
    finally { setIsPreviewingModel(false); }
  };

  // Save modified model as NEW вЂ” base64-first
  const saveModelAsNew = async () => {
    if (!user || !modelPreviewSrc || !modelPreviewName.trim()) return;
    setIsSaving(true);
    try {
      const sm = myModels.find(m => m.id === selectedSavedModelId);
      const newPrompt = ((sm?.prompt || '') + '. Additionally: ' + modelModifier.trim()).trim();

      // PRIMARY: base64 inline
      const imageBase64 = [modelPreviewSrc];

      // BONUS: Storage upload
      let imageUrls = [];
      let storagePaths = [];
      try {
        const { url, path } = await uploadBase64Image(user.uid, modelPreviewSrc, 'models');
        imageUrls = [url];
        storagePaths = [path];
      } catch (storageErr) {
        console.warn('вљ пёЏ Storage upload failed (non-critical):', storageErr.message);
      }

      await saveModel(user.uid, { name: modelPreviewName.trim(), type: 'generated', imageUrls, storagePaths, imageBase64, prompt: newPrompt });
      const models = await getModels(user.uid);
      setMyModels(models);
      setModelPreviewSrc(null); setModelPreviewName(''); setModelModifier(''); setShowModelModifier(false);
      setShowModelPreviewSave(false);
      setStatusText('вњ… РќРѕРІР°СЏ РјРѕРґРµР»СЊ СЃРѕС…СЂР°РЅРµРЅР°!'); setStatusType('success');
    } catch (err) { console.error(err); setStatusText('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ'); setStatusType('error'); }
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
      setStatusText('вњ… РР·РјРµРЅРµРЅРёСЏ Р»РѕРєР°С†РёРё СЃРѕС…СЂР°РЅРµРЅС‹!'); setStatusType('success');
    } catch (err) { console.error(err); setStatusText('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ'); setStatusType('error'); }
  };

  // Re-generate with shot modifier (iterative editing)
  const handleRegenerate = async () => {
    if (!shotModifier.trim() || !garmentUrls.length) return;

    // в•ђв•ђв•ђ SUBSCRIPTION CHECK в•ђв•ђв•ђ
    if (!canGenerate(subscription)) {
      setShowPricing(true);
      setStatusText('вљЎ Р”Р»СЏ РіРµРЅРµСЂР°С†РёРё РЅСѓР¶РµРЅ Р°РєС‚РёРІРЅС‹Р№ С‚Р°СЂРёС„'); setStatusType('error');
      return;
    }

    setIsProcessing(true);
    // DON'T clear generatedImage here вЂ” preserve it in case of error
    setStatusText('');
    let msgI = 0;
    const iv = setInterval(() => { setProcessingMsg(msgI < MSGS.length ? MSGS[msgI++] : 'Р¤РёРЅР°Р»СЊРЅС‹Рµ С€С‚СЂРёС…Рё...'); }, 8000);

    try {
      setProcessingMsg('РџРѕРґРіРѕС‚Р°РІР»РёРІР°РµРј РёСЃС…РѕРґРЅРёРєРё...');

      let modelPrompt = '';
      let posePrompt = '';
      let bgPrompt = '';
      let modelRefImages = null;
      let locImages = null;
      const mod = shotModifier.trim();

      if (appMode === 'product') {
        // РўРѕРІР°СЂРЅС‹Р№ СЂРµР¶РёРј
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
        
        // РџСЂРёРјРµРЅРµРЅРёРµ РїСЂР°РІРѕРє РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Рє С‚РѕРІР°СЂСѓ РёР»Рё С„РѕРЅСѓ
        const bgKeywords = /(?:С„РѕРЅ|Р·Р°РґРЅРёР№|РїР»СЏР¶|СѓР»РёС†|РіРѕСЂРѕРґ|РїР°СЂРє|Р»РµСЃ|РіРѕСЂС‹|РёРЅС‚РµСЂСЊРµСЂ|СЃС‚СѓРґРё|background|beach|street|city|park|forest|mountain|interior|studio|wood|marble|table|desk|neon|droplets|splash|petals|glow)/i;
        if (bgKeywords.test(mod)) {
          bgPrompt += `. Additionally: ${mod}`;
        } else {
          modelPrompt += `. Additionally: ${mod}`;
        }
      } else {
        // Р РµР¶РёРј РѕРґРµР¶РґС‹ (VTON)
        modelPrompt = customModelPrompt.trim()
          || (customModelChips.length > 0 ? customModelChips[0].prompt : null)
          || (selectedModels[0].prompt + buildDetailString(modelDetailsMap[selectedModels[0]?.id]));
        if (selectedSavedModelId) {
          const sm = myModels.find(m => m.id === selectedSavedModelId);
          if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = (sm.imageBase64?.length ? sm.imageBase64 : null) || sm.imageUrls || []; }
        }

        posePrompt = customPoseText.trim() || selectedPoses[0].prompt;
        const poseKeywords = /(?:РїРѕР·[Р°РµСѓС‹]|СЃРёРґ(?:РёС‚|СЏ|РµС‚СЊ)|СЃС‚РѕРёС‚|Р»РµР¶РёС‚|РёРґС‘С‚|РёРґРµС‚|С…РѕРґРёС‚|Р±РµР¶РёС‚|С‚Р°РЅС†Сѓ|РїСЂС‹РіР°|lotus|sitting|standing|lying|walking|running|dancing|crouching|leaning|kneeling|jumping|squat)/i;
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

        const bgKeywords = /(?:С„РѕРЅ|Р±Р°Р»Рё|РїР»СЏР¶|СѓР»РёС†|РіРѕСЂРѕРґ|РїР°СЂРє|Р»РµСЃ|РіРѕСЂС‹|РёРЅС‚РµСЂСЊРµСЂ|СЃС‚СѓРґРё|background|beach|street|city|park|forest|mountain|interior|studio)/i;
        if (bgKeywords.test(mod)) {
          bgPrompt += `. ${mod}`;
        }
      }

      setProcessingMsg('рџљЂ РћС‚РїСЂР°РІР»СЏРµРј РІ Nano Banano 2...');
      // в•ђв•ђв•ђ STATELESS REGENERATION в•ђв•ђв•ђ
      // NEVER send the generated photo back as reference вЂ” it creates "Visual Attention Sink"
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
        }),
      });
      clearInterval(iv);
      const data = await safeParseJSON(resp);
      if (data.success) {
        // РљСЂРµРґРёС‚С‹ СѓР¶Рµ СЃРїРёСЃР°РЅС‹ Р±СЌРєРµРЅРґРѕРј вЂ” РѕР±РЅРѕРІР»СЏРµРј Р±Р°Р»Р°РЅСЃ РёР· РѕС‚РІРµС‚Р°
        refreshCreditsFromResponse(data);

        const newImg = data.imageUrl || data.imageBase64;
        setGeneratedImage(newImg);
        const editLabel = shotModifier.trim() || 'РџРµСЂРµРіРµРЅРµСЂР°С†РёСЏ';
        setImageHistory(prev => { const h = [...prev, { image: newImg, label: editLabel }]; setHistoryIndex(h.length - 1); return h; });
        setStatusText('РљР°РґСЂ РѕР±РЅРѕРІР»С‘РЅ!');
        setStatusType('success');
      } else {
        setStatusText(`РћС€РёР±РєР°: ${data.details || data.error}`);
        setStatusType('error');
      }
    } catch (err) {
      setStatusText(`РћС€РёР±РєР°: ${err.message}`);
      setStatusType('error');
      clearInterval(iv);
    } finally {
      setIsProcessing(false);
      setShotModifier('');
    }
  };

  // в•ђв•ђв•ђ CARD DESIGN вЂ” show count modal first в•ђв•ђв•ђ
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
      setStatusText(`вљЎ Р”Р»СЏ ${count} РєР°СЂС‚РѕС‡РµРє РЅСѓР¶РЅРѕ ${totalCredits} РєСЂРµРґРёС‚РѕРІ`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < totalCredits) {
      setStatusText(`вљЎ Р”Р»СЏ ${count} РєР°СЂС‚РѕС‡РµРє РЅСѓР¶РЅРѕ ${totalCredits} РєСЂРµРґРёС‚РѕРІ`); setStatusType('error');
      return;
    }

    setIsCardGenerating(true);
    setCardResult(null);
    setStatusText(`рџЋґ РЎРѕР·РґР°С‘Рј ${count > 1 ? count + ' РєР°СЂС‚РѕС‡РµРє' : 'РєР°СЂС‚РѕС‡РєСѓ'}...`);
    setStatusType('processing');

    const progressSteps = ['рџЋґ РђРЅР°Р»РёР·РёСЂСѓРµРј С‚РѕРІР°СЂ...', 'рџЋЁ РџРѕРґР±РёСЂР°РµРј СЃС‚РёР»СЊ...', 'вњЌпёЏ Р“РµРЅРµСЂРёСЂСѓРµРј С‚РёРїРѕРіСЂР°С„РёРєСѓ...', 'рџ“ђ РљРѕРјРїРѕРЅСѓРµРј РјР°РєРµС‚...', 'вњЁ Р¤РёРЅР°Р»СЊРЅР°СЏ РїРѕР»РёСЂРѕРІРєР°...'];
    let stepIdx = 0;
    const iv = setInterval(() => {
      stepIdx = (stepIdx + 1) % progressSteps.length;
      setStatusText(progressSteps[stepIdx]);
    }, 8000);

    try {
      // Run N parallel card generation requests
      const isBase64 = generatedImage && generatedImage.startsWith('data:');
      const promises = Array.from({ length: count }, () =>
        authFetch('/api/generate-image', {
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
        }).then(r => safeParseJSON(r))
      );
      
      const results = await Promise.all(promises);
      clearInterval(iv);
      
      const successCards = results.filter(d => d.success).map(d => d.imageUrl);
      
      if (successCards.length > 0) {
        // РљСЂРµРґРёС‚С‹ СѓР¶Рµ СЃРїРёСЃР°РЅС‹ Р±СЌРєРµРЅРґРѕРј вЂ” РѕР±РЅРѕРІР»СЏРµРј Р±Р°Р»Р°РЅСЃ РёР· РѕС‚РІРµС‚Р°
        const lastCard = results.find(d => d.success && d.creditsRemaining != null);
        refreshCreditsFromResponse(lastCard || results.find(d => d.success));
        setCardResult(successCards);
        setStatusText(`рџЋґ Р“РѕС‚РѕРІРѕ! ${successCards.length} ${successCards.length === 1 ? 'РєР°СЂС‚РѕС‡РєР°' : 'РєР°СЂС‚РѕС‡РµРє'}`);
        setStatusType('success');
      } else {
        const firstError = results.find(d => !d.success);
        setStatusText(`РћС€РёР±РєР°: ${firstError?.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РєР°СЂС‚РѕС‡РєСѓ'}`);
        setStatusType('error');
      }
    } catch (err) {
      clearInterval(iv);
      setStatusText(`РћС€РёР±РєР°: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsCardGenerating(false);
    }
  };

  // в•ђв•ђв•ђ GALLERY GENERATION в•ђв•ђв•ђ
  const handleGenerateGallery = async () => {
    if (!garmentUrls.length) {
      setStatusText('РЎРЅР°С‡Р°Р»Р° Р·Р°РіСЂСѓР·РёС‚Рµ С„РѕС‚Рѕ С‚РѕРІР°СЂР°'); setStatusType('error');
      return;
    }
    const creditsNeeded = 5;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < creditsNeeded && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`вљЎ Р”Р»СЏ РіРµРЅРµСЂР°С†РёРё РіР°Р»РµСЂРµРё РЅСѓР¶РЅРѕ 5 РєСЂРµРґРёС‚РѕРІ`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < creditsNeeded) {
      setStatusText(`вљЎ Р”Р»СЏ РіРµРЅРµСЂР°С†РёРё РіР°Р»РµСЂРµРё РЅСѓР¶РЅРѕ 5 РєСЂРµРґРёС‚РѕРІ`); setStatusType('error');
      return;
    }
    
    setIsGalleryGenerating(true);
    setIsProcessing(true);
    setStatusType('processing');
    setStatusText('рџ“‹ РќР°С‡РёРЅР°РµРј СЃР±РѕСЂРєСѓ РіР°Р»РµСЂРµРё (4 СЃР»Р°Р№РґР°)...');

    // РЎРїРёСЃС‹РІР°РµРј 5 РєСЂРµРґРёС‚РѕРІ
    try {
      const deductResp = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deduct-credit',
          amount: 5,
        }),
      });
      const deductData = await safeParseJSON(deductResp);
      if (!deductData.success) {
        throw new Error(deductData.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРїРёСЃР°С‚СЊ РєСЂРµРґРёС‚С‹');
      }
      refreshCreditsFromResponse(deductData);
    } catch (deductErr) {
      setStatusText(`вљ пёЏ РћС€РёР±РєР° СЃРїРёСЃР°РЅРёСЏ РєСЂРµРґРёС‚РѕРІ: ${deductErr.message}`);
      setStatusType('error');
      setIsGalleryGenerating(false);
      setIsProcessing(false);
      return;
    }

    const gallerySlides = [
      quickCardImage || generatedImage || garmentUrls[0] // РЎР»Р°Р№Рґ 1: С‚РµРєСѓС‰Р°СЏ РѕР±Р»РѕР¶РєР°
    ];

    try {
      const isFashion = appMode === 'fashion';

      // РЎР»Р°Р№Рґ 2: РљСЂСѓРїРЅС‹Р№ РїР»Р°РЅ
      setStatusText('рџ”Ќ РЁР°Рі 1/3: Р“РµРЅРµСЂРёСЂСѓРµРј РєСЂСѓРїРЅС‹Р№ РїР»Р°РЅ РґРµС‚Р°Р»РµР№...');
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
          skipCreditDeduction: true,
        }),
      });
      const dataDetail = await safeParseJSON(respDetail);
      if (!dataDetail.success) throw new Error(dataDetail.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РєСЂСѓРїРЅС‹Р№ РїР»Р°РЅ');
      const imgDetail = dataDetail.imageBase64 || dataDetail.imageUrl;
      gallerySlides.push(imgDetail);

      // РЎР»Р°Р№Рґ 3: Р Р°Р·РјРµСЂС‹ (РРЅС„РѕРіСЂР°С„РёРєР°)
      setStatusText('рџ“ђ РЁР°Рі 2/3: Р”РѕСЃС‚СЂР°РёРІР°РµРј РёРЅС„РѕРіСЂР°С„РёРєСѓ СЃ СЂР°Р·РјРµСЂР°РјРё...');
      const infoText = isFashion
        ? (userProductInfo && userProductInfo.trim()
            ? `РРќР¤РћР РњРђР¦РРЇ Рћ РўРћР’РђР Р•:
${userProductInfo.trim()}

Р РђР—РњР•Р РќРђРЇ РЎР•РўРљРђ:
S (42-44), M (44-46), L (46-48), XL (48-50)`
            : `РўРђР‘Р›РР¦Рђ Р РђР—РњР•Р РћР’:
S (42-44)
M (44-46)
L (46-48)
XL (48-50)
РџСЂРµРјРёР°Р»СЊРЅС‹Р№ РјР°С‚РµСЂРёР°Р», РёРґРµР°Р»СЊРЅС‹Р№ РєСЂРѕР№.`)
        : (userProductInfo && userProductInfo.trim()
            ? `РРќР¤РћР РњРђР¦РРЇ Рћ РўРћР’РђР Р•:
${userProductInfo.trim()}

Р“РђР‘РђР РРўР« РўРћР’РђР Рђ:
Р’С‹СЃРѕС‚Р°, С€РёСЂРёРЅР°, РіР»СѓР±РёРЅР°, СЌСЂРіРѕРЅРѕРјРёС‡РЅС‹Р№ РїСЂРµРјРёСѓРј РґРёР·Р°Р№РЅ.`
            : `Р“РђР‘РђР РРўР« Р РҐРђР РђРљРўР•Р РРЎРўРРљР:
РћРїС‚РёРјР°Р»СЊРЅС‹Р№ СЂР°Р·РјРµСЂ
Р’С‹СЃРѕС‚Р°: 30 СЃРј
РЁРёСЂРёРЅР°: 28 СЃРј
Р“Р»СѓР±РёРЅР°: 10 СЃРј
РџСЂРµРјРёР°Р»СЊРЅС‹Рµ РјР°С‚РµСЂРёР°Р»С‹, РјР°РєСЃРёРјР°Р»СЊРЅРѕРµ СѓРґРѕР±СЃС‚РІРѕ.`);
      
      const respSize = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          isQuickCard: true,
          quickCardStyle: 'natural',
          userProductInfo: infoText,
          garmentImageUrls: garmentUrls,
          skipCreditDeduction: true,
        }),
      });
      const dataSize = await safeParseJSON(respSize);
      if (!dataSize.success) throw new Error(dataSize.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РёРЅС„РѕРіСЂР°С„РёРєСѓ СЂР°Р·РјРµСЂРѕРІ');
      const imgSize = dataSize.imageBase64 || dataSize.imageUrl;
      gallerySlides.push(imgSize);

      // РЎР»Р°Р№Рґ 4: Lifestyle
      setStatusText(isFashion ? 'рџЊі РЁР°Рі 3/3: Р“РµРЅРµСЂРёСЂСѓРµРј С„РѕС‚Рѕ РјРѕРґРµР»Рё РЅР° СѓР»РёС†Рµ (Lifestyle)...' : 'рџЏ  РЁР°Рі 3/3: Р“РµРЅРµСЂРёСЂСѓРµРј С„РѕС‚Рѕ РІ РёРЅС‚РµСЂСЊРµСЂРµ (Lifestyle)...');
      
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
          skipCreditDeduction: true,
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
          skipCreditDeduction: true,
        };
      }

      const respLife = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slide4Payload),
      });
      const dataLife = await safeParseJSON(respLife);
      if (!dataLife.success) throw new Error(dataLife.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ lifestyle С„РѕС‚Рѕ');
      const imgLife = dataLife.imageBase64 || dataLife.imageUrl;
      gallerySlides.push(imgLife);

      setQuickResults(prev => ({ ...prev, gallery: gallerySlides }));
      setStatusText('вњ… Р“Р°Р»РµСЂРµСЏ РёР· 4-С… СЃР»Р°Р№РґРѕРІ СѓСЃРїРµС€РЅРѕ СЃРѕР±СЂР°РЅР°!');
      setStatusType('success');
    } catch (err) {
      console.error('Gallery generation error:', err);
      setStatusText(`вљ пёЏ РћС€РёР±РєР° РїСЂРё РіРµРЅРµСЂР°С†РёРё РіР°Р»РµСЂРµРё: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsGalleryGenerating(false);
      setIsProcessing(false);
    }
  };

  // в•ђв•ђв•ђ A/B TEST GENERATION в•ђв•ђв•ђ
  const handleGenerateABTest = async () => {
    if (!garmentUrls.length) {
      setStatusText('РЎРЅР°С‡Р°Р»Р° Р·Р°РіСЂСѓР·РёС‚Рµ С„РѕС‚Рѕ С‚РѕРІР°СЂР°'); setStatusType('error');
      return;
    }
    const creditsNeeded = 2;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < creditsNeeded && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`вљЎ Р”Р»СЏ Р·Р°РїСѓСЃРєР° A/B С‚РµСЃС‚Р° РЅСѓР¶РЅРѕ 2 РєСЂРµРґРёС‚Р°`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < creditsNeeded) {
      setStatusText(`вљЎ Р”Р»СЏ Р·Р°РїСѓСЃРєР° A/B С‚РµСЃС‚Р° РЅСѓР¶РЅРѕ 2 РєСЂРµРґРёС‚Р°`); setStatusType('error');
      return;
    }

    setIsAbGenerating(true);
    setIsProcessing(true);
    setStatusType('processing');
    setStatusText('вљ–пёЏ Р—Р°РїСѓСЃРєР°РµРј A/B РўРµСЃС‚РёСЂРѕРІР°РЅРёРµ (2 РѕР±Р»РѕР¶РєРё)...');

    // РЎРїРёСЃС‹РІР°РµРј 2 РєСЂРµРґРёС‚Р°
    try {
      const deductResp = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deduct-credit',
          amount: 2,
        }),
      });
      const deductData = await safeParseJSON(deductResp);
      if (!deductData.success) {
        throw new Error(deductData.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРїРёСЃР°С‚СЊ РєСЂРµРґРёС‚С‹');
      }
      refreshCreditsFromResponse(deductData);
    } catch (deductErr) {
      setStatusText(`вљ пёЏ РћС€РёР±РєР° СЃРїРёСЃР°РЅРёСЏ РєСЂРµРґРёС‚РѕРІ: ${deductErr.message}`);
      setStatusType('error');
      setIsAbGenerating(false);
      setIsProcessing(false);
      return;
    }

    try {
      // Р’Р°СЂРёР°РЅС‚ A (Natural)
      setStatusText('вљ–пёЏ РЁР°Рі 1/2: Р“РµРЅРµСЂРёСЂСѓРµРј СЃРІРµС‚Р»С‹Р№ РІР°СЂРёР°РЅС‚ (Natural)...');
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
          skipCreditDeduction: true, // РџСЂРѕРїСѓСЃРєР°РµРј СЃРїРёСЃР°РЅРёРµ РєСЂРµРґРёС‚РѕРІ РЅР° Р±СЌРєРµРЅРґРµ
        }),
      });
      const dataA = await safeParseJSON(respA);
      if (!dataA.success) throw new Error(dataA.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РІР°СЂРёР°РЅС‚ Рђ');
      const imgA = dataA.imageBase64 || dataA.imageUrl;

      // Р’Р°СЂРёР°РЅС‚ B (Epic)
      setStatusText('вљ–пёЏ РЁР°Рі 2/2: Р“РµРЅРµСЂРёСЂСѓРµРј С‚С‘РјРЅС‹Р№ РІР°СЂРёР°РЅС‚ (Epic)...');
      const seedB = Math.floor(Math.random() * 1000000) + 7; // Р”СЂСѓРіРѕР№ СЃРёРґ РґР»СЏ СѓРЅРёРєР°Р»СЊРЅРѕСЃС‚Рё
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
          skipCreditDeduction: true, // РџСЂРѕРїСѓСЃРєР°РµРј СЃРїРёСЃР°РЅРёРµ РєСЂРµРґРёС‚РѕРІ РЅР° Р±СЌРєРµРЅРґРµ
        }),
      });
      const dataB = await safeParseJSON(respB);
      if (!dataB.success) throw new Error(dataB.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РІР°СЂРёР°РЅС‚ B');
      const imgB = dataB.imageBase64 || dataB.imageUrl;

      setQuickResults(prev => ({ ...prev, abTest: [imgA, imgB] }));
      setStatusText('вњ… РђР»СЊС‚РµСЂРЅР°С‚РёРІРЅС‹Рµ РѕР±Р»РѕР¶РєРё РґР»СЏ A/B РўРµСЃС‚Р° РіРѕС‚РѕРІС‹!');
      setStatusType('success');
    } catch (err) {
      console.error('A/B test generation error:', err);
      setStatusText(`вљ пёЏ РћС€РёР±РєР° РїСЂРё A/B С‚РµСЃС‚РёСЂРѕРІР°РЅРёРё: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsAbGenerating(false);
      setIsProcessing(false);
    }
  };

  const triggerConfirm = (type, cost, onConfirm) => {
    setConfirmModal({ type, cost, onConfirm });
  };

  // в•ђв•ђв•ђ QUICK MODE V2 вЂ” GPT Image 2 card generation в•ђв•ђв•ђ
  const handleQuickGenerate = async () => {
    if (!garmentUrls.length) {
      setStatusText('РЎРЅР°С‡Р°Р»Р° Р·Р°РіСЂСѓР·РёС‚Рµ С„РѕС‚Рѕ С‚РѕРІР°СЂР°'); setStatusType('error');
      return;
    }
    const isCardMode = quickMode === 'card';
    const isUgcMode = quickMode === 'ugc';
    const isModelMode = quickMode === 'model';
    const creditsNeeded = isCardMode ? 2 : 1;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < creditsNeeded && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`вљЎ Р”Р»СЏ РіРµРЅРµСЂР°С†РёРё РЅСѓР¶РЅРѕ ${creditsNeeded} РєСЂРµРґРёС‚${creditsNeeded > 1 ? 'Р°' : ''}`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < creditsNeeded) {
      setStatusText(`вљЎ Р”Р»СЏ РіРµРЅРµСЂР°С†РёРё РЅСѓР¶РЅРѕ ${creditsNeeded} РєСЂРµРґРёС‚${creditsNeeded > 1 ? 'Р°' : ''}`); setStatusType('error');
      return;
    }

    // Save current result to cache before clearing
    if (quickCardImage) {
      setQuickResults(prev => ({...prev, [quickMode]: { image: quickCardImage, editHistory: cardEditHistory }}));
    } else if (generatedImage) {
      setQuickResults(prev => ({...prev, [quickMode]: { image: generatedImage }}));
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsProcessing(true);
    setGeneratedImage(null);
    setCardResult(null);
    setQuickCardImage(null);
    setCardEditHistory([]);
    setCardEditText('');
    setStatusText(isCardMode ? 'рџ“‹ РЎРѕР·РґР°С‘Рј РєР°СЂС‚РѕС‡РєСѓ РјР°СЂРєРµС‚РїР»РµР№СЃР°...' : isUgcMode ? 'рџ“± РЎРѕР·РґР°С‘Рј С„РѕС‚Рѕ РѕС‚ РїРѕРєСѓРїР°С‚РµР»СЏ...' : isModelMode ? 'рџ‘¤ РЎРѕР·РґР°С‘Рј РєР°СЂС‚РѕС‡РєСѓ СЃ РјРѕРґРµР»СЊСЋ...' : 'рџЋЁ Р“РµРЅРµСЂРёСЂСѓРµРј СЃС‚СѓРґРёР№РЅС‹Р№ РєР°РґСЂ...');
    setStatusType('processing');

    const statusMessages = isCardMode
      ? ['рџ“‹ РђРЅР°Р»РёР·РёСЂСѓРµРј С‚РѕРІР°СЂ...', 'рџЋЁ РџРѕРґР±РёСЂР°РµРј РґРёР·Р°Р№РЅ Рё С‚РµРєСЃС‚С‹...', 'рџ“ђ РљРѕРјРїРѕРЅСѓРµРј РєР°СЂС‚РѕС‡РєСѓ...', 'вњЁ Р¤РёРЅР°Р»СЊРЅР°СЏ РїРѕР»РёСЂРѕРІРєР°...']
      : isModelMode
      ? ['рџ‘¤ РђРЅР°Р»РёР·РёСЂСѓРµРј С‚РѕРІР°СЂ...', 'рџ‘— РџРѕРґР±РёСЂР°РµРј РјРѕРґРµР»СЊ...', 'рџЋЁ РљРѕРјРїРѕРЅСѓРµРј РєР°СЂС‚РѕС‡РєСѓ...', 'вњЁ Р¤РёРЅР°Р»СЊРЅР°СЏ РїРѕР»РёСЂРѕРІРєР°...']
      : isUgcMode
      ? ['рџ“± Р Р°СЃРїРѕР·РЅР°С‘Рј С‚РѕРІР°СЂ...', 'рџЏ  РџРѕРґР±РёСЂР°РµРј РґРѕРјР°С€РЅСЋСЋ СЃС†РµРЅСѓ...', 'рџ“· РРјРёС‚РёСЂСѓРµРј СЃРЅРёРјРѕРє РЅР° СЃРјР°СЂС‚С„РѕРЅ...', 'вњЁ Р”РѕР±Р°РІР»СЏРµРј СЂРµР°Р»РёР·Рј...']
      : ['рџ“ё Р’С‹СЃС‚Р°РІР»СЏРµРј СЃРІРµС‚...', 'рџЋЁ Р РµРЅРґРµСЂРёРј РєР°РґСЂ...', 'вњЁ Р¤РёРЅР°Р»СЊРЅР°СЏ РїРѕР»РёСЂРѕРІРєР°...'];
    let msgIdx = 0;
    const statusIv = setInterval(() => {
      msgIdx = (msgIdx + 1) % statusMessages.length;
      setStatusText(statusMessages[msgIdx]);
    }, 6000);

    try {
      if (isModelMode) {
        // в•ђв•ђв•ђ MODEL MODE: РєР°СЂС‚РѕС‡РєР° СЃ РјРѕРґРµР»СЊСЋ С‡РµСЂРµР· GPT Image 2 в•ђв•ђв•ђ
        const resp = await authFetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            userId: user.uid,
            isModelCard: true,
            isPhotoOnly: true,
            garmentImageUrls: garmentUrls,
          }),
        });
        clearInterval(statusIv);
        const data = await safeParseJSON(resp);

        if (data.success && (data.imageBase64 || data.imageUrl)) {
          const img = data.imageBase64 || data.imageUrl;
          refreshCreditsFromResponse(data);
          setQuickCardImage(img);
          setGeneratedImage(img);
          setCardEditHistory([{ image: img, editText: 'РћСЂРёРіРёРЅР°Р»' }]);
          setQuickResults(prev => ({...prev, model: { image: img, editHistory: [{ image: img, editText: 'РћСЂРёРіРёРЅР°Р»' }] }}));
          setStatusText('вњ… РљР°СЂС‚РѕС‡РєР° СЃ РјРѕРґРµР»СЊСЋ РіРѕС‚РѕРІР°!');
          setStatusType('success');
        } else {
          setStatusText(`вљ пёЏ ${data.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ С„РѕС‚Рѕ СЃ РјРѕРґРµР»СЊСЋ'}`);
          setStatusType('error');
        }
      } else if (isUgcMode) {
        // в•ђв•ђв•ђ UGC MODE: СЂРµР°Р»РёСЃС‚РёС‡РЅРѕРµ С„РѕС‚Рѕ В«РѕС‚ РїРѕРєСѓРїР°С‚РµР»СЏВ» С‡РµСЂРµР· GPT Image 2 в•ђв•ђв•ђ
        const resp = await authFetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            userId: user.uid,
            isUgcMode: true,
            garmentImageUrls: garmentUrls,
          }),
        });
        clearInterval(statusIv);
        const data = await safeParseJSON(resp);

        if (data.success && (data.imageBase64 || data.imageUrl)) {
          const img = data.imageBase64 || data.imageUrl;
          refreshCreditsFromResponse(data);
          setGeneratedImage(img);
          setQuickResults(prev => ({...prev, ugc: { image: img }}));
          setStatusText('вњ… Р¤РѕС‚Рѕ В«РѕС‚ РїРѕРєСѓРїР°С‚РµР»СЏВ» РіРѕС‚РѕРІРѕ!');
          setStatusType('success');
        } else {
          setStatusText(`вљ пёЏ ${data.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ UGC-С„РѕС‚Рѕ'}`);
          setStatusType('error');
        }
      } else if (isCardMode) {
        // в•ђв•ђв•ђ CARD MODE: РїРѕР»РЅРѕС†РµРЅРЅР°СЏ РєР°СЂС‚РѕС‡РєР° РјР°СЂРєРµС‚РїР»РµР№СЃР° С‡РµСЂРµР· GPT Image 2 в•ђв•ђв•ђ
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
          }),
        });
        clearInterval(statusIv);
        const data = await safeParseJSON(resp);

        if (data.success && (data.imageBase64 || data.imageUrl)) {
          const img = data.imageBase64 || data.imageUrl;
          refreshCreditsFromResponse(data);
          setQuickCardImage(img);
          setGeneratedImage(img);
          setCardEditHistory([{ image: img, editText: 'РћСЂРёРіРёРЅР°Р»' }]);
          setQuickResults(prev => ({...prev, card: { image: img, editHistory: [{ image: img, editText: 'РћСЂРёРіРёРЅР°Р»' }] }}));
          setStatusText('вњ… РљР°СЂС‚РѕС‡РєР° РіРѕС‚РѕРІР°! Р’С‹ РјРѕР¶РµС‚Рµ РѕС‚СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚.');
          setStatusType('success');
        } else {
          setStatusText(`вљ пёЏ ${data.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РєР°СЂС‚РѕС‡РєСѓ'}`);
          setStatusType('error');
        }
      } else {
        // в•ђв•ђв•ђ PHOTO MODE: РєСЂР°СЃРёРІС‹Р№ СЃС‚СѓРґРёР№РЅС‹Р№ РєР°РґСЂ (Product Mode pipeline) в•ђв•ђв•ђ
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
          }),
        });
        clearInterval(statusIv);
        const data = await safeParseJSON(resp);

        if (data.success && (data.imageBase64 || data.imageUrl)) {
          const img = data.imageBase64 || data.imageUrl;
          refreshCreditsFromResponse(data);
          setGeneratedImage(img);
          setQuickResults(prev => ({...prev, photo: { image: img }}));
          setStatusText('вњ… РЎС‚СѓРґРёР№РЅРѕРµ С„РѕС‚Рѕ РіРѕС‚РѕРІРѕ!');
          setStatusType('success');
        } else {
          setStatusText(`вљ пёЏ ${data.error || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ С„РѕС‚Рѕ'}`);
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
        setStatusText('в›” Р“РµРЅРµСЂР°С†РёСЏ РѕС‚РјРµРЅРµРЅР°');
        setStatusType('error');
      } else {
        setStatusText(`вљ пёЏ РћС€РёР±РєР°: ${err.message}`);
        setStatusType('error');
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // в•ђв•ђв•ђ CARD EDIT вЂ” С‚РµРєСЃС‚РѕРІРѕРµ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РєР°СЂС‚РѕС‡РєРё С‡РµСЂРµР· GPT Image 2 в•ђв•ђв•ђ
  const handleCardEdit = async () => {
    if (!cardEditText.trim() || !quickCardImage) return;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < 1 && !subscription?.local) {
      setShowPricing(true);
      setStatusText('вљЎ Р”Р»СЏ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ РЅСѓР¶РµРЅ 1 РєСЂРµРґРёС‚'); setStatusType('error');
      return;
    }

    setIsCardEditing(true);
    setStatusText('вњЏпёЏ РџСЂРёРјРµРЅСЏРµРј РёР·РјРµРЅРµРЅРёСЏ...'); setStatusType('processing');

    try {
      const resp = await authFetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit-card',
          sourceImageBase64: quickCardImage,
          editInstruction: cardEditText.trim(),
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
        setStatusText('вњ… РР·РјРµРЅРµРЅРёСЏ РїСЂРёРјРµРЅРµРЅС‹!'); setStatusType('success');
      } else {
        setStatusText(`вљ пёЏ ${data.error || 'РћС€РёР±РєР° СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ'}`); setStatusType('error');
      }
    } catch (err) {
      setStatusText(`вљ пёЏ РћС€РёР±РєР°: ${err.message}`); setStatusType('error');
    } finally {
      setIsCardEditing(false);
    }
  };


  // Auto-Catalog integration
  const handleAutoCatalog = async () => {
    if (!garmentUrls.length) {
      setStatusText('РЎРЅР°С‡Р°Р»Р° Р·Р°РіСЂСѓР·РёС‚Рµ С„РѕС‚Рѕ РѕРґРµР¶РґС‹'); setStatusType('error');
      return;
    }
    
    // в•ђв•ђв•ђ SUBSCRIPTION CHECK (requires 3 credits) в•ђв•ђв•ђ
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < 3 && !subscription?.local) {
      setShowPricing(true);
      setStatusText('вљЎ Р”Р»СЏ Р°РІС‚РѕРєР°С‚Р°Р»РѕРіР° С‚СЂРµР±СѓРµС‚СЃСЏ РјРёРЅРёРјСѓРј 3 РєСЂРµРґРёС‚Р°'); setStatusType('error');
      return;
    }
    if (subscription?.local && (subscription.credits || 0) < 3) {
      setStatusText('вљЎ Р”Р»СЏ Р°РІС‚РѕРєР°С‚Р°Р»РѕРіР° С‚СЂРµР±СѓРµС‚СЃСЏ РјРёРЅРёРјСѓРј 3 РєСЂРµРґРёС‚Р°'); setStatusType('error');
      return;
    }

    setStatusText('РћС‚РїСЂР°РІРєР° Р±Р°С‚С‡Р° РІ Auto-Catalog...'); setStatusType('');
    
    // Transform uploaded garment URLs into SKU items
    const items = garmentUrls.map((url, i) => ({
      skuId: `SKU-${Date.now()}-${i}`,
      name: `РўРѕРІР°СЂ ${i + 1}`,
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
        // РЎРїРёСЃР°РЅРёРµ 3 РєСЂРµРґРёС‚РѕРІ (Р»РѕРєР°Р»СЊРЅС‹Р№ СЃРµСЂРІРµСЂ вЂ” РёСЃРїРѕР»СЊР·СѓРµРј РѕРїС‚РёРјРёСЃС‚РёС‡РЅРѕРµ СЃРїРёСЃР°РЅРёРµ)
        setSubscription(prev => ({ ...prev, credits: Math.max(0, (prev.credits || 0) - 3) }));

        setStatusText(`вњ… Auto-Catalog Р·Р°РїСѓС‰РµРЅ! Р‘Р°С‚С‡ РѕС‚РїСЂР°РІР»РµРЅ РЅР° С„РѕРЅРѕРІСѓСЋ РѕР±СЂР°Р±РѕС‚РєСѓ.`);
        setStatusType('success');
      } else {
        setStatusText(`вќЊ РћС€РёР±РєР°: ${data.error}`);
        setStatusType('error');
      }
    } catch (err) {
      setStatusText(`вќЊ РћС€РёР±РєР° СЃРµС‚Рё: ${err.message}. РЈР±РµРґРёС‚РµСЃСЊ С‡С‚Рѕ СЃРµСЂРІРµСЂ РЅР° РїРѕСЂС‚Сѓ 3002 Р·Р°РїСѓС‰РµРЅ.`);
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
    setStatusText(`рџ“ё Р“РµРЅРµСЂРёСЂСѓРµРј РµС‰С‘ ${count} РєР°РґСЂРѕРІ...`); setStatusType('');
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
        // РњРѕРґРµР»СЊ-С‡РµР»РѕРІРµРє РІ С„РѕС‚РѕСЃРµСЃСЃРёРё С‚РѕРІР°СЂРѕРІ
        if (productWithModel) {
          let humanPrompt = customProductModelPrompt.trim() || (productModelPreset.prompt + buildDetailString(productModelDetails));
          if (productSavedModelId) {
            const sm = myModels.find(m => m.id === productSavedModelId);
            if (sm) {
              humanPrompt = sm.prompt || humanPrompt;
              modelRefImages = (sm.imageBase64?.length ? sm.imageBase64 : null) || sm.imageUrls || [];
            }
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
          if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = (sm.imageBase64?.length ? sm.imageBase64 : null) || sm.imageUrls || []; }
        }
        bgPrompt = customBgText.trim() || selectedBgs[0].prompt;
        if (selectedLocId) {
          const loc = myLocations.find(l => l.id === selectedLocId);
          if (loc) { locImages = locBase64Cache[loc.id] || loc.imageBase64 || loc.imageUrls; bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos'; }
        }
      }

      // SEQUENTIAL generation вЂ” one at a time, each gets full 55s before timeout
      // This avoids rate-limiting and ensures each frame gets the full Vercel 60s window
      let successCount = 0;
      for (let idx = 0; idx < angles.length; idx++) {
        const angle = angles[idx];
        const slotIdx = existingCount + idx;
        setStatusText(`рџ“ё РљР°РґСЂ ${idx + 1}/${count}...`); setStatusType('');
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s client-side timeout
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
            }),
          });
          clearTimeout(timeoutId);
          const data = await safeParseJSON(resp);
          if (data.success) {
            const imgData = data.imageUrl || data.imageBase64;
            setPhotoshootImages(prev => { const n = [...prev]; n[slotIdx] = imgData; return n; });
            setPhotoHistory(prev => ({ ...prev, [slotIdx]: [imgData] }));
            setPhotoViewIdx(prev => ({ ...prev, [slotIdx]: 0 }));
            successCount++;
          } else {
            console.warn(`РљР°РґСЂ ${idx + 1}: ${data.details || data.error}`);
            // Remove the null placeholder for failed frame
            setPhotoshootImages(prev => { const n = [...prev]; n[slotIdx] = null; return n; });
          }
        } catch (frameErr) {
          if (frameErr.name === 'AbortError') {
            console.warn(`РљР°РґСЂ ${idx + 1}: С‚Р°Р№РјР°СѓС‚ 55 СЃРµРє`);
          } else {
            console.warn(`РљР°РґСЂ ${idx + 1} РѕС€РёР±РєР°:`, frameErr.message);
          }
          // Remove null placeholder
          setPhotoshootImages(prev => { const n = [...prev]; n[slotIdx] = null; return n; });
        }
      }
      // Clean up nulls from failed frames
      setPhotoshootImages(prev => prev.filter(Boolean));
      setStatusText(successCount > 0 ? `рџЋ‰ Р¤РѕС‚РѕСЃРµСЃСЃРёСЏ: ${successCount} РєР°РґСЂРѕРІ РіРѕС‚РѕРІРѕ!` : 'вќЊ РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РЅРё РѕРґРЅРѕРіРѕ РєР°РґСЂР°. РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°.');
      setStatusType(successCount > 0 ? 'success' : 'error');
    } catch (err) { setStatusText(`РћС€РёР±РєР° С„РѕС‚РѕСЃРµСЃСЃРёРё: ${err.message}`); setStatusType('error'); }
    finally { setIsPhotoshooting(false); }
  };

  // в•ђв•ђв•ђ PER-PHOTO EDITOR в•ђв•ђв•ђ
  // Takes a specific photo from the photoshoot gallery, sends it with an edit instruction,
  // and replaces the original photo with the result.
  const handlePhotoEdit = async () => {
    if (editingPhotoIdx === null || !photoEditText.trim()) return;
    const idx = editingPhotoIdx;
    const instruction = photoEditText.trim();
    const currentVersions = photoHistory[idx] || [photoshootImages[idx]];
    const currentImg = currentVersions[currentVersions.length - 1];
    if (!currentImg) return;

    // Close modal immediately вЂ” editing runs in background
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
        setStatusText(`РћС€РёР±РєР° СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ РєР°РґСЂР° ${idx + 1}: ${data.details || data.error}`); setStatusType('error');
      }
    } catch (err) {
      setStatusText(`РћС€РёР±РєР°: ${err.message}`); setStatusType('error');
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
    setStatusText('вњ… РќР°СЃС‚СЂРѕР№РєРё РіРµРЅРµСЂР°С†РёРё СѓСЃРїРµС€РЅРѕ Р·Р°РіСЂСѓР¶РµРЅС‹!');
    setStatusType('success');
  };

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <motion.h1 className="app-logo" initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} transition={{duration:0.6}}>РЎРµР»Р»РµСЂ-РЎС‚СѓРґРёСЏ</motion.h1>
        <p className="app-subtitle">РР-С„РѕС‚РѕСЃС‚СѓРґРёСЏ РґР»СЏ РјР°СЂРєРµС‚РїР»РµР№СЃРѕРІ Ozon, WB Рё РґСЂСѓРіРёС…</p>
        
        {/* РџСЂРµРјРёР°Р»СЊРЅС‹Р№ РїРµСЂРµРєР»СЋС‡Р°С‚РµР»СЊ СЂРµР¶РёРјРѕРІ */}
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
              рџ‘• РћРґРµР¶РґР°
            </button>
            <button
              className={`mode-btn ${appMode === 'product' ? 'active' : ''}`}
              onClick={() => { setAppMode('product'); setQuickCardImage(null); setCardEditHistory([]); }}
            >
              рџ“¦ РџСЂРµРґРјРµС‚РєР°
            </button>
            <button
              className={`mode-btn ${appMode === 'quick' ? 'active' : ''}`}
              onClick={() => { setAppMode('quick'); setGeneratedImage(null); }}
            >
              вљЎ Р’ РґРІР° РєР»РёРєР°
            </button>
          </div>
        </div>

        <div style={{marginTop:16,display:'flex',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap'}}>
          <SubscriptionBadge subscription={subscription} onClick={() => setShowPricing(true)} />
          <button className="my-history-btn" onClick={() => setShowHistory(true)} title="РњРѕРё СЂР°Р±РѕС‚С‹">
            рџ–јпёЏ РњРѕРё СЂР°Р±РѕС‚С‹
          </button>
          <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{user.displayName || user.email}</span>
          {!isEmbedded && <button onClick={signOut} style={{fontSize:'0.7rem',color:'var(--text-muted)',background:'none',border:'1px solid var(--border-subtle)',borderRadius:'9999px',padding:'4px 14px',cursor:'pointer',fontFamily:'var(--font-body)',letterSpacing:'1px',textTransform:'uppercase'}}>Р’С‹Р№С‚Рё</button>}
        </div>
      </header>

      {/* в•ђв•ђв•ђ PRICING MODAL в•ђв•ђв•ђ */}
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

      {/* в•ђв•ђв•ђ CONFIRM MODAL в•ђв•ђв•ђ */}
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
              {confirmModal.type === 'gallery' ? 'рџ“ё РЎРѕР±СЂР°С‚СЊ РіР°Р»РµСЂРµСЋ?' : 
               confirmModal.type === 'ab' ? 'вљ–пёЏ Р—Р°РїСѓСЃС‚РёС‚СЊ A/B РўРµСЃС‚?' : 
               confirmModal.type === 'video' ? 'рџЋ¬ РћР¶РёРІРёС‚СЊ РІ Р’РёРґРµРѕРѕР±Р»РѕР¶РєСѓ?' : 
               confirmModal.type === 'batch' ? 'рџ“ё Р—Р°РїСѓСЃС‚РёС‚СЊ СЃРµСЂРёСЋ РіРµРЅРµСЂР°С†РёР№?' :
               'рџ“± РЎРѕР·РґР°С‚СЊ С„РѕС‚Рѕ РѕС‚ РїРѕРєСѓРїР°С‚РµР»РµР№?'}
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px 0', textAlign: 'center', lineHeight: 1.5 }}>
              {confirmModal.type === 'gallery' ? 'РР СЃРіРµРЅРµСЂРёСЂСѓРµС‚ 3 РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹С… СЃР»Р°Р№РґР° РІРѕСЂРѕРЅРєРё (РєСЂСѓРїРЅС‹Р№ РїР»Р°РЅ РґРµС‚Р°Р»РµР№, СЂР°Р·РјРµСЂС‹ Рё lifestyle-РєР°РґСЂ) РЅР° РѕСЃРЅРѕРІРµ РІС‹Р±СЂР°РЅРЅРѕРіРѕ РєР°РґСЂР°.' : 
               confirmModal.type === 'ab' ? 'РР СЃРѕР·РґР°СЃС‚ 2 Р°Р»СЊС‚РµСЂРЅР°С‚РёРІРЅС‹С… РІР°СЂРёР°РЅС‚Р° РѕР±Р»РѕР¶РєРё (СЃРІРµС‚Р»С‹Р№ Рё С‚РµРјРЅС‹Р№ СЃС‚РёР»Рё) РґР»СЏ С‚РµСЃС‚РёСЂРѕРІР°РЅРёСЏ CTR.' : 
               confirmModal.type === 'video' ? 'РР СЃРѕР·РґР°СЃС‚ 3D-Р°РЅРёРјР°С†РёСЋ Рё motion-СЌС„С„РµРєС‚С‹ РґР»СЏ РІРёРґРµРѕРѕР±Р»РѕР¶РєРё.' : 
               confirmModal.type === 'batch' ? `РР СЃРіРµРЅРµСЂРёСЂСѓРµС‚ СЃРµСЂРёСЋ РёР· ${confirmModal.cost} РєР°РґСЂРѕРІ РЅР° РѕСЃРЅРѕРІРµ РІР°С€РёС… РЅР°СЃС‚СЂРѕРµРє РјСѓР»СЊС‚РёРІС‹Р±РѕСЂР°. РљР°РґСЂС‹ Р±СѓРґСѓС‚ СЃРѕР·РґР°РІР°С‚СЊСЃСЏ РїР°СЂР°Р»Р»РµР»СЊРЅРѕ.` :
               'РР РїРµСЂРµРЅРµСЃРµС‚ С‚РѕРІР°СЂ СЃ РІС‹Р±СЂР°РЅРЅРѕРіРѕ РєР°РґСЂР° РІ РґРѕРјР°С€РЅСЋСЋ СЂРµР°Р»РёСЃС‚РёС‡РЅСѓСЋ РѕР±СЃС‚Р°РЅРѕРІРєСѓ.'}
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
                  alt="РСЃС…РѕРґРЅС‹Р№ РєР°РґСЂ" 
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
                РСЃС…РѕРґРЅС‹Р№ РєР°РґСЂ
              </div>
            </div>
            )}

            <div style={{ margin: '15px 0 25px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>РЎС‚РѕРёРјРѕСЃС‚СЊ РіРµРЅРµСЂР°С†РёРё</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#ffd700', marginTop: 4 }}>
                {confirmModal.cost} РєСЂ.
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
                РћС‚РјРµРЅР°
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
                Р”Р°, СЃРѕР·РґР°С‚СЊ
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* в•ђв•ђв•ђ РњРћР Р РђР‘РћРўР« в•ђв•ђв•ђ */}
      {showHistory && <MyHistoryPage onClose={() => setShowHistory(false)} onReuseSettings={handleReuseSettings} />}

      {/* в•ђв•ђв•ђ QUICK MODE PANEL в•ђв•ђв•ђ */}
      {appMode === 'quick' && !generatedImage && (
        <motion.div className="section quick-mode-panel" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.1,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
            <span><span className="icon">вљЎ</span> Р’ РґРІР° РєР»РёРєР°</span>
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
                рџ‘ЃпёЏ РџРѕРєР°Р·Р°С‚СЊ СЃРѕР·РґР°РЅРЅРѕРµ
              </button>
            )}
          </div>
          <p className="quick-mode-subtitle">Р—Р°РіСЂСѓР·РёС‚Рµ С„РѕС‚Рѕ С‚РѕРІР°СЂР° вЂ” РїРѕР»СѓС‡РёС‚Рµ РіРѕС‚РѕРІСѓСЋ РєР°СЂС‚РѕС‡РєСѓ РґР»СЏ РјР°СЂРєРµС‚РїР»РµР№СЃР°</p>

          {/* Upload zone вЂ” reuse garmentUrls */}
          <div className="quick-upload-zone">
            {previewUrls.length > 0 ? (
              <div className="multi-preview-grid">
                {previewUrls.map((url, i) => (
                  <div key={i} className="multi-preview-item">
                    <img src={url} alt={`РўРѕРІР°СЂ ${i+1}`} style={{cursor:'zoom-in'}} onClick={() => setLightboxSrc(url)} />
                    <button className="remove-preview" onClick={() => removeFile(i)}>вњ•</button>
                  </div>
                ))}
              </div>
            ) : (
              <label className="drop-zone compact" htmlFor="quick-upload">
                <span className="dz-emoji">рџ“·</span>
                <span className="dz-text">Р—Р°РіСЂСѓР·РёС‚Рµ С„РѕС‚Рѕ С‚РѕРІР°СЂР°</span>
                <input id="quick-upload" type="file" accept="image/*" multiple onChange={handleFilesChange} style={{display:'none'}} />
              </label>
            )}
          </div>

          {/* в•ђв•ђв•ђ MODE TOGGLE: РљСЂР°СЃРёРІС‹Р№ РєР°РґСЂ / Р“РѕС‚РѕРІР°СЏ РєР°СЂС‚РѕС‡РєР° / UGC в•ђв•ђв•ђ */}
          <div className="card-style-picker" style={{marginBottom: 16}}>
            <div className="card-style-label">Р§С‚Рѕ СЃРѕР·РґР°С‘Рј:</div>
            <div className="card-style-options">
              <button
                className={`card-style-btn ${quickMode === 'photo' ? 'active' : ''}`}
                onClick={() => setQuickMode('photo')}
              >
                <span className="card-style-icon">рџЋЁ</span>
                <span className="card-style-name">РљСЂР°СЃРёРІС‹Р№ РєР°РґСЂ</span>
                <span className="card-style-desc">РЎС‚СѓРґРёР№РЅРѕРµ С„РѕС‚Рѕ С‚РѕРІР°СЂР°</span>
              </button>
              <button
                className={`card-style-btn ${quickMode === 'card' ? 'active' : ''}`}
                onClick={() => setQuickMode('card')}
              >
                <span className="card-style-icon">рџ“‹</span>
                <span className="card-style-name">Р“РѕС‚РѕРІР°СЏ РєР°СЂС‚РѕС‡РєР°</span>
                <span className="card-style-desc">РРЅС„РѕРіСЂР°С„РёРєР° РґР»СЏ РјР°СЂРєРµС‚РїР»РµР№СЃР°</span>
              </button>
              <button
                className={`card-style-btn ${quickMode === 'ugc' ? 'active' : ''}`}
                onClick={() => setQuickMode('ugc')}
              >
                <span className="card-style-icon">рџ“±</span>
                <span className="card-style-name">Р¤РѕС‚Рѕ РѕС‚ РїРѕРєСѓРїР°С‚РµР»РµР№</span>
                <span className="card-style-desc">Р РµР°Р»РёСЃС‚РёС‡РЅС‹Рµ С„РѕС‚Рѕ РґР»СЏ РѕС‚Р·С‹РІРѕРІ</span>
              </button>
              <button
                className={`card-style-btn ${quickMode === 'model' ? 'active' : ''}`}
                onClick={() => setQuickMode('model')}
              >
                <span className="card-style-icon">рџ‘¤</span>
                <span className="card-style-name">Р¤РѕС‚Рѕ СЃ РјРѕРґРµР»СЊСЋ</span>
                <span className="card-style-desc">РњРѕРґРµР»СЊ РїРѕР·РёСЂСѓРµС‚ СЃ С‚РѕРІР°СЂРѕРј</span>
              </button>
            </div>
          </div>

          {/* в•ђв•ђв•ђ CARD MODE: СЃС‚РёР»СЊ + РёРЅС„РѕСЂРјР°С†РёСЏ Рѕ С‚РѕРІР°СЂРµ в•ђв•ђв•ђ */}
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
                    вљЎ РЎРёСЃС‚РµРјР° Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЃРѕР·РґР°СЃС‚ РїСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅСѓСЋ РєР°СЂС‚РѕС‡РєСѓ С‚РѕРІР°СЂР° СЃ С‚РµРєСЃС‚Р°РјРё, РґРёР·Р°Р№РЅРѕРј Рё С‚РёРїРѕРіСЂР°С„РёРєРѕР№. РЎС‚РѕРёРјРѕСЃС‚СЊ: <strong style={{color:'#ffd700'}}>2 РєСЂРµРґРёС‚Р°</strong>. РџРѕСЃР»Рµ РіРµРЅРµСЂР°С†РёРё РІС‹ СЃРјРѕР¶РµС‚Рµ РѕС‚СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚ (<strong>1 РєСЂРµРґРёС‚</strong> Р·Р° РїСЂР°РІРєСѓ).
                  </p>
                </div>

                {/* Card style picker */}
                <div className="card-style-picker">
                  <div className="card-style-label">РЎС‚РёР»СЊ РєР°СЂС‚РѕС‡РєРё:</div>
                  <div className="card-style-options">
                    <button
                      className={`card-style-btn ${quickCardStyle === 'natural' ? 'active' : ''}`}
                      onClick={() => setQuickCardStyle('natural')}
                    >
                      <span className="card-style-icon">рџЊї</span>
                      <span className="card-style-name">Р•СЃС‚РµСЃС‚РІРµРЅРЅР°СЏ</span>
                      <span className="card-style-desc">Р­Р»РµРіР°РЅС‚РЅР°СЏ, РјРёРЅРёРјР°Р»РёР·Рј</span>
                    </button>
                    <button
                      className={`card-style-btn ${quickCardStyle === 'epic' ? 'active' : ''}`}
                      onClick={() => setQuickCardStyle('epic')}
                    >
                      <span className="card-style-icon">рџ”Ґ</span>
                      <span className="card-style-name">Р­РїРёС‡РЅР°СЏ</span>
                      <span className="card-style-desc">РљРёРЅРµРјР°С‚РѕРіСЂР°С„, wow</span>
                    </button>
                  </div>
                </div>

                {/* Optional product info */}
                <div style={{marginTop: 16}}>
                  <div className="detail-label" style={{marginBottom: 8}}>
                    рџ’Ў РРЅС„РѕСЂРјР°С†РёСЏ Рѕ С‚РѕРІР°СЂРµ <span style={{color:'rgba(255,255,255,0.4)', fontSize:12}}>(РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)</span>
                  </div>
                  <textarea
                    className="modifier-input"
                    rows={3}
                    placeholder="РќР°РїСЂРёРјРµСЂ: В«РћС„РёСЃРЅС‹Р№ СЃС‚СѓР», СЃС‚Р°Р»СЊРЅРѕР№ РєР°СЂРєР°СЃ, РґРѕ 120 РєРі, С‚РєР°РЅСЊ РѕРєСЃС„РѕСЂРґВ». РР СЃР°Рј РѕРїСЂРµРґРµР»РёС‚ С‚РѕРІР°СЂ РїРѕ С„РѕС‚Рѕ вЂ” Р·РґРµСЃСЊ РјРѕР¶РЅРѕ СѓС‚РѕС‡РЅРёС‚СЊ РґРµС‚Р°Р»Рё, С‡С‚РѕР±С‹ С‚РµРєСЃС‚С‹ РЅР° РєР°СЂС‚РѕС‡РєРµ Р±С‹Р»Рё С‚РѕС‡РЅРµРµ."
                    value={userProductInfo}
                    onChange={e => setUserProductInfo(e.target.value)}
                    style={{width:'100%', resize:'vertical'}}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* в•ђв•ђв•ђ PHOTO MODE: РјРѕРґРµР»СЊ-С‡РµР»РѕРІРµРє в•ђв•ђв•ђ */}
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
                    <span className="quick-toggle-text">рџ‘¤ Р”РѕР±Р°РІРёС‚СЊ РјРѕРґРµР»СЊ-С‡РµР»РѕРІРµРєР°</span>
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
                        <button className={`tab-btn ${productModelTab==='presets'?'active':''}`} onClick={()=>{setProductModelTab('presets');setProductSavedModelId(null);}}>рџЋ­ РџСЂРµСЃРµС‚С‹</button>
                        <button className={`tab-btn ${productModelTab==='my_models'?'active':''}`} onClick={()=>setProductModelTab('my_models')}>в­ђ РњРѕРё РњРѕРґРµР»Рё{myModels.length>0?` (${myModels.length})`:''}</button>
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
                            <input className="custom-variant-input" type="text" placeholder="РћРїРёСЃР°С‚СЊ РјРѕРґРµР»СЊ: В«СЂС‹Р¶Р°СЏ РґРµРІСѓС€РєР° 25 Р»РµС‚ СЃ РІРµСЃРЅСѓС€РєР°РјРёВ»"
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
                                  <img src={m.imageBase64?.[0] || m.fullbodyBase64 || m.fullbodyUrl || m.imageUrls?.[0] || ''} alt={m.name} />
                                  <div className="avatar-name">{m.name}</div>
                                  <button className="zoom-btn" onClick={e => { e.stopPropagation(); setLightboxSrc(m.imageBase64?.[0] || m.fullbodyBase64 || m.fullbodyUrl || m.imageUrls?.[0] || ''); }}>рџ”Ќ</button>
                                  <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteModel(m.id); }}>вњ•</button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="section-hint" style={{textAlign:'center',padding:'20px 0'}}>РЈ РІР°СЃ РїРѕРєР° РЅРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… РјРѕРґРµР»РµР№.</p>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* в•ђв•ђв•ђ MODEL MODE: РёРЅС„Рѕ-Р±Р°РЅРЅРµСЂ в•ђв•ђв•ђ */}
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
                    рџ‘¤ <strong>РР РїРѕРјРµСЃС‚РёС‚ С‚РѕРІР°СЂ РІ СЂСѓРєРё РјРѕРґРµР»Рё</strong> вЂ” СЃР°Рј РѕРїСЂРµРґРµР»РёС‚, РєР°Рє С‡РµР»РѕРІРµРє Р±СѓРґРµС‚ РґРµСЂР¶Р°С‚СЊ, РЅРѕСЃРёС‚СЊ РёР»Рё РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РІР°С€ С‚РѕРІР°СЂ.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* в•ђв•ђв•ђ UGC MODE: РЅР°СЃС‚СЂРѕР№РєРё С„РѕС‚Рѕ РѕС‚ РїРѕРєСѓРїР°С‚РµР»РµР№ в•ђв•ђв•ђ */}
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
                    рџ“± <strong>РР СЃРѕР·РґР°СЃС‚ СЂРµР°Р»РёСЃС‚РёС‡РЅС‹Рµ С„РѕС‚Рѕ С‚РѕРІР°СЂР°</strong>, РїРѕС…РѕР¶РёРµ РЅР° СЃРЅРёРјРєРё СЂРµР°Р»СЊРЅС‹С… РїРѕРєСѓРїР°С‚РµР»РµР№ вЂ” СЃ РґРѕРјР°С€РЅРёРј С„РѕРЅРѕРј, РµСЃС‚РµСЃС‚РІРµРЅРЅС‹Рј СЃРІРµС‚РѕРј Рё Р»С‘РіРєРёРј С€СѓРјРѕРј СЃРјР°СЂС‚С„РѕРЅР°.
                    РЎС‚РѕРёРјРѕСЃС‚СЊ: <strong style={{color:'#22c55e'}}>1 РєСЂРµРґРёС‚</strong> Р·Р° С„РѕС‚Рѕ.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Examples button */}
          <button className="card-examples-btn" onClick={() => setShowCardExamples(true)}>
            рџ‘Ѓ РџРѕСЃРјРѕС‚СЂРµС‚СЊ РїСЂРёРјРµСЂС‹ РґРѕ/РїРѕСЃР»Рµ
          </button>

          {/* Generate button */}
          <div className="quick-generate-row">
            <button
              className="generate-btn quick-generate-btn"
              onClick={handleQuickGenerate}
              disabled={isProcessing || !garmentUrls.length}
            >
              {isProcessing ? 'вЏі Р“РµРЅРµСЂРёСЂСѓРµРј...' : (quickMode === 'card' ? 'рџ“‹ РЎРѕР·РґР°С‚СЊ РєР°СЂС‚РѕС‡РєСѓ' : quickMode === 'ugc' ? 'рџ“± РЎРѕР·РґР°С‚СЊ С„РѕС‚Рѕ РѕС‚ РїРѕРєСѓРїР°С‚РµР»СЏ' : quickMode === 'model' ? 'рџ‘¤ РЎРѕР·РґР°С‚СЊ РєР°СЂС‚РѕС‡РєСѓ СЃ РјРѕРґРµР»СЊСЋ' : 'рџЋЁ РЎРѕР·РґР°С‚СЊ С„РѕС‚Рѕ')}
            </button>
            <span className="quick-credits-hint">{quickMode === 'card' ? '2 РєСЂРµРґРёС‚Р°' : '1 РєСЂРµРґРёС‚'}</span>
          </div>
        </motion.div>
      )}


      {/* 1. РњРЈР›Р¬РўРР—РђР“Р РЈР—РљРђ */}
      {appMode !== 'quick' && <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.15,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title">
          <span className="icon">{appMode === 'product' ? 'рџ“¦' : 'рџ“ё'}</span> 
          {appMode === 'product' ? ' Р—Р°РіСЂСѓР·РєР° С‚РѕРІР°СЂРѕРІ' : ' Р—Р°РіСЂСѓР·РєР° РІРµС‰РµР№'}
        </div>
        {previewUrls.length > 0 ? (
          <div className="multi-preview-grid">
            {previewUrls.map((url, i) => (
              <div key={i} className="multi-preview-item">
                <img src={url} alt={`РћР±СЉРµРєС‚ ${i+1}`} style={{cursor:'zoom-in'}} onClick={() => setLightboxSrc(url)} />
                <button className="remove-btn" onClick={() => removeFile(i)}>вњ•</button>
              </div>
            ))}
            <div className="add-more-btn" onClick={() => fileInputRef.current?.click()}>
              <span className="plus">+</span><span>Р•С‰С‘</span>
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
            <div className="upload-icon">{appMode === 'product' ? 'рџ§ґ' : 'рџ‘•'}</div>
            <p className="upload-text">
              {appMode === 'product' ? 'Р—Р°РіСЂСѓР·РёС‚Рµ С„РѕС‚Рѕ РІР°С€РµРіРѕ С‚РѕРІР°СЂР° вЂ” С„Р»Р°РєРѕРЅ, Р±Р°РЅРѕС‡РєСѓ, Р°РєСЃРµСЃСЃСѓР°СЂ' : 'Р—Р°РіСЂСѓР·РёС‚Рµ С„РѕС‚Рѕ РѕРґРµР¶РґС‹ вЂ” СЂР°СЃРєР»Р°РґРєРё РёР»Рё С„РѕС‚Рѕ РЅР° РјРѕРґРµР»Рё'}
            </p>
            <p className="upload-hint">
              {appMode === 'product' ? 'JPG, PNG вЂў РџРµСЂРµС‚Р°С‰РёС‚Рµ СЃСЋРґР° РёР»Рё РЅР°Р¶РјРёС‚Рµ вЂў РџРѕСЃС‚Р°СЂР°Р№С‚РµСЃСЊ СЃРґРµР»Р°С‚СЊ С„РѕС‚Рѕ РїСЂРё С…РѕСЂРѕС€РµРј СЃРІРµС‚Рµ' : 'JPG, PNG вЂў РџРµСЂРµС‚Р°С‰РёС‚Рµ СЃСЋРґР° РёР»Рё РЅР°Р¶РјРёС‚Рµ вЂў РњРѕР¶РЅРѕ РЅРµСЃРєРѕР»СЊРєРѕ: С„СѓС‚Р±РѕР»РєР° + Р±СЂСЋРєРё + СЃРµСЂСЊРіРё = РІСЃС‘ РЅР° РјРѕРґРµР»Рё'}
            </p>
          </div>
        )}
      </motion.div>}

      {/* 2. РќРђРЎРўР РћР™РљРђ РћР‘РЄР•РљРўРђ / РљРђРЎРўРРќР“-Р РЈРњ */}
      {appMode !== 'quick' && (appMode === 'product' ? (
        <>
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.3,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">рџ§ґ</span> РљР°С‚РµРіРѕСЂРёСЏ С‚РѕРІР°СЂР°</div>
          <div className="preset-grid">
            {PRODUCT_CATEGORIES.map(cat => (
              <div key={cat.id} className={`preset-card ${selectedProductCategory.id===cat.id&&!customProductPrompt?'active':''}`}
                onClick={() => { setSelectedProductCategory(cat); setCustomProductPrompt(''); }}>
                <span className="emoji">{cat.emoji}</span><span className="label">{cat.label}</span>
              </div>
            ))}
            <div className={`preset-card ${selectedProductCategory.id==='other'&&!customProductPrompt?'active':''}`}
              onClick={() => { setSelectedProductCategory({ id: 'other', label: 'Р”СЂСѓРіРѕРµ', emoji: 'рџ“‹', defaultPrompt: 'product item, commercial product photography' }); setCustomProductPrompt(''); }}>
              <span className="emoji">рџ“‹</span><span className="label">Р”СЂСѓРіРѕРµ</span>
            </div>
          </div>
          {selectedProductCategory.id === 'other' && !customProductPrompt && (
            <p className="section-hint" style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:6,textAlign:'center'}}>вќпёЏ РћРїРёС€РёС‚Рµ РІР°С€ С‚РѕРІР°СЂ РІ РїРѕР»Рµ РЅРёР¶Рµ вЂ” СЌС‚Рѕ СѓР»СѓС‡С€РёС‚ РєР°С‡РµСЃС‚РІРѕ РіРµРЅРµСЂР°С†РёРё</p>
          )}
          <div className="custom-variant-row">
            <input className="custom-variant-input" type="text" placeholder={selectedProductCategory.id === 'other' ? 'РћРїРёС€РёС‚Рµ РІР°С€ С‚РѕРІР°СЂ: В«РЅР°Р±РѕСЂ РєРёСЃС‚РµР№ РґР»СЏ РјР°РєРёСЏР¶Р° РІ С‡РµС…Р»РµВ»' : 'РћРїРёСЃР°С‚СЊ С‚РѕРІР°СЂ СЃ РЅСѓР»СЏ: В«РєСЂСѓРіР»Р°СЏ Р±Р°РЅРѕС‡РєР° РєСЂРµРјР° СЃ Р·РѕР»РѕС‚РѕР№ РєСЂС‹С€РєРѕР№В»'}
              value={customProductPrompt} 
              onChange={e => setCustomProductPrompt(e.target.value)} />
          </div>
        </motion.div>

        {/* в•ђв•ђв•ђ РњРћР”Р•Р›Р¬-Р§Р•Р›РћР’Р•Рљ Р’ РџР Р•Р”РњР•РўРќРћР™ РЎРЄРЃРњРљР• в•ђв•ђв•ђ */}
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.35,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <span><span className="icon">рџ‘¤</span> РњРѕРґРµР»СЊ-С‡РµР»РѕРІРµРє</span>
            {productWithModel && (
              <motion.button 
                initial={{opacity:0, scale:0.9}}
                animate={{opacity:1, scale:1}}
                className="remove-model-btn" 
                onClick={() => setProductWithModel(false)}
              >
                вњ• РСЃРєР»СЋС‡РёС‚СЊ РјРѕРґРµР»СЊ
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
                  <div className="add-model-icon">рџ‘¤вњЁ</div>
                  <div className="add-model-info">
                    <div className="add-model-title">Р”РѕР±Р°РІРёС‚СЊ РјРѕРґРµР»СЊ-С‡РµР»РѕРІРµРєР°</div>
                    <div className="add-model-desc">
                      РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ Р¶РёРІСѓСЋ РјРѕРґРµР»СЊ, РєРѕС‚РѕСЂР°СЏ РґРµСЂР¶РёС‚ РёР»Рё РґРµРјРѕРЅСЃС‚СЂРёСЂСѓРµС‚ РІР°С€ С‚РѕРІР°СЂ РІ РєР°РґСЂРµ
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
                  <button className={`tab-btn ${productModelTab==='presets'?'active':''}`} onClick={()=>{setProductModelTab('presets');setProductSavedModelId(null);}}>рџЋ­ РџСЂРµСЃРµС‚С‹</button>
                  <button className={`tab-btn ${productModelTab==='my_models'?'active':''}`} onClick={()=>setProductModelTab('my_models')}>в­ђ РњРѕРё РњРѕРґРµР»Рё{myModels.length>0?` (${myModels.length})`:''}</button>
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
                      <input className="custom-variant-input" type="text" placeholder="РћРїРёСЃР°С‚СЊ РјРѕРґРµР»СЊ: В«СЂС‹Р¶Р°СЏ РґРµРІСѓС€РєР° 25 Р»РµС‚ СЃ РІРµСЃРЅСѓС€РєР°РјРё РґРµСЂР¶РёС‚ С‚РѕРІР°СЂВ»"
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
                            <img src={m.imageBase64?.[0] || m.fullbodyBase64 || m.fullbodyUrl || m.imageUrls?.[0] || ''} alt={m.name} />
                            <div className="avatar-name">{m.name}</div>
                            <button className="zoom-btn" onClick={e => { e.stopPropagation(); setLightboxSrc(m.imageBase64?.[0] || m.fullbodyBase64 || m.fullbodyUrl || m.imageUrls?.[0] || ''); }}>рџ”Ќ</button>
                            <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteModel(m.id); }}>вњ•</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {myModels.length === 0 && (
                      <p className="section-hint" style={{textAlign:'center',padding:'20px 0'}}>РЈ РІР°СЃ РїРѕРєР° РЅРµС‚ СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… РјРѕРґРµР»РµР№</p>
                    )}
                    <div className="add-location-card" style={{marginTop: myModels.length ? 12 : 0, background:'rgba(168,85,247,0.08)', borderColor:'rgba(168,85,247,0.2)'}} onClick={() => setShowPersonaWizard(true)}>
                      <span className="plus-icon" style={{color:'#a855f7'}}>рџ§‘</span>
                      <span style={{color:'#a855f7'}}>РЎРѕР·РґР°С‚СЊ РїРµСЂСЃРѕРЅР°Р¶Р°</span>
                    </div>
                    <div className="add-location-card" style={{marginTop: 8}} onClick={() => setShowLoraModal(true)}>
                      <span className="plus-icon">+</span>
                      <span>Р”РѕР±Р°РІРёС‚СЊ СЃРІРѕСЋ РјРѕРґРµР»СЊ</span>
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
          <div className="section-title"><span className="icon">рџ‘¤</span> РљР°СЃС‚РёРЅРі-Р СѓРј вЂ” РІС‹Р±РѕСЂ РјРѕРґРµР»Рё</div>
          <div className="tabs-row">
            <button className={`tab-btn ${modelTab==='presets'?'active':''}`} onClick={()=>{setModelTab('presets');setSelectedSavedModelId(null);}}>рџЋ­ РџСЂРµСЃРµС‚С‹</button>
            <button className={`tab-btn ${modelTab==='my_models'?'active':''}`} onClick={()=>setModelTab('my_models')}>в­ђ РњРѕРё РњРѕРґРµР»Рё{myModels.length>0?` (${myModels.length})`:''}</button>
          </div>
          {modelTab === 'presets' ? (
            <>
              <GenderToggle gender={gender} setGender={setGender} />
              {/* Multi-select info popover */}
              {!customModelPrompt && !selectedSavedModelId && (selectedModels.length + customModelChips.length) > 1 && (
                <div className="multi-select-info">
                  <span className="info-icon">в„№пёЏ</span>
                  Р’С‹Р±СЂР°РЅРѕ {selectedModels.length + customModelChips.length} С‚РёРїРѕРІ РјРѕРґРµР»РµР№ вЂ” РєР°Р¶РґС‹Р№ С‚РёРї = РѕС‚РґРµР»СЊРЅР°СЏ РіРµРЅРµСЂР°С†РёСЏ. РС‚РѕРіРѕ: Г—{selectedModels.length + customModelChips.length} Рє РєРѕР»РёС‡РµСЃС‚РІСѓ РєР°РґСЂРѕРІ. РњР°РєСЃРёРјСѓРј 20 Р·Р° СЂР°Р·.
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
                              // РџРѕРІС‚РѕСЂРЅС‹Р№ РєР»РёРє РЅР° СѓР¶Рµ Р°РєС‚РёРІРЅСѓСЋ РєР°СЂС‚РѕС‡РєСѓ вЂ” СЃРєСЂС‹С‚СЊ/РїРѕРєР°Р·Р°С‚СЊ РїР°РЅРµР»СЊ
                              setShowDetails(v => !v);
                            } else {
                              // РљР»РёРє РЅР° РґСЂСѓРіСѓСЋ РІС‹Р±СЂР°РЅРЅСѓСЋ РєР°СЂС‚РѕС‡РєСѓ вЂ” РїРµСЂРµРєР»СЋС‡РёС‚СЊ С„РѕРєСѓСЃ, РќР• СЃРЅРёРјР°С‚СЊ РІС‹РґРµР»РµРЅРёРµ
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
                          title="РЎРЅСЏС‚СЊ РІС‹Р±РѕСЂ"
                        >вњ•</button>
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
                        <button className="chip-action-btn edit-btn" onClick={e => { e.stopPropagation(); openEditChipModal('model', chip); }}>вњЏпёЏ</button>
                        <button className="chip-action-btn delete-btn" onClick={e => { e.stopPropagation(); removeCustomChip('model', chip.id); }}>вњ•</button>
                      </div>
                    </div>
                  );
                })}
                {/* Add custom variant button */}
                {!customModelPrompt && !selectedSavedModelId && (
                  <div className="preset-card add-custom-card" onClick={() => { setCustomChipModalSection('model'); setNewChipText(''); }}>
                    <span className="emoji">вћ•</span><span className="label">РЎРІРѕР№ РІР°СЂРёР°РЅС‚</span>
                  </div>
                )}
              </div>
              <DetailPanel modelDetails={modelDetails} setModelDetails={setModelDetails} visible={showDetails && !customModelPrompt && !selectedSavedModelId} gender={gender} extraPrompt={extraModelPrompt} setExtraPrompt={setExtraModelPrompt} title={getActiveModelLabel()} onClose={() => setShowDetails(false)} />
              {(customModelChips.some(c => /С‚Р°С‚Сѓ|tattoo/i.test(c.prompt)) || /С‚Р°С‚Сѓ|tattoo/i.test(customModelPrompt)) && (
                <div className="tattoo-warning">вљ пёЏ РўР°С‚СѓРёСЂРѕРІРєР° РѕС‚Р»РёС‡РЅРѕ РїРѕР»СѓС‡РёС‚СЃСЏ РЅР° РѕРґРёРЅРѕС‡РЅРѕРј С„РѕС‚Рѕ, РЅРѕ РІ СЃРµСЂРёРё (С„РѕС‚РѕСЃРµСЃСЃРёСЏ) РјРѕР¶РµС‚ РёСЃРєР°Р¶Р°С‚СЊСЃСЏ. Р”Р»СЏ СЃС‚Р°Р±РёР»СЊРЅРѕР№ РјРѕРґРµР»Рё СЃС‚Р°СЂР°Р№С‚РµСЃСЊ РЅРµ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ С‚Р°С‚Сѓ.</div>
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
                        <img src={m.imageBase64?.[0] || m.fullbodyBase64 || m.fullbodyUrl || m.imageUrls?.[0] || ''} alt={m.name} />
                        <div className="avatar-name">{m.name}</div>
                        <button className="zoom-btn" onClick={e => { e.stopPropagation(); setLightboxSrc(m.imageBase64?.[0] || m.fullbodyBase64 || m.fullbodyUrl || m.imageUrls?.[0] || ''); }}>рџ”Ќ</button>
                        <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteModel(m.id); }}>вњ•</button>
                      </div>
                    ))}
                  </div>
                  {selectedSavedModelId && <div className="selected-model-indicator">в­ђ Р’Р°С€Р° РјРѕРґРµР»СЊ РІС‹Р±СЂР°РЅР°</div>}
                  {selectedSavedModelId && (
                    <div className="modifier-block">
                      <button className="modifier-toggle" onClick={() => { setShowModelModifier(!showModelModifier); setModelPreviewSrc(null); }}>
                        {showModelModifier ? 'вњ– РЎРєСЂС‹С‚СЊ' : 'вњЏпёЏ РР·РјРµРЅРёС‚СЊ РјРѕРґРµР»СЊ'}
                      </button>
                      {showModelModifier && (
                        <div className="modifier-content">
                          <textarea className="modifier-input" rows={2} placeholder="РќР°РїСЂРёРјРµСЂ: РґРѕР±Р°РІРёС‚СЊ С‚Р°С‚СѓРёСЂРѕРІРєСѓ РЅР° Р»РµРІСѓСЋ СЂСѓРєСѓ, СЃРґРµР»Р°С‚СЊ РІРѕР»РѕСЃС‹ СЂС‹Р¶РёРјРё, СЂРѕСЃС‚ РІС‹С€Рµ"
                            value={modelModifier} onChange={e => setModelModifier(e.target.value)} />
                          {/* Tattoo warning (text input) */}
                          {/С‚Р°С‚Сѓ/i.test(modelModifier) && (
                            <div className="tattoo-warning">вљ пёЏ РўР°С‚СѓРёСЂРѕРІРєР° РѕС‚Р»РёС‡РЅРѕ РїРѕР»СѓС‡РёС‚СЃСЏ РЅР° РѕРґРёРЅРѕС‡РЅРѕРј С„РѕС‚Рѕ, РЅРѕ РІ СЃРµСЂРёРё (С„РѕС‚РѕСЃРµСЃСЃРёСЏ) РјРѕР¶РµС‚ РёСЃРєР°Р¶Р°С‚СЊСЃСЏ. Р”Р»СЏ СЃС‚Р°Р±РёР»СЊРЅРѕР№ РјРѕРґРµР»Рё СЃС‚Р°СЂР°Р№С‚РµСЃСЊ РЅРµ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ С‚Р°С‚Сѓ.</div>
                          )}
                          <button className="modifier-save-btn" onClick={handlePreviewModel} disabled={!modelModifier.trim() || isPreviewingModel}>
                            {isPreviewingModel ? 'вЏі Р“РµРЅРµСЂРёСЂСѓРµРј РїСЂРµРІСЊСЋ...' : 'рџ‘ЃпёЏ РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ'}
                          </button>
                          {modelPreviewSrc && (
                            <div className="model-preview-block">
                              <img src={modelPreviewSrc} alt="РџСЂРµРІСЊСЋ РјРѕРґРµР»Рё" className="model-preview-img" onClick={() => setLightboxSrc(modelPreviewSrc)} />
                              <input className="custom-variant-input" type="text" placeholder="РќР°Р·РѕРІРёС‚Рµ РЅРѕРІСѓСЋ РјРѕРґРµР»СЊ" value={modelPreviewName} onChange={e => setModelPreviewName(e.target.value)} />
                              <button className="modifier-save-btn" onClick={saveModelAsNew} disabled={!modelPreviewName.trim() || isSaving}>
                                {isSaving ? 'вЏі РЎРѕС…СЂР°РЅСЏРµРј...' : 'рџ’ѕ РЎРѕС…СЂР°РЅРёС‚СЊ РєР°Рє РЅРѕРІСѓСЋ РјРѕРґРµР»СЊ'}
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
                <span className="plus-icon" style={{color:'#a855f7'}}>рџ§‘</span>
                <span style={{color:'#a855f7'}}>РЎРѕР·РґР°С‚СЊ РїРµСЂСЃРѕРЅР°Р¶Р°</span>
              </div>
              <div className="add-location-card" style={{marginTop: 8}} onClick={() => setShowLoraModal(true)}>
                <span className="plus-icon">+</span>
                <span>Р”РѕР±Р°РІРёС‚СЊ СЃРІРѕСЋ РјРѕРґРµР»СЊ</span>
              </div>
            </>
          )}
        </motion.div>
      ))}

      {/* 3. РџРћР—Рђ РР›Р РљРћРњРџРћР—РР¦РРЇ */}
      {appMode !== 'quick' && (appMode === 'product' ? (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.45,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">рџ“ђ</span> РљРѕРјРїРѕР·РёС†РёСЏ РєР°РґСЂР°</div>
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
            <input className="custom-variant-input" type="text" placeholder="РР»Рё РѕРїРёС€РёС‚Рµ СЃРІРѕСЋ РєРѕРјРїРѕР·РёС†РёСЋ: В«РўРѕРІР°СЂ Р»РµР¶РёС‚ РЅР° Р·РµСЂРєР°Р»СЊРЅРѕР№ РїРѕРІРµСЂС…РЅРѕСЃС‚Рё РїРѕРґ СѓРіР»РѕРјВ»"
              value={customPoseText} onChange={e => setCustomPoseText(e.target.value)} />
          </div>
        </motion.div>
      ) : (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.45,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">рџ§Ќ</span> РџРѕР·Р° РјРѕРґРµР»Рё</div>
          {/* Multi-select info */}
          {!customPoseText && (selectedPoses.length + customPoseChips.length) > 1 && (
            <div className="multi-select-info">
              <span className="info-icon">в„№пёЏ</span>
              Р’С‹Р±СЂР°РЅРѕ {selectedPoses.length + customPoseChips.length} РїРѕР· вЂ” РєР°Р¶РґР°СЏ РїРѕР·Р° = РѕС‚РґРµР»СЊРЅР°СЏ РіРµРЅРµСЂР°С†РёСЏ. РС‚РѕРіРѕ: Г—{selectedPoses.length + customPoseChips.length} Рє РєРѕР»РёС‡РµСЃС‚РІСѓ РєР°РґСЂРѕРІ.
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
            {/* РРјРїСЂРѕРІРёР·Р°С†РёСЏ вЂ” always visible */}
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
                  <button className="chip-action-btn edit-btn" onClick={e => { e.stopPropagation(); openEditChipModal('pose', chip); }}>вњЏпёЏ</button>
                  <button className="chip-action-btn delete-btn" onClick={e => { e.stopPropagation(); removeCustomChip('pose', chip.id); }}>вњ•</button>
                </div>
              </div>
            ))}
            {/* Add custom variant */}
            {!customPoseText && (
              <div className="preset-card add-custom-card" onClick={() => { setCustomChipModalSection('pose'); setNewChipText(''); }}>
                <span className="emoji">вћ•</span><span className="label">РЎРІРѕР№ РІР°СЂРёР°РЅС‚</span>
              </div>
            )}
          </div>
        </motion.div>
      ))}

      {/* 4. Р РђРљРЈР РЎ РљРђРњР•Р Р« (РўРѕР»СЊРєРѕ РІ СЂРµР¶РёРјРµ РѕРґРµР¶РґС‹) */}
      {appMode === 'fashion' && (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.6,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">рџ“·</span> Р Р°РєСѓСЂСЃ РєР°РјРµСЂС‹</div>
          {selectedCameras.length > 1 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
              вњ… {selectedCameras.length} СЂР°РєСѓСЂСЃР° РІС‹Р±СЂР°РЅРѕ
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

      {/* 5. Р¤РћРќ / Р›РћРљРђР¦РРЇ */}
      {appMode !== 'quick' && <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.75,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title"><span className="icon">рџЋЁ</span> {appMode === 'product' ? 'РЎС†РµРЅР° / РћРєСЂСѓР¶РµРЅРёРµ' : 'Р¤РѕРЅ / Р›РѕРєР°С†РёСЏ'}</div>
        <div className="tabs-row">
          <button className={`tab-btn ${bgTab==='presets'?'active':''}`} onClick={()=>{setBgTab('presets');setSelectedLocId(null);}}>рџЋЁ РџСЂРµСЃРµС‚С‹</button>
          <button className={`tab-btn ${bgTab==='my_locations'?'active':''}`} onClick={()=>setBgTab('my_locations')}>рџ“Ќ РњРѕРё Р»РѕРєР°С†РёРё{myLocations.length>0?` (${myLocations.length})`:''}</button>
        </div>
        {bgTab === 'presets' ? (
          <>
            {appMode === 'product' ? (
              <>
                {!customProductBg && !selectedLocId && selectedProductBgs.length > 1 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
                    вњ… {selectedProductBgs.length} СЃС†РµРЅС‹ РІС‹Р±СЂР°РЅРѕ вЂ” СЃРіРµРЅРµСЂРёСЂСѓРµС‚СЃСЏ {selectedProductBgs.length * selectedProductCompositions.length} {selectedProductBgs.length * selectedProductCompositions.length === 1 ? 'РІР°СЂРёР°РЅС‚' : 'РІР°СЂРёР°РЅС‚Р°'}
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
                  <input className="custom-variant-input" placeholder="Р›РѕРєР°С†РёСЏ СЃ РЅСѓР»СЏ: В«РґРµСЂРµРІСЏРЅРЅС‹Р№ СЃС‚РѕР» РІ СЃРєР°РЅРґРёРЅР°РІСЃРєРѕРј СЃС‚РёР»Рµ, РЅР° С„РѕРЅРµ СЂР°Р·РјС‹С‚РѕРµ РѕРєРЅРѕВ»"
                    value={customProductBg} onChange={e => { setCustomProductBg(e.target.value); setSelectedLocId(null); }} />
                </div>
                <div className="section-subtitle-small" style={{marginTop: 18, marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <span>вњЁ</span> Р”РѕР±Р°РІРёС‚СЊ СЃРїРµС†СЌС„С„РµРєС‚
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
                      placeholder="РћРїРёС€РёС‚Рµ РІР°С€ СЃРїРµС†СЌС„С„РµРєС‚: В«РІР·СЂС‹РІ РєРѕРЅС„РµС‚С‚Рё, СЃРЅРµР¶РёРЅРєРё, РґС‹РјВ»"
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
                    <span className="info-icon">в„№пёЏ</span>
                    Р’С‹Р±СЂР°РЅРѕ {selectedBgs.length + customBgChips.length} С„РѕРЅРѕРІ вЂ” РєР°Р¶РґС‹Р№ С„РѕРЅ = РѕС‚РґРµР»СЊРЅР°СЏ РіРµРЅРµСЂР°С†РёСЏ. РС‚РѕРіРѕ: Г—{selectedBgs.length + customBgChips.length} Рє РєРѕР»РёС‡РµСЃС‚РІСѓ РєР°РґСЂРѕРІ.
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
                        <button className="chip-action-btn edit-btn" onClick={e => { e.stopPropagation(); openEditChipModal('bg', chip); }}>вњЏпёЏ</button>
                        <button className="chip-action-btn delete-btn" onClick={e => { e.stopPropagation(); removeCustomChip('bg', chip.id); }}>вњ•</button>
                      </div>
                    </div>
                  ))}
                  {/* Add custom variant */}
                  {!customBgText && !selectedLocId && (
                    <div className="preset-card add-custom-card" onClick={() => { setCustomChipModalSection('bg'); setNewChipText(''); }}>
                      <span className="emoji">вћ•</span><span className="label">РЎРІРѕР№ РІР°СЂРёР°РЅС‚</span>
                    </div>
                  )}
                </div>
                <div className="modifier-block" style={{marginTop:10}}>
                  <textarea className="modifier-input" rows={1} placeholder="Р”РѕР±Р°РІРёС‚СЊ Рє Р»РѕРєР°С†РёРё: В«Р·Р°РєР°С‚, РјРѕРєСЂС‹Р№ Р°СЃС„Р°Р»СЊС‚, РЅРµРѕРЅРѕРІС‹Рµ РѕРіРЅРёВ»"
                    value={bgExtraText} onChange={e => setBgExtraText(e.target.value)} />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="location-card-grid">
              {myLocations.map(loc => {
                const hasPhoto = loc.imageBase64?.length > 0;
                return (
                  <div key={loc.id} className={`location-card ${selectedLocId===loc.id?'active':''} ${!hasPhoto?'loc-needs-reupload':''}`} onClick={() => hasPhoto && selectLocation(loc.id)}
                    style={!hasPhoto ? {cursor:'default', opacity: 0.7} : {}}>
                    {hasPhoto ? (
                      <img src={loc.imageBase64[0]} alt={loc.title || loc.name || ''} onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div style={{width:'100%', height:'80px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', background:'rgba(255,160,0,0.08)', borderRadius:'6px'}}>
                        <span style={{fontSize:'20px'}}>вљ пёЏ</span>
                        <span style={{fontSize:'10px', color:'rgba(255,180,0,0.9)', textAlign:'center', lineHeight:'1.2'}}>Р¤РѕС‚Рѕ РЅРµРґРѕСЃС‚СѓРїРЅРѕ</span>
                        <button
                          style={{marginTop:'2px', padding:'3px 8px', fontSize:'10px', background:'rgba(255,160,0,0.2)', border:'1px solid rgba(255,160,0,0.5)', borderRadius:'4px', color:'#ffb300', cursor:'pointer'}}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`РЈРґР°Р»РёС‚СЊ "${loc.title || 'Р»РѕРєР°С†РёСЋ'}" Рё Р·Р°РіСЂСѓР·РёС‚СЊ С„РѕС‚Рѕ Р·Р°РЅРѕРІРѕ?`)) {
                              await deleteLoc(loc.id);
                              setShowLocModal(true);
                            }
                          }}
                        >рџ“ё РџРµСЂРµР·Р°РіСЂСѓР·РёС‚СЊ</button>
                      </div>
                    )}
                    <div className="loc-name">{loc.title || loc.name || 'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ'}</div>
                    <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteLoc(loc.id); }}>вњ•</button>
                  </div>
                );
              })}
              <div className="add-location-card" onClick={() => setShowLocModal(true)}>
                <span className="plus-icon">+</span><span>РћС†РёС„СЂРѕРІР°С‚СЊ Р»РѕРєР°С†РёСЋ</span>
              </div>
            </div>
            {/* РљРЅРѕРїРєР° РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ СѓРґР°Р»С‘РЅРЅС‹С… Р»РѕРєР°С†РёР№ РёР· Storage */}
            <div style={{marginTop: '8px', textAlign: 'center'}}>
              <button
                style={{background: 'none', border: 'none', color: 'rgba(255,180,0,0.6)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', padding: '4px'}}
                onClick={async () => {
                  try {
                    const idToken = await user.getIdToken();
                    const locName = prompt('РќР°Р·РІР°РЅРёРµ РґР»СЏ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРЅРѕР№ Р»РѕРєР°С†РёРё:', 'РҐР°С‚Р° РєСЃРѕРЅР°') || 'Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРЅР°СЏ Р»РѕРєР°С†РёСЏ';
                    const resp = await fetch('/api/admin/recover-locations', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                      body: JSON.stringify({ title: locName }),
                    });
                    const data = await resp.json();
                    if (data.ok) {
                      alert(`вњ… Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ ${data.count} С„РѕС‚Рѕ! РџРµСЂРµР·Р°РіСЂСѓР¶Р°РµРј...`);
                      const locs = await getLocations(user.uid);
                      setMyLocations(locs || []);
                      const cache = {};
                      (locs || []).forEach(l => { if (l.imageBase64?.length) cache[l.id] = l.imageBase64; });
                      setLocBase64Cache(prev => ({ ...prev, ...cache }));
                    } else {
                      alert(`вљ пёЏ РќРµ СѓРґР°Р»РѕСЃСЊ РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ: ${data.error}\n\nРџРѕРґСЃРєР°Р·РєР°: ${data.hint || 'Р¤Р°Р№Р»С‹ РјРѕРіСѓС‚ Р±С‹С‚СЊ СѓРґР°Р»РµРЅС‹ РёР· Storage. РџСЂРёРґС‘С‚СЃСЏ Р·Р°РіСЂСѓР·РёС‚СЊ Р·Р°РЅРѕРІРѕ.'}`);
                    }
                  } catch (e) {
                    alert('РћС€РёР±РєР°: ' + e.message);
                  }
                }}
              >рџ”„ Р’РѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ СѓРґР°Р»С‘РЅРЅС‹Рµ Р»РѕРєР°С†РёРё РёР· Storage</button>
            </div>
            {selectedLocId && (
              <div className="modifier-block">
                <button className="modifier-toggle" onClick={() => setShowLocModifier(!showLocModifier)}>
                  {showLocModifier ? 'вњ– РЎРєСЂС‹С‚СЊ' : 'вњЏпёЏ РР·РјРµРЅРёС‚СЊ Р»РѕРєР°С†РёСЋ'}
                </button>
                {showLocModifier && (
                  <div className="modifier-content">
                    <textarea className="modifier-input" rows={2} placeholder="РќР°РїСЂРёРјРµСЂ: РґРѕР±Р°РІРёС‚СЊ Р·Р°РєР°С‚, СЃРґРµР»Р°С‚СЊ СЃС‚РµРЅС‹ РєРёСЂРїРёС‡РЅС‹РјРё, РЅРµРѕРЅРѕРІР°СЏ РІС‹РІРµСЃРєР°"
                      value={locModifier} onChange={e => setLocModifier(e.target.value)} />
                    <button className="modifier-save-btn" onClick={saveLocMod} disabled={!locModifier.trim()}>рџ’ѕ РЎРѕС…СЂР°РЅРёС‚СЊ РІ Р»РѕРєР°С†РёСЋ</button>
                  </div>
                )}
              </div>
            )}
            {appMode === 'product' && (
              <>
                <div className="section-subtitle-small" style={{marginTop: 18, marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <span>вњЁ</span> Р”РѕР±Р°РІРёС‚СЊ СЃРїРµС†СЌС„С„РµРєС‚
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
                      placeholder="РћРїРёС€РёС‚Рµ РІР°С€ СЃРїРµС†СЌС„С„РµРєС‚: В«РІР·СЂС‹РІ РєРѕРЅС„РµС‚С‚Рё, СЃРЅРµР¶РёРЅРєРё, РґС‹РјВ»"
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

      {/* 6. Р¤РћР РњРђРў */}
      {appMode !== 'quick' && <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.9,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title"><span className="icon">рџ“ђ</span> Р¤РѕСЂРјР°С‚ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ</div>
        {selectedRatios.length > 1 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
            вњ… {selectedRatios.length} С„РѕСЂРјР°С‚Р° РІС‹Р±СЂР°РЅРѕ вЂ” Р±СѓРґРµС‚ СЃРѕР·РґР°РЅРѕ РЅРµСЃРєРѕР»СЊРєРѕ РєРѕРїРёР№ РґР»СЏ РєР°Р¶РґРѕРіРѕ С„РѕСЂРјР°С‚Р°
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

      {/* 7. Р“Р•РќР•Р РђР¦РРЇ */}
      {appMode !== 'quick' && <motion.div className="generate-section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:1.05,duration:0.5,ease:[0.16,1,0.3,1]}}>
        {/* Beauty toggle вЂ” С‚РѕР»СЊРєРѕ РєРѕРіРґР° РµСЃС‚СЊ Р¶РёРІР°СЏ РјРѕРґРµР»СЊ-С‡РµР»РѕРІРµРє */}
        {(appMode === 'fashion' || (appMode === 'product' && productWithModel)) && (
          <div className="beauty-toggle">
            <label className={`beauty-switch ${isBeautyMode ? 'active' : ''}`}>
              <input type="checkbox" checked={isBeautyMode} onChange={e => setIsBeautyMode(e.target.checked)} />
              <span className="beauty-label">{isBeautyMode ? 'вњЁ Beauty-СЂРµС‚СѓС€СЊ' : 'рџ“· Р РµР°Р»РёР·Рј'}</span>
            </label>
            <span className="beauty-hint">
              {isBeautyMode
                ? 'Р’С‹Р±СЂР°РЅ Р¶СѓСЂРЅР°Р»СЊРЅС‹Р№ РіР»СЏРЅРµС† В«РРґРµР°Р»СЊРЅР°СЏ РєРѕР¶Р°В». РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ РІРµСЂРЅСѓС‚СЊ СЂРµР°Р»РёР·Рј'
                : 'Р’С‹Р±СЂР°РЅ СЂРµР°Р»РёР·Рј: РЅР°С‚СѓСЂР°Р»СЊРЅР°СЏ РєРѕР¶Р° СЃ С‚РµРєСЃС‚СѓСЂРѕР№. РќР°Р¶РјРёС‚Рµ, С‡С‚РѕР±С‹ РІРєР»СЋС‡РёС‚СЊ Р¶СѓСЂРЅР°Р»СЊРЅС‹Р№ РіР»СЏРЅРµС† В«РРґРµР°Р»СЊРЅР°СЏ РєРѕР¶Р°В»'}
            </span>
          </div>
        )}

        {/* РЎРµР»РµРєС‚РѕСЂ РєРѕР»РёС‡РµСЃС‚РІР° РІР°СЂРёР°РЅС‚РѕРІ */}
        {(() => {
          return (
            <div className="variant-count-section">
              <div className="variant-count-title">рџЋЇ РљРѕР»РёС‡РµСЃС‚РІРѕ РІР°СЂРёР°РЅС‚РѕРІ РЅР° РѕРґРЅСѓ РєРѕРјР±РёРЅР°С†РёСЋ</div>
              {totalShots > variantCount && (
                <div style={{fontSize:'0.75rem',color:'var(--gold)',textAlign:'center',marginBottom:8,opacity:0.8}}>
                  РљРѕРјР±РёРЅР°С†РёР№ РїР°СЂР°РјРµС‚СЂРѕРІ Г— {variantCount} РІР°СЂРёР°РЅС‚{variantCount === 1 ? '' : (variantCount < 5 ? 'Р°' : 'РѕРІ')} = <strong>{totalShots} РєР°РґСЂ{totalShots === 1 ? '' : (totalShots < 5 ? 'Р°' : 'РѕРІ')}</strong>
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
                      <span className="variant-count-label">{n === 1 ? 'РІР°СЂРёР°РЅС‚' : (n < 5 ? 'РІР°СЂРёР°РЅС‚Р°' : 'РІР°СЂРёР°РЅС‚РѕРІ')}</span>
                      <span className="variant-count-credits">{total} {total === 1 ? 'РєСЂРµРґРёС‚' : (total < 5 ? 'РєСЂРµРґРёС‚Р°' : 'РєСЂРµРґРёС‚РѕРІ')}</span>
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
                ? 'вЃпёЏ Р—Р°РіСЂСѓР·РєР° РІ РѕР±Р»Р°РєРѕ...' 
                : `вњЁ РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ ${totalShots > 1 ? totalShots + ' РєР°РґСЂ' + (totalShots < 5 ? 'Р°' : 'РѕРІ') : 'СЃС‚СѓРґРёР№РЅС‹Р№ РєР°РґСЂ'}`}
            </button>
            <button
              className="auto-catalog-mini-btn"
              onClick={handleAutoCatalog}
              disabled={!garmentUrls.length||isProcessing||isUploading}
              title="РћС‚РїСЂР°РІРёС‚СЊ РІ Auto-Catalog (Batch)"
            >рџЏ­</button>
          </div>
          {totalShots > 20 && (
            <div style={{color:'var(--gold)',fontSize:'0.75rem',textAlign:'center',fontWeight:500}}>
              вљ пёЏ Р’С‹Р±СЂР°РЅРѕ {totalShots} РіРµРЅРµСЂР°С†РёР№. Р›РёРјРёС‚ вЂ” 20 Р·Р° РѕРґРёРЅ СЂР°Р·. РџРѕР¶Р°Р»СѓР№СЃС‚Р°, СЃРЅРёРјРёС‚Рµ РІС‹РґРµР»РµРЅРёРµ СЃ РЅРµРєРѕС‚РѕСЂС‹С… РїР°СЂР°РјРµС‚СЂРѕРІ.
            </div>
          )}
        </div>

        <div className="status-bar">{statusText && <p className={`status-text ${statusType}`}>{statusText}</p>}</div>
      </motion.div>}

      {/* в•ђв•ђв•ђ STATUS BAR for quick mode в•ђв•ђв•ђ */}
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
              вњ• РћС‚РјРµРЅРёС‚СЊ РіРµРЅРµСЂР°С†РёСЋ
            </button>
          )}
        </div>
      )}

      {/* 8Р°. QUICK MODE RESULT вЂ” Photo or Card */}
      {generatedImage && appMode === 'quick' && !quickCardImage && (
        <motion.div className="section result-section quick-hero-result" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{duration:0.5}}>
          <h3>{quickMode === 'ugc' ? 'рџ“± Р¤РѕС‚Рѕ РѕС‚ РїРѕРєСѓРїР°С‚РµР»СЏ' : 'рџ“ё Р’Р°С€Рµ СЃС‚СѓРґРёР№РЅРѕРµ С„РѕС‚Рѕ'}</h3>
          <div className="result-image-wrap" style={{position:'relative'}}>
            <img src={generatedImage} alt={quickMode === 'ugc' ? "Р¤РѕС‚Рѕ РѕС‚ РїРѕРєСѓРїР°С‚РµР»СЏ" : "РЎС‚СѓРґРёР№РЅРѕРµ С„РѕС‚Рѕ"} onClick={() => setLightboxSrc(generatedImage)} style={{cursor:'pointer'}} />
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
            }}>в¬‡пёЏ РЎРєР°С‡Р°С‚СЊ С„РѕС‚Рѕ</button>
          </div>
          {/* Nav between cached results */}
          {Object.keys(quickResults).length > 0 && (
            <div style={{display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap'}}>
              {quickResults.card && (
                <button onClick={() => { setQuickMode('card'); setQuickCardImage(quickResults.card.image); setGeneratedImage(quickResults.card.image); setCardEditHistory(quickResults.card.editHistory || []); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.08)', color: '#ffd700', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>рџ“‹ РљР°СЂС‚РѕС‡РєР°</button>
              )}
              {quickResults.ugc && quickMode !== 'ugc' && (
                <button onClick={() => { setQuickMode('ugc'); setQuickCardImage(null); setGeneratedImage(quickResults.ugc.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>рџ“± UGC</button>
              )}
              {quickResults.photo && quickMode !== 'photo' && (
                <button onClick={() => { setQuickMode('photo'); setQuickCardImage(null); setGeneratedImage(quickResults.photo.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>рџ“ё РЎС‚СѓРґРёР№РЅРѕРµ</button>
              )}
              {quickResults.model && quickMode !== 'model' && (
                <button onClick={() => { setQuickMode('model'); setQuickCardImage(quickResults.model.image); setGeneratedImage(quickResults.model.image); setCardEditHistory(quickResults.model.editHistory || []); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: '#d8b4fe', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>рџ‘¤ РЎ РјРѕРґРµР»СЊСЋ</button>
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
          }}>{quickResults.card && quickMode !== 'card' ? 'в†ђ РќР°Р·Р°Рґ Рє РѕР±Р»РѕР¶РєРµ' : 'в†ђ РќРѕРІР°СЏ РіРµРЅРµСЂР°С†РёСЏ'}</button>
        </motion.div>
      )}

      {/* 8Р°-2. QUICK MODE CARD RESULT вЂ” РєР°СЂС‚РѕС‡РєР° + С‚РµРєСЃС‚РѕРІРѕРµ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ */}
      {quickCardImage && appMode === 'quick' && (
        <motion.div className="section result-section" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{duration:0.5}} style={{maxWidth: 900, margin: '0 auto', padding: '10px 20px'}}>
                    {/* Nav between cached results */}
          {Object.keys(quickResults).filter(k => k !== quickMode && quickResults[k]).length > 0 && (
            <div style={{display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap'}}>
              {quickResults.ugc && quickMode !== 'ugc' && (
                <button onClick={() => { setQuickMode('ugc'); setQuickCardImage(null); setGeneratedImage(quickResults.ugc.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>рџ“± UGC</button>
              )}
              {quickResults.photo && quickMode !== 'photo' && (
                <button onClick={() => { setQuickMode('photo'); setQuickCardImage(null); setGeneratedImage(quickResults.photo.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>рџ“ё РЎС‚СѓРґРёР№РЅРѕРµ</button>
              )}
              {quickResults.model && quickMode !== 'model' && (
                <button onClick={() => { setQuickMode('model'); setQuickCardImage(quickResults.model.image); setGeneratedImage(quickResults.model.image); setCardEditHistory(quickResults.model.editHistory || []); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: '#d8b4fe', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>рџ‘¤ РЎ РјРѕРґРµР»СЊСЋ</button>
              )}
            </div>
          )}

          <div style={{textAlign: 'center', marginBottom: 30}}>
            <h3 style={{fontSize: 28, margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 1}}>рџ”Ґ РћР±Р»РѕР¶РєР° РіРѕС‚РѕРІР°!</h3>
            <p style={{color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 15}}>РљР°СЂС‚РѕС‡РєР° СѓСЃРїРµС€РЅРѕ СЃРіРµРЅРµСЂРёСЂРѕРІР°РЅР°. Р§С‚Рѕ РґРµР»Р°РµРј РґР°Р»СЊС€Рµ?</p>
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
                    вњЏпёЏ РџСЂРёРјРµРЅСЏРµРј РёР·РјРµРЅРµРЅРёСЏ...
                  </div>
                  <div style={{color: 'rgba(255,255,255,0.5)', fontSize: 13}}>
                    РР РїРµСЂРµСЂРёСЃРѕРІС‹РІР°РµС‚ РєР°СЂС‚РѕС‡РєСѓ РїРѕ РІР°С€РµРјСѓ РѕРїРёСЃР°РЅРёСЋ
                  </div>
                </div>
              ) : (
                <img src={quickCardImage} alt="РљР°СЂС‚РѕС‡РєР° С‚РѕРІР°СЂР°" onClick={() => setLightboxSrc(quickCardImage)} style={{cursor:'pointer', width: '100%', height: '100%', objectFit: 'contain', display: 'block'}} />
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
                рџ“Ґ РЎРєР°С‡Р°С‚СЊ HD
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
                рџЄ„ РўРѕС‡РµС‡РЅР°СЏ РїСЂР°РІРєР° (1 РєСЂ.)
              </button>
            </div>
          </div>

          <div style={{display: 'flex', alignItems: 'center', margin: '0 0 30px 0'}}>
            <div style={{flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1))'}}></div>
            <div style={{padding: '0 20px', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2}}>РџСЂРѕРєР°С‡Р°С‚СЊ РєР°СЂС‚РѕС‡РєСѓ РґР»СЏ РўРћРџР°</div>
            <div style={{flex: 1, height: 1, background: 'linear-gradient(-90deg, transparent, rgba(255,255,255,0.1))'}}></div>
          </div>

          {/* UPSELL DASHBOARD */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 40}}>
            
            {/* Widget 1: Funnel */}
            <div style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 28, marginBottom: 12}}>рџ“ё</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>РЎРѕР±СЂР°С‚СЊ РіР°Р»РµСЂРµСЋ (4 СЃР»Р°Р№РґР°)</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                РР РґРѕСЃС‚СЂРѕРёС‚ РІРѕСЂРѕРЅРєСѓ: РєСЂСѓРїРЅС‹Р№ РїР»Р°РЅ, РіР°Р±Р°СЂРёС‚С‹, РёРЅС‚РµСЂСЊРµСЂ. 100% РµРґРёРЅС‹Р№ СЃС‚РёР»СЊ.
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
                          alt={`РЎР»Р°Р№Рґ ${idx+1}`} 
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
                          title="РЎРєР°С‡Р°С‚СЊ"
                        >
                          рџ“Ґ
                        </button>
                        <span style={{position: 'relative', zIndex: 1, color: '#fff', fontSize: 9, fontWeight: 600, padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%'}}>
                          {idx === 0 ? 'РћР±Р»РѕР¶РєР°' : idx === 1 ? 'Р”РµС‚Р°Р»Рё' : idx === 2 ? 'Р Р°Р·РјРµСЂС‹' : 'Lifestyle'}
                        </span>
                        {isActive && (
                          <div style={{position: 'absolute', top: 4, left: 4, background: '#ffd700', color: '#000', fontSize: 7, fontWeight: 900, padding: '1px 3px', borderRadius: 3, textTransform: 'uppercase', zIndex: 10}}>РђРєС‚РёРІРµРЅ</div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  [
                    { title: 'РћР±Р»РѕР¶РєР°', src: '/examples/gallery/slide1_cover.png' },
                    { title: 'Р”РµС‚Р°Р»Рё', src: '/examples/gallery/slide2_detail.png' },
                    { title: 'Р Р°Р·РјРµСЂС‹', src: '/examples/gallery/slide3_size.png' },
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
                    рџ‘ЃпёЏ РџСЂРѕСЃРјРѕС‚СЂ
                  </button>
                  <button 
                    onClick={() => triggerConfirm('gallery', 5, handleGenerateGallery)}
                    style={{background: 'rgba(255,215,0,0.08)', color: '#ffd700', border: '1px solid rgba(255,215,0,0.3)', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.18)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.08)'}}
                    title="РџРµСЂРµСЃРѕР·РґР°С‚СЊ РіР°Р»РµСЂРµСЋ"
                  >
                    рџ”„
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
                  {isGalleryGenerating ? 'вЏі РЎРѕР·РґР°С‘Рј...' : <>РЎРѕР·РґР°С‚СЊ Р·Р° 5 РєСЂ. <span style={{textDecoration: 'line-through', opacity: 0.5, fontSize: 11, marginLeft: 6, fontWeight: 400}}>8 РєСЂ.</span></>}
                </button>
              )}
            </div>

            {/* Widget 3: A/B Test */}
            <div style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 28, marginBottom: 12}}>вљ–пёЏ</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>РќР°Р№С‚Рё Р»СѓС‡С€РёР№ CTR (A/B РўРµСЃС‚)</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                РќРµ РіР°РґР°Р№С‚Рµ. РР СЃРіРµРЅРµСЂРёСЂСѓРµС‚ 2 Р°Р»СЊС‚РµСЂРЅР°С‚РёРІРЅС‹Рµ РѕР±Р»РѕР¶РєРё СЃ РґСЂСѓРіРёРјРё С…СѓРєР°РјРё Рё РєРѕРјРїРѕР·РёС†РёРµР№.
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
                          alt={`Р’Р°СЂРёР°РЅС‚ ${idx === 0 ? 'A' : 'B'}`} 
                          style={{width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer'}} 
                          onClick={() => {
                            setQuickCardImage(img);
                            setGeneratedImage(img);
                            setQuickMode('card');
                            setQuickResults(prev => ({
                              ...prev, 
                              card: { image: img, editHistory: [{ image: img, editText: `Р’С‹Р±СЂР°РЅ РІР°СЂРёР°РЅС‚ ${idx === 0 ? 'A' : 'B'}` }] }
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
                          title="РЎРєР°С‡Р°С‚СЊ"
                        >
                          рџ“Ґ
                        </button>
                        {isActive && (
                          <div style={{position: 'absolute', bottom: 4, left: 4, right: 4, background: '#ffd700', color: '#000', fontSize: 7, fontWeight: 900, padding: '1px 0', borderRadius: 3, textTransform: 'uppercase', textAlign: 'center', zIndex: 10}}>РђРєС‚РёРІРµРЅ</div>
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
                    вљ–пёЏ РЎСЂР°РІРЅРёС‚СЊ
                  </button>
                  <button 
                    onClick={() => triggerConfirm('ab', 2, handleGenerateABTest)}
                    style={{background: 'rgba(255,255,255,0.03)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}}
                    title="РџРµСЂРµСЃРѕР·РґР°С‚СЊ A/B РўРµСЃС‚"
                  >
                    рџ”„
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
                  {isAbGenerating ? 'вЏі РЎРѕР·РґР°С‘Рј...' : 'РЎРѕР·РґР°С‚СЊ Р·Р° 2 РєСЂ.'}
                </button>
              )}
            </div>

            {/* Widget 2: Video */}
            <div style={{background: 'linear-gradient(145deg, rgba(167, 139, 250, 0.08) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(167, 139, 250, 0.2)', borderRadius: 20, padding: 24, position: 'relative', display: 'flex', flexDirection: 'column'}}>
              <div style={{position: 'absolute', top: 20, right: 20, background: 'rgba(167, 139, 250, 0.2)', color: '#d8b4fe', fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 6, textTransform: 'uppercase', border: '1px solid rgba(167, 139, 250, 0.3)'}}>РўСЂРµРЅРґ 2026</div>
              <div style={{fontSize: 28, marginBottom: 12}}>рџЋ¬</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>РћР¶РёРІРёС‚СЊ РІ Р’РёРґРµРѕРѕР±Р»РѕР¶РєСѓ</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                РђР»РіРѕСЂРёС‚РјС‹ WB РѕР±РѕР¶Р°СЋС‚ Motion. Р”РѕР±Р°РІРёРј 3D-РїР°СЂР°Р»Р»Р°РєСЃ, РёРіСЂСѓ СЃРІРµС‚Р° Рё Р°РЅРёРјР°С†РёСЋ РЈРўРџ.
              </p>
              <button 
                onClick={() => triggerConfirm('video', 4, () => { setStatusText('рџЋ¬ Р’РёРґРµРѕРіРµРЅРµСЂР°С†РёСЏ СЃРєРѕСЂРѕ Р±СѓРґРµС‚ РґРѕСЃС‚СѓРїРЅР°! РњС‹ СѓР¶Рµ СЂР°Р±РѕС‚Р°РµРј РЅР°Рґ СЌС‚РёРј.'); setStatusType('processing'); })}
                style={{width: '100%', background: 'rgba(167, 139, 250, 0.15)', color: '#d8b4fe', border: '1px solid rgba(167, 139, 250, 0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto'}}
                onMouseEnter={e => {e.currentTarget.style.background = 'rgba(167, 139, 250, 0.25)'}}
                onMouseLeave={e => {e.currentTarget.style.background = 'rgba(167, 139, 250, 0.15)'}}
              >
                РЎРѕР·РґР°С‚СЊ РІРёРґРµРѕ Р·Р° 4 РєСЂ.
              </button>
            </div>

            {/* Widget 4: UGC Photo */}
            <div style={{background: 'linear-gradient(145deg, rgba(34, 197, 94, 0.08) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 28, marginBottom: 12}}>рџ“±</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>Р¤РѕС‚Рѕ РѕС‚ РїРѕРєСѓРїР°С‚РµР»РµР№</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                Р РµР°Р»РёСЃС‚РёС‡РЅС‹Рµ С„РѕС‚Рѕ С‚РѕРІР°СЂР° РІ РґРѕРјР°С€РЅРµР№ РёР»Рё РµСЃС‚РµСЃС‚РІРµРЅРЅРѕР№ РѕР±СЃС‚Р°РЅРѕРІРєРµ вЂ” РєР°Рє РёР· РѕС‚Р·С‹РІРѕРІ.
              </p>
              {quickResults.ugc ? (
                <div style={{display: 'flex', gap: 8, marginTop: 'auto'}}>
                  <button 
                    onClick={() => { setQuickMode('ugc'); setQuickCardImage(null); setGeneratedImage(quickResults.ugc.image); setCardEditHistory([]); }}
                    style={{flex: 1, background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.35)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'}}
                  >
                    рџ“± РџРѕРєР°Р·Р°С‚СЊ
                  </button>
                  <button 
                    onClick={() => triggerConfirm('ugc', 1, () => handleQuickGenerate('ugc'))}
                    style={{background: 'rgba(34, 197, 94, 0.08)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.08)'}}
                    title="РЎРѕР·РґР°С‚СЊ РЅРѕРІРѕРµ UGC-С„РѕС‚Рѕ"
                  >
                    рџ”„
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => triggerConfirm('ugc', 1, () => handleQuickGenerate('ugc'))}
                  style={{width: '100%', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto'}}
                  onMouseEnter={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.25)'}}
                  onMouseLeave={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'}}
                >
                  РЎРѕР·РґР°С‚СЊ Р·Р° 1 РєСЂ.
                </button>
              )}
            </div>

          </div>

          {/* EDIT PANEL (Hidden by default, shown via button) */}
          <div id="edit-panel" style={{display: 'none', background: 'rgba(255,255,255,0.02)', borderRadius: 24, padding: '24px', border: '1px dashed rgba(255,255,255,0.1)', marginBottom: 40}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
              <div style={{fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.95)'}}>
                рџЄ„ РўРѕС‡РµС‡РЅР°СЏ РїСЂР°РІРєР°
              </div>
              <button 
                onClick={() => document.getElementById('edit-panel').style.display = 'none'}
                style={{background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 24, padding: '0 10px'}}
              >Г—</button>
            </div>
            <p style={{fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px 0', lineHeight: '1.5'}}>
              РћРїРёС€РёС‚Рµ С‚РµРєСЃС‚РѕРј, С‡С‚Рѕ РЅСѓР¶РЅРѕ РёР·РјРµРЅРёС‚СЊ. РљР°Р¶РґР°СЏ РїСЂР°РІРєР° СЃС‚РѕРёС‚ <strong style={{color:'#ffd700'}}>1 РєСЂРµРґРёС‚</strong>.
            </p>
            <div style={{display:'flex', flexDirection: 'column', gap: 16}}>
              <textarea
                className="modifier-input"
                rows={3}
                placeholder="РќР°РїСЂРёРјРµСЂ: В«РЈР±РµСЂРё С‚РµРєСЃС‚ СЃРїСЂР°РІР° РІРІРµСЂС…СѓВ» РёР»Рё В«РЎРґРµР»Р°Р№ С„РѕРЅ С‚РµРјРЅРµРµВ»"
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
                  {isCardEditing ? 'вЏі РџСЂРёРјРµРЅСЏРµРј...' : 'рџ”„ РџСЂРёРјРµРЅРёС‚СЊ вЂ” 1 РєСЂ.'}
                </button>
              </div>
            </div>

            {/* Edit history */}
            {cardEditHistory.length > 1 && (
              <div style={{marginTop: 24}}>
                <div style={{fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12}}>РСЃС‚РѕСЂРёСЏ РїСЂР°РІРѕРє</div>
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
                      {idx === 0 ? 'рџЋЁ РћСЂРёРіРёРЅР°Р»' : `v${idx + 1}: ${entry.editText.substring(0, 25)}${entry.editText.length > 25 ? '...' : ''}`}
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
              РЎР±СЂРѕСЃРёС‚СЊ Рё РЅР°С‡Р°С‚СЊ Р·Р°РЅРѕРІРѕ СЃ РґСЂСѓРіРёРј С„РѕС‚Рѕ
            </button>
          </div>

        </motion.div>
      )}

      {/* 8Р±. Р Р•Р—РЈР›Р¬РўРђРў вЂ” СЂРµР¶РёРјС‹ РћРґРµР¶РґР° / РџСЂРµРґРјРµС‚РєР° */}
      <AnimatePresence>
        {generatedImage && appMode !== 'quick' && (
          <motion.div key="result-section" className="section result-section" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:0.5}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
              <h3 style={{margin:0}}>Р¤РёРЅР°Р»СЊРЅС‹Р№ Р РµРЅРґРµСЂ</h3>
              <button
                onClick={() => {
                  setGeneratedImage(null);
                  setImageHistory([]);
                  setHistoryIndex(0);
                  localStorage.removeItem('vton_generatedImage');
                }}
                title="Р—Р°РєСЂС‹С‚СЊ СЂРµРЅРґРµСЂ"
                style={{background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', fontSize:'16px', color:'rgba(255,255,255,0.6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.2s'}}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,80,80,0.25)'; e.currentTarget.style.color='#ff6060'; e.currentTarget.style.borderColor='rgba(255,80,80,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; }}
              >вњ•</button>
            </div>
            <div className="result-image-wrap" style={{position:'relative'}}>
              {/* в†ђ Previous render */}
              {imageHistory.length > 1 && historyIndex > 0 && (
                <button
                  className="history-nav-btn history-prev"
                  onClick={(e) => { e.stopPropagation(); const ni = historyIndex - 1; setHistoryIndex(ni); setGeneratedImage(imageHistory[ni].image); }}
                  title="РџСЂРµРґС‹РґСѓС‰РёР№ РІР°СЂРёР°РЅС‚"
                >вЂ№</button>
              )}
              <img src={generatedImage} alt="VTON" onClick={() => setLightboxSrc(generatedImage)} style={{cursor:'pointer'}} />
              {/* в†’ Next render */}
              {imageHistory.length > 1 && historyIndex < imageHistory.length - 1 && (
                <button
                  className="history-nav-btn history-next"
                  onClick={(e) => { e.stopPropagation(); const ni = historyIndex + 1; setHistoryIndex(ni); setGeneratedImage(imageHistory[ni].image); }}
                  title="РЎР»РµРґСѓСЋС‰РёР№ РІР°СЂРёР°РЅС‚"
                >вЂє</button>
              )}
            </div>
            {imageHistory.length > 1 && (
              <div className="history-info">
                <p className="history-counter">{historyIndex + 1} / {imageHistory.length}</p>
                {imageHistory[historyIndex]?.label && (
                  <p className="history-label">вњЏпёЏ {imageHistory[historyIndex].label}</p>
                )}
              </div>
            )}
            <p className="touch-zoom-hint">рџ‘† РќР°Р¶РјРёС‚Рµ РЅР° С„РѕС‚Рѕ РґР»СЏ СѓРІРµР»РёС‡РµРЅРёСЏ</p>
            <div className="result-actions">
              <button className="download-btn" onClick={handleDownload}>в¬‡пёЏ РЎРєР°С‡Р°С‚СЊ</button>
              {/* РљР°Р»РёР±СЂРѕРІРєР° Рё В«РџРµСЂРµРѕРґРµС‚СЊВ» вЂ” С‚РѕР»СЊРєРѕ РєРѕРіРґР° РµСЃС‚СЊ С‡РµР»РѕРІРµРє-РјРѕРґРµР»СЊ */}
              {(appMode === 'fashion' || (appMode === 'product' && productWithModel)) && (
                <button className="save-model-btn" onClick={() => openCalibration('save')}>рџЋЇ РЎРѕС…СЂР°РЅРёС‚СЊ РјРѕРґРµР»СЊ (РєР°Р»РёР±СЂРѕРІРєР°)</button>
              )}
              {appMode === 'fashion' ? (
                <button
                  className="redress-btn has-tooltip"
                  onClick={handleGenerate}
                  disabled={isProcessing}
                  data-tooltip="Р’РµСЂРЅСѓС‚СЊ РѕРґРµР¶РґСѓ РІ РёСЃС…РѕРґРЅС‹Р№ РІРёРґ"
                >рџ‘— РџРµСЂРµРѕРґРµС‚СЊ РјРѕРґРµР»СЊ</button>
              ) : (
                <button
                  className="redress-btn has-tooltip"
                  onClick={handleGenerate}
                  disabled={isProcessing}
                  data-tooltip="РџРµСЂРµРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ СЃ С‚РµРєСѓС‰РёРјРё РЅР°СЃС‚СЂРѕР№РєР°РјРё"
                >рџ”„ РќРѕРІС‹Р№ РІР°СЂРёР°РЅС‚</button>
              )}
            </div>

            {/* CARD DESIGNER CTA вЂ” removed from results, lives in "Р’ РґРІР° РєР»РёРєР°" mode only */}

            {/* Iterative editing */}
            <div className="shot-modifier-block">
              <div className="shot-modifier-label">
                {appMode === 'product' ? 'вњЏпёЏ РҐРѕС‚РёС‚Рµ С‡С‚Рѕ-С‚Рѕ РёР·РјРµРЅРёС‚СЊ РІ РєР°РґСЂРµ?' : 'вњЏпёЏ РҐРѕС‚РёС‚Рµ С‡С‚Рѕ-С‚Рѕ РёР·РјРµРЅРёС‚СЊ РІ РєР°РґСЂРµ?'}
              </div>
              <textarea className="modifier-input" rows={2} placeholder={
                appMode === 'product'
                  ? 'РќР°РїСЂРёРјРµСЂ: СЃРґРµР»Р°С‚СЊ С„РѕРЅ С‚РµРјРЅРµРµ, РґРѕР±Р°РІРёС‚СЊ Р±Р»РёРєРё, СѓР±СЂР°С‚СЊ С‚РµРЅРё, РїРѕРІРµСЂРЅСѓС‚СЊ С‚РѕРІР°СЂ'
                  : 'РќР°РїСЂРёРјРµСЂ: СЃРґРµР»Р°С‚СЊ РјРѕРґРµР»СЊ РІС‹С€Рµ, РёР·РјРµРЅРёС‚СЊ С†РІРµС‚ РІРѕР»РѕСЃ, РґРѕР±Р°РІРёС‚СЊ РѕС‡РєРё, СѓР±СЂР°С‚СЊ С‚РµРЅРё'
              }
                value={shotModifier} onChange={e => setShotModifier(e.target.value)} />
              <button className="modifier-regen-btn" onClick={handleRegenerate} disabled={!shotModifier.trim() || isProcessing}>
                рџ”„ Р’РЅРµСЃС‚Рё РёР·РјРµРЅРµРЅРёСЏ
              </button>
            </div>

            {/* Photoshoot */}
            <div className="photoshoot-block">
              <div className="photoshoot-label">{appMode === 'product' ? 'рџ“ё РЎРґРµР»Р°С‚СЊ СЂР°СЃРєР°РґСЂРѕРІРєСѓ' : 'рџ“ё РЎРґРµР»Р°С‚СЊ С„РѕС‚РѕСЃРµСЃСЃРёСЋ'}</div>
              <p className="photoshoot-hint">
                {appMode === 'product'
                  ? 'Р“РµРЅРµСЂР°С†РёСЏ РЅРµСЃРєРѕР»СЊРєРёС… С„РѕС‚Рѕ С‚РѕРІР°СЂР° СЃ СЂР°Р·РЅС‹С… СЂР°РєСѓСЂСЃРѕРІ Рё РєРѕРјРїРѕР·РёС†РёР№'
                  : 'Р“РµРЅРµСЂР°С†РёСЏ РЅРµСЃРєРѕР»СЊРєРёС… С„РѕС‚Рѕ СЃ СЂР°Р·РЅС‹С… СЂР°РєСѓСЂСЃРѕРІ'}
              </p>
              <p className="photoshoot-hint" style={{fontSize:'0.72rem', opacity:0.6, marginTop:2}}>
                {appMode === 'product'
                  ? 'рџ“¦ Р¤РѕС‚Рѕ С‚РѕРІР°СЂР° Р±РµСЂС‘С‚СЃСЏ РёР· Р·Р°РіСЂСѓР¶РµРЅРЅС‹С… РІР°РјРё С„РѕС‚Рѕ, РЅРµ РёР· СЃРіРµРЅРµСЂРёСЂРѕРІР°РЅРЅРѕРіРѕ РєР°РґСЂР°'
                  : 'рџ‘• РћРґРµР¶РґР° Р±РµСЂС‘С‚СЃСЏ РёР· Р·Р°РіСЂСѓР¶РµРЅРЅС‹С… РІР°РјРё С„РѕС‚Рѕ, РЅРµ РёР· СЃРіРµРЅРµСЂРёСЂРѕРІР°РЅРЅРѕРіРѕ РєР°РґСЂР°'}
              </p>

              {/* Calibration prompt вЂ” С‚РѕР»СЊРєРѕ РµСЃР»Рё РµСЃС‚СЊ С‡РµР»РѕРІРµРє-РјРѕРґРµР»СЊ */}
              {(appMode === 'fashion' || (appMode === 'product' && productWithModel)) && !selectedSavedModelId && !(appMode === 'product' && !productWithModel) && (
                <div className="calibration-prompt">
                  <p className="calibration-prompt-text">рџ’Ў Р”Р»СЏ РјР°РєСЃРёРјР°Р»СЊРЅРѕР№ РєРѕРЅСЃРёСЃС‚РµРЅС‚РЅРѕСЃС‚Рё Р»РёС†Р° СЂРµРєРѕРјРµРЅРґСѓРµРј СЃРЅР°С‡Р°Р»Р° <strong>РѕС‚РєР°Р»РёР±СЂРѕРІР°С‚СЊ РјРѕРґРµР»СЊ</strong></p>
                  <button className="calib-prompt-btn" onClick={() => openCalibration('photoshoot')}>
                    рџЋЇ РћС‚РєР°Р»РёР±СЂРѕРІР°С‚СЊ РјРѕРґРµР»СЊ
                  </button>
                </div>
              )}

              <div className="photoshoot-choice">
                <button className="photoshoot-btn photoshoot-btn--3" onClick={() => handlePhotoshoot(3)} disabled={isPhotoshooting || isProcessing}>
                  {isPhotoshooting ? 'вЏі Р“РµРЅРµСЂР°С†РёСЏ...' : photoshootImages.filter(Boolean).length > 0 ? `рџ“· РµС‰С‘ +3` : 'рџ“· 3 С„РѕС‚Рѕ'}
                </button>
                <button className="photoshoot-btn photoshoot-btn--5" onClick={() => handlePhotoshoot(5)} disabled={isPhotoshooting || isProcessing}>
                  {isPhotoshooting ? 'вЏі Р“РµРЅРµСЂР°С†РёСЏ...' : photoshootImages.filter(Boolean).length > 0 ? `рџ“ё РµС‰С‘ +5` : 'рџ“ё 5 С„РѕС‚Рѕ'}
                </button>
              </div>
            </div>

            {/* Photoshoot gallery */}
            {photoshootImages.length > 0 && (
              <div className="photoshoot-gallery">
                <h4>рџ“· Р“Р°Р»РµСЂРµСЏ С„РѕС‚РѕСЃРµСЃСЃРёРё</h4>
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
                          <img src={displayImg} alt={`РљР°РґСЂ ${i+1}`} onClick={() => {
                            const gallery = hasEdits ? versions : photoshootImages;
                            openLightboxGallery(gallery, hasEdits ? viewIdx : i);
                          }} style={{cursor:'pointer'}} />
                          {isEditing && (
                            <div className="photo-editing-overlay">
                              <div className="processing-spinner" style={{width:28,height:28}} />
                              <span>Р РµРґР°РєС‚РёСЂСѓРµС‚СЃСЏ...</span>
                            </div>
                          )}
                          {hasEdits && (
                            <>
                              <span className="photo-edited-badge">вњЁ РР·РјРµРЅРµРЅРѕ ({versions.length - 1})</span>
                              <div className="photo-history-nav">
                                <button className="photo-history-btn" disabled={viewIdx <= 0} onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoViewIdx(prev => ({ ...prev, [i]: viewIdx - 1 }));
                                }}>вЂ№</button>
                                <span className="photo-history-counter">{viewIdx + 1}/{versions.length}</span>
                                <button className="photo-history-btn" disabled={viewIdx >= versions.length - 1} onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoViewIdx(prev => ({ ...prev, [i]: viewIdx + 1 }));
                                }}>вЂє</button>
                              </div>
                            </>
                          )}
                          <button className="edit-mini-btn" title="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ СЌС‚РѕС‚ РєР°РґСЂ" onClick={(e) => {
                            e.stopPropagation();
                            setEditingPhotoIdx(i);
                            setPhotoEditText('');
                          }}>вњЏпёЏ</button>
                          <div className="download-mini-wrapper">
                            <button className="download-mini-btn" onClick={(e) => {
                              e.stopPropagation();
                              if (hasEdits) {
                                setDownloadMenuIdx(downloadMenuIdx === i ? null : i);
                              } else {
                                const a = document.createElement('a'); a.href = displayImg; a.download = `SellerStudio_${i+1}_${Date.now()}.jpg`; a.click();
                              }
                            }}>в¬‡пёЏ</button>
                            {downloadMenuIdx === i && hasEdits && (
                              <div className="download-menu">
                                <button onClick={(e) => {
                                  e.stopPropagation();
                                  const a = document.createElement('a'); a.href = versions[versions.length - 1]; a.download = `SellerStudio_${i+1}_latest_${Date.now()}.jpg`; a.click();
                                  setDownloadMenuIdx(null);
                                }}>рџ“ё РџРѕСЃР»РµРґРЅСЋСЋ РІРµСЂСЃРёСЋ</button>
                                <button onClick={(e) => {
                                  e.stopPropagation();
                                  versions.forEach((v, vi) => {
                                    setTimeout(() => {
                                      const a = document.createElement('a'); a.href = v; a.download = `SellerStudio_${i+1}_v${vi+1}_${Date.now()}.jpg`; a.click();
                                    }, vi * 300);
                                  });
                                  setDownloadMenuIdx(null);
                                }}>рџ“¦ Р’СЃРµ РІРµСЂСЃРёРё ({versions.length})</button>
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
        <a href="/offer" target="_blank" rel="noreferrer">РџСѓР±Р»РёС‡РЅР°СЏ РѕС„РµСЂС‚Р°</a>
      </footer>

      {/* OVERLAYS */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div className="processing-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <button className="processing-close-btn" onClick={() => setIsProcessing(false)} title="РЎРєСЂС‹С‚СЊ">вњ•</button>
            <div style={{width:'90%', maxWidth:480}}>
              <TerminalOfMagic isActive={isProcessing} customMessage={processingMsg} />
              <p className="processing-hint" style={{textAlign:'center', marginTop:12}}>РћР±С‹С‡РЅРѕ 30СЃ вЂ” 2 РјРёРЅ</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* РњРћР”РђР›РљРђ: Р›РѕРєР°С†РёСЏ */}
      <AnimatePresence>
        {showLocModal && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowLocModal(false)}>
            <motion.div className="modal-content" initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} onClick={e=>e.stopPropagation()}>
              <div className="modal-title">рџ“Ќ РћС†РёС„СЂРѕРІР°С‚СЊ Р»РѕРєР°С†РёСЋ</div>
              <input className="modal-input" placeholder="РќР°Р·РІР°РЅРёРµ (РЅР°РїСЂ. РЎС‚СѓРґРёСЏ Р’РµР»РµСЃ)" value={locName} onChange={e=>setLocName(e.target.value)} />
              <div className="drop-zone" onClick={()=>locFileRef.current?.click()}
                onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add('dragging');}}
                onDragLeave={e=>e.currentTarget.classList.remove('dragging')}
                onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');handleLocFiles(e.dataTransfer.files);}}>
                <input type="file" accept="image/*" multiple ref={locFileRef} style={{display:'none'}} onChange={e=>handleLocFiles(e.target.files)} />
                <p className="drop-zone-text">рџ“ё РџРµСЂРµС‚Р°С‰РёС‚Рµ РёР»Рё РЅР°Р¶РјРёС‚Рµ</p>
                <p className="drop-zone-hint">2-5 С„РѕС‚РѕРіСЂР°С„РёР№ Р»РѕРєР°С†РёРё СЃ СЂР°Р·РЅС‹С… СЂР°РєСѓСЂСЃРѕРІ</p>
                {locPreviews.length>0 && <div className="drop-zone-previews">{locPreviews.map((p,i)=><img key={i} src={p} alt="" style={{cursor:'zoom-in'}} onClick={(e) => { e.stopPropagation(); setLightboxSrc(p); }} />)}</div>}
              </div>
              <div className="modal-actions">
                <button className="modal-btn-cancel" onClick={()=>{setShowLocModal(false);setLocName('');setLocPreviews([]);}}>РћС‚РјРµРЅР°</button>
                <button className="modal-btn-primary" onClick={saveLoc} disabled={!locName.trim()||locPreviews.length<2}>РЎРѕС…СЂР°РЅРёС‚СЊ</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Р’РР—РђР Р”: РЎРѕР·РґР°РЅРёРµ РїРµСЂСЃРѕРЅР°Р¶Р° */}
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

      {/* РњРћР”РђР›РљРђ: LoRA РјРѕРґРµР»СЊ */}
      <AnimatePresence>
        <LoraModal show={showLoraModal} onClose={()=>{setShowLoraModal(false);setLoraName('');setLoraPhotos({front:null,left34:null,right34:null,fullbody:null});}}
          onSave={saveLoraModel} loraName={loraName} setLoraName={setLoraName} loraPhotos={loraPhotos} setLoraPhotos={setLoraPhotos}
          authHeaders={(() => { const t = user?.accessToken; return t ? { Authorization: 'Bearer ' + t } : {}; })()} />
      </AnimatePresence>

      {/* РњРћР”РђР›РљРђ: РЎРѕС…СЂР°РЅРёС‚СЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°РЅРЅСѓСЋ РјРѕРґРµР»СЊ */}
      <AnimatePresence>
        {showSaveModelModal && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowSaveModelModal(false)}>
            <motion.div className="modal-content" initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} onClick={e=>e.stopPropagation()}>
              <div className="modal-title">в­ђ РЎРѕС…СЂР°РЅРёС‚СЊ РР-РјРѕРґРµР»СЊ</div>
              <p className="modal-hint">Р”Р°Р№С‚Рµ РёРјСЏ СЌС‚РѕР№ РјРѕРґРµР»Рё РґР»СЏ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ РІ Р±СѓРґСѓС‰РёС… РіРµРЅРµСЂР°С†РёСЏС…</p>
              <input className="modal-input" placeholder="РќР°РїСЂРёРјРµСЂ: РђР»РёРЅР°, СЂС‹Р¶Р°СЏ" value={saveModelName} onChange={e=>setSaveModelName(e.target.value)} />
              <div className="modal-actions">
                <button className="modal-btn-cancel" onClick={()=>{setShowSaveModelModal(false);setSaveModelName('');}}>РћС‚РјРµРЅР°</button>
                <button className="modal-btn-primary" onClick={saveGenModel} disabled={!saveModelName.trim()}>РЎРѕС…СЂР°РЅРёС‚СЊ</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX with gallery navigation */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div className="lightbox-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <button className="lightbox-close" onClick={() => { setLightboxSrc(null); setLightboxGallery([]); }}>вњ•</button>
            {lightboxGallery.length > 1 && (
              <button className="lightbox-nav lightbox-nav--prev" onClick={e => {
                e.stopPropagation();
                const newIdx = (lightboxIdx - 1 + lightboxGallery.length) % lightboxGallery.length;
                setLightboxIdx(newIdx); setLightboxSrc(lightboxGallery[newIdx]);
              }}>вЂ№</button>
            )}
            <img src={lightboxSrc} alt="РџСЂРѕСЃРјРѕС‚СЂ" className="lightbox-img" onClick={e => e.stopPropagation()} />
            {lightboxGallery.length > 1 && (
              <button className="lightbox-nav lightbox-nav--next" onClick={e => {
                e.stopPropagation();
                const newIdx = (lightboxIdx + 1) % lightboxGallery.length;
                setLightboxIdx(newIdx); setLightboxSrc(lightboxGallery[newIdx]);
              }}>вЂє</button>
            )}
            <div className="lightbox-footer">
              {lightboxGallery.length > 1 && <span className="lightbox-counter">{lightboxIdx + 1} / {lightboxGallery.length}</span>}
              <button className="lightbox-download" onClick={e => { e.stopPropagation(); const a = document.createElement('a'); a.href = lightboxSrc; a.download = `SellerStudio_${Date.now()}.jpg`; a.click(); }}>в¬‡пёЏ РЎРєР°С‡Р°С‚СЊ</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PHOTO EDITOR MODAL */}
      <AnimatePresence>
        {editingPhotoIdx !== null && photoshootImages[editingPhotoIdx] && (
          <motion.div className="photo-editor-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => { setEditingPhotoIdx(null); setPhotoEditText(''); }}>
            <motion.div className="photo-editor-modal" initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.9, opacity:0}} onClick={e => e.stopPropagation()}>
              <button className="photo-editor-close" onClick={() => { setEditingPhotoIdx(null); setPhotoEditText(''); }}>вњ•</button>
              <div className="photo-editor-preview">
                <img src={photoshootImages[editingPhotoIdx]} alt="Р РµРґР°РєС‚РёСЂСѓРµРјС‹Р№ РєР°РґСЂ" />
                <span className="photo-editor-badge">РљР°РґСЂ {editingPhotoIdx + 1}</span>
              </div>
              <div className="photo-editor-controls">
                <p className="photo-editor-hint">РћРїРёС€РёС‚Рµ, С‡С‚Рѕ РёР·РјРµРЅРёС‚СЊ РІ СЌС‚РѕРј РєР°РґСЂРµ:</p>
                <textarea
                  className="photo-editor-input"
                  placeholder={appMode === 'product'
                    ? 'РЎРґРµР»Р°Р№ С„РѕРЅ С‚РµРјРЅРµРµ, РґРѕР±Р°РІСЊ Р±Р»РёРєРё, СѓР±РµСЂРё С‚РµРЅРё, РїРѕРІРµСЂРЅРё С‚РѕРІР°СЂ...'
                    : 'РЈР±РµСЂРё С‚Р°С‚СѓРёСЂРѕРІРєСѓ, РґРѕР±Р°РІСЊ РѕС‡РєРё, СЃРјРµРЅРё С†РІРµС‚ РІРѕР»РѕСЃ...'}
                  value={photoEditText}
                  onChange={e => setPhotoEditText(e.target.value)}
                  rows={3}
                />
                <div className="photo-editor-quick-tags">
                  {(appMode === 'product'
                    ? ['РЈР±СЂР°С‚СЊ С‚РµРЅРё', 'РЇСЂС‡Рµ СЃРІРµС‚', 'РўРµРјРЅРµРµ С„РѕРЅ', 'Р”РѕР±Р°РІРёС‚СЊ Р±Р»РёРєРё', 'Р”РѕР±Р°РІРёС‚СЊ С‚РµРєСЃС‚СѓСЂСѓ', 'Р”СЂСѓРіРѕР№ СЂР°РєСѓСЂСЃ']
                    : ['РЈР±СЂР°С‚СЊ С‚Р°С‚СѓРёСЂРѕРІРєСѓ', 'Р”РѕР±Р°РІРёС‚СЊ РѕС‡РєРё', 'РЎРјРµРЅРёС‚СЊ С„РѕРЅ', 'РЈР±СЂР°С‚СЊ РїРёСЂСЃРёРЅРі', 'Р”СЂСѓРіР°СЏ РїСЂРёС‡С‘СЃРєР°', 'Р”РѕР±Р°РІРёС‚СЊ СѓР»С‹Р±РєСѓ']
                  ).map(tag => (
                    <button key={tag} className="photo-editor-tag" onClick={() => setPhotoEditText(prev => prev ? `${prev}, ${tag.toLowerCase()}` : tag.toLowerCase())}>{tag}</button>
                  ))}
                </div>
                <button className="photo-editor-submit" onClick={handlePhotoEdit} disabled={!photoEditText.trim()}>
                  вњЁ РџСЂРёРјРµРЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ
                </button>
                <p className="photo-editor-hint" style={{fontSize:'0.7rem', opacity:0.5, textAlign:'center', marginTop:4}}>РњРѕРґР°Р» Р·Р°РєСЂРѕРµС‚СЃСЏ, СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РїРѕР№РґС‘С‚ РІ С„РѕРЅРµ</p>
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
                throw new Error('Р”Р»СЏ СЃРѕР·РґР°РЅРёСЏ РјРѕРґРµР»Рё РЅРµРѕР±С…РѕРґРёРјРѕ Р°РІС‚РѕСЂРёР·РѕРІР°С‚СЊСЃСЏ');
              }
              // РљР°Р»РёР±СЂРѕРІРєР° РјРѕРґРµР»Рё С‚РµРїРµСЂСЊ Р±РµСЃРїР»Р°С‚РЅР°, РєСЂРµРґРёС‚С‹ РЅРµ СЃРїРёСЃС‹РІР°СЋС‚СЃСЏ.
            }}
            modelPrompt={getCurrentModelPrompt()}
            modelRefImages={getCurrentModelRefs()}
            userId={user?.uid}
            getAuthToken={async () => user?.getIdToken?.()}
          />
        )}
      </AnimatePresence>

      {/* в•ђв•ђв•ђ CARD COUNT SELECTION MODAL в•ђв•ђв•ђ */}
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
              <h3 className="card-count-title">рџЋЇ РЎРєРѕР»СЊРєРѕ РєР°СЂС‚РѕС‡РµРє СЃРґРµР»Р°С‚СЊ?</h3>
              <p className="card-count-subtitle">РљР°Р¶РґР°СЏ РєР°СЂС‚РѕС‡РєР° = 1 РєСЂРµРґРёС‚</p>
              <div className="card-count-grid">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    className="card-count-btn"
                    onClick={() => { setCardVariantCount(n); startCardGeneration(n); }}
                  >
                    <span className="card-count-number">{n}</span>
                    <span className="card-count-label">{n === 1 ? 'РєР°СЂС‚РѕС‡РєР°' : (n < 5 ? 'РєР°СЂС‚РѕС‡РєРё' : 'РєР°СЂС‚РѕС‡РµРє')}</span>
                  </button>
                ))}
              </div>
              <div className="card-count-custom">
                <input
                  type="number"
                  min="1"
                  max="20"
                  placeholder="РЎРІРѕС‘ РєРѕР»РёС‡РµСЃС‚РІРѕ"
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
                  РЎРѕР·РґР°С‚СЊ в†’
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* в•ђв•ђв•ђ CARD EXAMPLES MODAL в•ђв•ђв•ђ */}
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
                <h3>РџСЂРёРјРµСЂС‹ РєР°СЂС‚РѕС‡РµРє РґРѕ / РїРѕСЃР»Рµ</h3>
                <button className="card-examples-close" onClick={() => setShowCardExamples(false)}>вњ•</button>
              </div>

              <div className="card-examples-tabs">
                <button
                  className={`card-examples-tab ${cardDesignStyle === 'natural' ? 'active' : ''}`}
                  onClick={() => setCardDesignStyle('natural')}
                >рџЊї Р•СЃС‚РµСЃС‚РІРµРЅРЅР°СЏ</button>
                <button
                  className={`card-examples-tab ${cardDesignStyle === 'epic' ? 'active' : ''}`}
                  onClick={() => setCardDesignStyle('epic')}
                >рџ”Ґ Р­РїРёС‡РЅР°СЏ</button>
              </div>

              <div className="card-examples-grid">
                {/* Glass example */}
                <div className="card-example-pair">
                  <div className="card-example-item">
                    <div className="card-example-label">Р”Рѕ</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-glass-before.jpg' : '/examples/cards/epic-glass-before.jpg'} alt="РЎС‚Р°РєР°РЅ РґРѕ" />
                  </div>
                  <div className="card-example-arrow">в†’</div>
                  <div className="card-example-item">
                    <div className="card-example-label">РџРѕСЃР»Рµ</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-glass-after.png' : '/examples/cards/epic-glass-after.png'} alt="РЎС‚Р°РєР°РЅ РїРѕСЃР»Рµ" />
                  </div>
                </div>

                {/* Pajama example */}
                <div className="card-example-pair">
                  <div className="card-example-item">
                    <div className="card-example-label">Р”Рѕ</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-pajama-before.png' : '/examples/cards/epic-pajama-before.jpg'} alt="РџРёР¶Р°РјР° РґРѕ" />
                  </div>
                  <div className="card-example-arrow">в†’</div>
                  <div className="card-example-item">
                    <div className="card-example-label">РџРѕСЃР»Рµ</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-pajama-after.png' : '/examples/cards/epic-pajama-after.png'} alt="РџРёР¶Р°РјР° РїРѕСЃР»Рµ" />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* РњРћР”РђР›РљРђ: Р”РѕР±Р°РІР»РµРЅРёРµ/Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ РєР°СЃС‚РѕРјРЅРѕРіРѕ С‡РёРїР° */}
      <AnimatePresence>
        {(customChipModalSection || editingChip) && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} 
            onClick={() => { setCustomChipModalSection(null); setEditingChip(null); setNewChipText(''); }}>
            <motion.div className="modal-content" initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} onClick={e=>e.stopPropagation()}>
              <div className="modal-title">
                {editingChip ? 'вњЏпёЏ Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РІР°СЂРёР°РЅС‚' : (
                  customChipModalSection === 'model' ? 'вћ• РЎРІРѕР№ РІР°СЂРёР°РЅС‚ РјРѕРґРµР»Рё' :
                  customChipModalSection === 'pose' ? 'вћ• РЎРІРѕР№ РІР°СЂРёР°РЅС‚ РїРѕР·С‹' :
                  'вћ• РЎРІРѕР№ РІР°СЂРёР°РЅС‚ С„РѕРЅР°'
                )}
              </div>
              <input 
                className="modal-input" 
                autoFocus 
                placeholder={
                  (editingChip?.section || customChipModalSection) === 'model' ? "РќР°РїСЂРёРјРµСЂ: СЂС‹Р¶Р°СЏ РґРµРІСѓС€РєР° РІ РѕС‡РєР°С…..." :
                  (editingChip?.section || customChipModalSection) === 'pose' ? "РќР°РїСЂРёРјРµСЂ: РјРѕРґРµР»СЊ СЃРёРґРёС‚ РЅР° СЃС‚СѓР»Рµ..." :
                  "РќР°РїСЂРёРјРµСЂ: РєРёСЂРїРёС‡РЅР°СЏ СЃС‚РµРЅР°, РЅРµРѕРЅРѕРІС‹Р№ СЃРІРµС‚..."
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
                <button className="modal-btn-cancel" onClick={()=>{ setCustomChipModalSection(null); setEditingChip(null); setNewChipText(''); }}>РћС‚РјРµРЅР°</button>
                <button className="modal-btn-primary" onClick={() => {
                  if (editingChip) saveEditCustomChip();
                  else {
                    addCustomChip(customChipModalSection);
                    setCustomChipModalSection(null);
                  }
                }} disabled={!newChipText.trim()}>
                  {editingChip ? 'РЎРѕС…СЂР°РЅРёС‚СЊ' : 'Р”РѕР±Р°РІРёС‚СЊ'}
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
