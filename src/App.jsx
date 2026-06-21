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
// CardLayerStudio removed РІР‚вЂќ replaced by text-based card editing
import './App.css';

const MSGS = ['Р С’Р Р…Р В°Р В»Р С‘Р В·Р С‘РЎР‚РЎС“Р ВµР С РЎвЂљР ВµР С”РЎРѓРЎвЂљРЎС“РЎР‚РЎС“ РЎвЂљР С”Р В°Р Р…Р С‘...','Р вЂ™РЎвЂ№РЎРѓРЎвЂљР В°Р Р†Р В»РЎРЏР ВµР С РЎРѓРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…РЎвЂ№Р в„– РЎРѓР Р†Р ВµРЎвЂљ...','Р РЋРЎвЂљРЎР‚Р С•Р С‘Р С 3D-Р СР С•Р Т‘Р ВµР В»РЎРЉ РЎвЂћР С‘Р С–РЎС“РЎР‚РЎвЂ№...','Р СњР В°РЎвЂљРЎРЏР С–Р С‘Р Р†Р В°Р ВµР С Р С•Р Т‘Р ВµР В¶Р Т‘РЎС“ РЎРѓ РЎС“РЎвЂЎР ВµРЎвЂљР С•Р С РЎвЂћР С‘Р В·Р С‘Р С”Р С‘...','Р В Р ВµР Р…Р Т‘Р ВµРЎР‚Р С‘Р С РЎвЂћР С‘Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р С”Р В°Р Т‘РЎР‚...'];
const initDetails = () => { const d={}; Object.keys(getModelDetails('female')).forEach(k=>{d[k]=null;}); return d; };

// Safe JSON parser РІР‚вЂќ handles Vercel timeouts that return HTML instead of JSON
const safeParseJSON = async (resp) => {
  // Check HTTP status first
  if (resp.status === 413) {
    console.error('РІС™В РїС‘РЏ 413 Payload Too Large РІР‚вЂќ image files are too big');
    return { success: false, error: 'Р В¤Р В°Р в„–Р В» РЎРѓР В»Р С‘РЎв‚¬Р С”Р С•Р С Р В±Р С•Р В»РЎРЉРЎв‚¬Р С•Р в„–. Р СџР С•Р С—РЎР‚Р С•Р В±РЎС“Р в„–РЎвЂљР Вµ РЎвЂћР С•РЎвЂљР С• Р СР ВµР Р…РЎРЉРЎв‚¬Р ВµР С–Р С• РЎР‚Р В°Р В·Р СР ВµРЎР‚Р В°.' };
  }
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    // Vercel returned HTML error page (timeout/crash)
    console.error('РІС™В РїС‘РЏ Non-JSON response from API:', resp.status, text.substring(0, 200));
    if (text.includes('FUNCTION_INVOCATION_TIMEOUT') || text.includes('An error occurred')) {
      return { success: false, error: 'Р РЋР ВµРЎР‚Р Р†Р ВµРЎР‚ Р Р…Р Вµ РЎС“РЎРѓР С—Р ВµР В» Р С•РЎвЂљР Р†Р ВµРЎвЂљР С‘РЎвЂљРЎРЉ (РЎвЂљР В°Р в„–Р СР В°РЎС“РЎвЂљ). Р СџР С•Р С—РЎР‚Р С•Р В±РЎС“Р в„–РЎвЂљР Вµ Р ВµРЎвЂ°РЎвЂ РЎР‚Р В°Р В·.' };
    }
    return { success: false, error: `Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР ВµРЎР‚Р Р†Р ВµРЎР‚Р В° (${resp.status}). Р СџР С•Р С—РЎР‚Р С•Р В±РЎС“Р в„–РЎвЂљР Вµ Р С—Р С•Р В·Р В¶Р Вµ.` };
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
  const [locBase64Cache, setLocBase64Cache] = useState({}); // id РІвЂ вЂ™ base64 image array
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

  // РІвЂўС’РІвЂўС’РІвЂўС’ CUSTOM CHIP HELPERS РІвЂўС’РІвЂўС’РІвЂўС’
  const IMPROV_POSE = { id: 'improvisation', label: 'Р ВР СР С—РЎР‚Р С•Р Р†Р С‘Р В·Р В°РЎвЂ Р С‘РЎРЏ', emoji: 'СЂСџР‹Р†', prompt: 'random aesthetic fashion pose, natural dynamic body positioning, editorial spontaneous movement, varied creative posture' };

  const addCustomChip = (section) => {
    if (!newChipText.trim()) { setAddingCustom(null); return; }
    const chip = { id: `custom_${Date.now()}`, label: newChipText.trim(), prompt: newChipText.trim(), emoji: 'РІСљРЏРїС‘РЏ', isCustomChip: true };
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
    return 'Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р…Р Р…Р С•Р в„– Р СР С•Р Т‘Р ВµР В»Р С‘';
  };

  // Is multi-model selected? (for showing Р ВР СР С—РЎР‚Р С•Р Р†Р С‘Р В·Р В°РЎвЂ Р С‘РЎРЏ pose)
  const isMultiModel = !customModelPrompt && !selectedSavedModelId && (selectedModels.length + customModelChips.length) > 1;

  // РІвЂўС’РІвЂўС’РІвЂўС’ TOTAL SHOTS CALCULATION РІвЂўС’РІвЂўС’РІвЂўС’
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

  // РІвЂўС’РІвЂўС’РІвЂўС’ CARD DESIGNER (marketplace card) РІвЂўС’РІвЂўС’РІвЂўС’
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
  // [QUICK_MODE_V2] РІР‚вЂќ Card generation + text-based editing
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

  // РІвЂўС’РІвЂўС’РІвЂўС’ LOCALSTORAGE SYNC EFFECTS РІвЂўС’РІвЂўС’РІвЂўС’
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

  // РІвЂўС’РІвЂўС’РІвЂўС’ TELEGRAM BACK BUTTON РІвЂўС’РІвЂўС’РІвЂўС’
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
    
    // Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С Р Т‘Р В°Р Р…Р Р…РЎвЂ№Р Вµ Р С—Р В°РЎР‚Р В°Р В»Р В»Р ВµР В»РЎРЉР Р…Р С• Р С‘ Р В°РЎРѓР С‘Р Р…РЎвЂ¦РЎР‚Р С•Р Р…Р Р…Р С•, Р Р…Р Вµ Р В±Р В»Р С•Р С”Р С‘РЎР‚РЎС“РЎРЏ Р С•РЎвЂљРЎР‚Р С‘РЎРѓР С•Р Р†Р С”РЎС“ Р С‘Р Р…РЎвЂљР ВµРЎР‚РЎвЂћР ВµР в„–РЎРѓР В°
    getModels(user.uid)
      .then((models) => {

        setMyModels(models || []);
      })
      .catch((err) => console.error('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С”Р С‘ Р СР С•Р Т‘Р ВµР В»Р ВµР в„–:', err));

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
          console.log(`СЂСџвЂќвЂћ Migrating ${needsMigration.length} legacy location(s) via Firebase SDK...`);
          const uid = user.uid;
          for (const loc of needsMigration) {
            try {
              // Use Firebase Storage SDK (auth-aware) РІР‚вЂќ bypasses CORS and Storage Rules
              // Strategy 1: Firebase SDK getBytes (auth-aware, bypasses CORS)
              let b64arr = [];
              if (loc.storagePaths && loc.storagePaths.length > 0) {
                b64arr = await Promise.all(
                  loc.storagePaths.slice(0, 5).map(path => downloadStoragePathAsBase64(path))
                );
              }
              // Strategy 2: fallback РІР‚вЂќ direct URL fetch
              if (b64arr.filter(Boolean).length === 0 && loc.imageUrls && loc.imageUrls.length > 0) {
                console.log(`РІвЂ В©РїС‘РЏ SDK failed for '${loc.title}', trying direct URL fetch...`);
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
                console.log(`СЂСџвЂ“ТђРїС‘РЏ Trying server-side migration for '${loc.title}'...`);
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
                      console.log(`РІСљвЂ¦ Server migration succeeded for '${loc.title}' (${data.count} images)`);
                    } else {
                      console.warn(`РІС™В РїС‘РЏ Server migration failed for '${loc.title}':`, data.error);
                    }
                  }
                } catch (srvErr) {
                  console.warn(`РІС™В РїС‘РЏ Server migration request failed:`, srvErr.message);
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
                console.log(`РІСљвЂ¦ Migrated loc '${loc.title}' (${validB64.length} images)`);
              } else {
                console.warn(`РІС™В РїС‘РЏ Could not migrate loc '${loc.title}' РІР‚вЂќ all 3 strategies failed. Files may be permanently inaccessible.`);
              }
            } catch (err) {
              console.warn(`РІС™В РїС‘РЏ Migration failed for loc '${loc.title}':`, err.message);
            }
          }
          console.log('РІСљвЂ¦ Location migration complete');
        }
      })
      .catch((err) => console.error('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С”Р С‘ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р в„–:', err));
    // Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р С—Р С•Р Т‘Р С—Р С‘РЎРѓР С”Р С‘
    // Р СљР С‘Р С–РЎР‚Р В°РЎвЂ Р С‘РЎРЏ legacy-Р С—Р С•Р Т‘Р С—Р С‘РЎРѓР С•Р С” РЎвЂљР ВµР С—Р ВµРЎР‚РЎРЉ Р С—РЎР‚Р С•Р С‘РЎРѓРЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљ Р Р† /api/auth-telegram Р С—РЎР‚Р С‘ Р Р†РЎвЂ¦Р С•Р Т‘Р Вµ,
    // Р С—Р С•РЎРЊРЎвЂљР С•Р СРЎС“ Р В·Р Т‘Р ВµРЎРѓРЎРЉ Р С—РЎР‚Р С•РЎРѓРЎвЂљР С• РЎвЂЎР С‘РЎвЂљР В°Р ВµР С Р С—Р С•Р Т‘Р С—Р С‘РЎРѓР С”РЎС“ Р С—Р С• РЎРѓРЎвЂљР В°Р В±Р С‘Р В»РЎРЉР Р…Р С•Р СРЎС“ UID
    getSubscription(user.uid, user.email, user.telegramId)
      .then((sub) => {
        if (sub) setSubscription(sub);
      })
      .catch((err) => {
        console.error('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С”Р С‘ Р С—Р С•Р Т‘Р С—Р С‘РЎРѓР С”Р С‘:', err);
        setSubscription({ plan: 'none', credits: 0, creditsTotal: 0 });
      });
  }, [user]);

  // Р С›Р В±Р Р…Р С•Р Р†Р В»РЎРЏР ВµРЎвЂљ Р В±Р В°Р В»Р В°Р Р…РЎРѓ Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р† Р С—Р С•РЎРѓР В»Р Вµ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ РІР‚вЂќ Р С—Р ВµРЎР‚Р ВµР С—Р С•Р В»РЎС“РЎвЂЎР В°Р ВµРЎвЂљ Р С—Р С•Р Т‘Р С—Р С‘РЎРѓР С”РЎС“ Р С‘Р В· Firestore
  const refreshCreditsFromResponse = async (_responseData) => {
    if (!user?.uid) return;
    try {
      const fresh = await getSubscription(user.uid, user.email, user.telegramId);
      if (fresh) setSubscription(fresh);
    } catch (_e) {
      // Silent fail РІР‚вЂќ UI balance stays until next reload
    }
  };

  // Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р В° РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•Р в„– Р С•Р С—Р В»Р В°РЎвЂљРЎвЂ№ Р В®Kassa Р С—РЎР‚Р С‘ Р Р†Р С•Р В·Р Р†РЎР‚Р В°РЎвЂљР Вµ Р Р…Р В° РЎРѓР В°Р в„–РЎвЂљ (return_url)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      const plan = params.get('plan') || '';
      setStatusText(`РІРЏС– Р СџР В»Р В°РЎвЂљР ВµР В¶ Р С•Р В±РЎР‚Р В°Р В±Р В°РЎвЂљРЎвЂ№Р Р†Р В°Р ВµРЎвЂљРЎРѓРЎРЏ. Р вЂ™Р В°РЎв‚¬ РЎвЂљР В°РЎР‚Р С‘РЎвЂћ Р’В«${plan.toUpperCase()}Р’В» Р В°Р С”РЎвЂљР С‘Р Р†Р С‘РЎР‚РЎС“Р ВµРЎвЂљРЎРѓРЎРЏ...`);
      setStatusType('success');

      // Р С›РЎвЂЎР С‘РЎвЂ°Р В°Р ВµР С Р С—Р В°РЎР‚Р В°Р СР ВµРЎвЂљРЎР‚РЎвЂ№ Р С‘Р В· Р В°Р Т‘РЎР‚Р ВµРЎРѓР Р…Р С•Р в„– РЎРѓРЎвЂљРЎР‚Р С•Р С”Р С‘ Р В±Р ВµР В· Р С—Р ВµРЎР‚Р ВµР В·Р В°Р С–РЎР‚РЎС“Р В·Р С”Р С‘
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      // Р вЂ”Р В°Р С—РЎС“РЎРѓР С”Р В°Р ВµР С Р С—Р С•Р В»Р В»Р С‘Р Р…Р С– Р С—Р С•Р Т‘Р С—Р С‘РЎРѓР С”Р С‘ Р Р† РЎвЂљР ВµРЎвЂЎР ВµР Р…Р С‘Р Вµ 12 РЎРѓР ВµР С”РЎС“Р Р…Р Т‘
      if (user && user.uid) {
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const sub = await getSubscription(user.uid, user.email, user.telegramId);
            if (sub && sub.plan === plan) {
              setSubscription(sub);
              setStatusText(`РІСљвЂ¦ Р СћР В°РЎР‚Р С‘РЎвЂћ Р’В«${plan.toUpperCase()}Р’В» РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• Р В°Р С”РЎвЂљР С‘Р Р†Р С‘РЎР‚Р С•Р Р†Р В°Р Р…! Р СњР В°РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С• ${sub.credits} Р С”Р В°Р Т‘РЎР‚Р С•Р Р†.`);
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
      // Р РЃР В°Р С– 1: Р РЋР С•Р В·Р Т‘Р В°РЎвЂР С Р С—Р В»Р В°РЎвЂљРЎвЂР В¶Р Р…РЎС“РЎР‹ РЎРѓР ВµРЎРѓРЎРѓР С‘РЎР‹ Р В®Kassa Р Р…Р В° Р В±РЎРЊР С”Р ВµР Р…Р Т‘Р Вµ
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
        throw new Error(invoiceData.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С—Р В»Р В°РЎвЂљР ВµР В¶');
      }

      // Р РЃР В°Р С– 2: Р СџР ВµРЎР‚Р ВµР Р…Р В°Р С—РЎР‚Р В°Р Р†Р В»РЎРЏР ВµР С Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЏ Р Р…Р В° РЎвЂћР С•РЎР‚Р СРЎС“ Р С•Р С—Р В»Р В°РЎвЂљРЎвЂ№ Р В®Kassa
      const paymentUrl = invoiceData.invoiceLink;
      console.log('[Payment] Redirecting to:', paymentUrl);
      
      setShowPricing(false);
      setStatusText('РІРЏС– Р СџР ВµРЎР‚Р ВµР Р…Р В°Р С—РЎР‚Р В°Р Р†Р В»РЎРЏР ВµР С Р Р…Р В° Р В·Р В°РЎвЂ°Р С‘РЎвЂ°Р ВµР Р…Р Р…РЎС“РЎР‹ РЎРѓРЎвЂљРЎР‚Р В°Р Р…Р С‘РЎвЂ РЎС“ Р С•Р С—Р В»Р В°РЎвЂљРЎвЂ№ Р В®Kassa...');
      setStatusType('success');

      if (window.Telegram?.WebApp?.openLink) {
        // Р С›РЎвЂљР С”РЎР‚РЎвЂ№Р Р†Р В°Р ВµР С Р С—Р В»Р В°РЎвЂљР ВµР В¶Р Р…РЎвЂ№Р в„– РЎв‚¬Р В»РЎР‹Р В· Р С—РЎР‚РЎРЏР СР С• Р Р† Telegram
        window.Telegram.WebApp.openLink(paymentUrl);
      } else {
        // Fallback Р Т‘Р В»РЎРЏ Р С•Р В±РЎвЂ№РЎвЂЎР Р…Р С•Р С–Р С• Р Р†Р ВµР В±-Р С‘Р Р…РЎвЂљР ВµРЎР‚РЎвЂћР ВµР в„–РЎРѓР В°
        window.location.href = paymentUrl;
      }
    } catch (err) {
      console.error('[Payment] Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р С•Р С—Р В»Р В°РЎвЂљРЎвЂ№:', err);
      setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${err.message}`);
      setStatusType('error');
    } finally {
      setPricingLoading(false);
    }
  };

  // Disable subscription auto-renew while keeping the paid period active.
  const handleCancelAutoRenew = async () => {
    if (!user) return;
    if (!window.confirm('Р вЂ™РЎвЂ№ Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С‘РЎвЂљР ВµР В»РЎРЉР Р…Р С• РЎвЂ¦Р С•РЎвЂљР С‘РЎвЂљР Вµ Р С•РЎвЂљР С”Р В»РЎР‹РЎвЂЎР С‘РЎвЂљРЎРЉ Р В°Р Р†РЎвЂљР С•Р С—РЎР‚Р С•Р Т‘Р В»Р ВµР Р…Р С‘Р Вµ Р Р†Р В°РЎв‚¬Р ВµР в„– Р С—Р С•Р Т‘Р С—Р С‘РЎРѓР С”Р С‘?')) return;

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
        throw new Error(data.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р С•РЎвЂљР С”Р В»РЎР‹РЎвЂЎР С‘РЎвЂљРЎРЉ Р В°Р Р†РЎвЂљР С•Р С—РЎР‚Р С•Р Т‘Р В»Р ВµР Р…Р С‘Р Вµ');
      }

      setSubscription(prev => ({ ...prev, autoRenew: false }));
      alert('Р С’Р Р†РЎвЂљР С•Р С—РЎР‚Р С•Р Т‘Р В»Р ВµР Р…Р С‘Р Вµ Р С—Р С•Р Т‘Р С—Р С‘РЎРѓР С”Р С‘ Р С•РЎвЂљР С”Р В»РЎР‹РЎвЂЎР ВµР Р…Р С•. Р СћР В°РЎР‚Р С‘РЎвЂћ Р С—РЎР‚Р С•Р Т‘Р С•Р В»Р В¶Р С‘РЎвЂљ Р Т‘Р ВµР в„–РЎРѓРЎвЂљР Р†Р С•Р Р†Р В°РЎвЂљРЎРЉ Р Т‘Р С• Р С”Р С•Р Р…РЎвЂ Р В° Р С•Р С—Р В»Р В°РЎвЂЎР ВµР Р…Р Р…Р С•Р С–Р С• Р С—Р ВµРЎР‚Р С‘Р С•Р Т‘Р В°.');
    } catch (err) {
      console.error('Failed to cancel auto-renew:', err);
      alert(err.message || 'Р СџРЎР‚Р С•Р С‘Р В·Р С•РЎв‚¬Р В»Р В° Р С•РЎв‚¬Р С‘Р В±Р С”Р В° Р С—РЎР‚Р С‘ Р С•РЎвЂљР СР ВµР Р…Р Вµ Р В°Р Р†РЎвЂљР С•Р С—РЎР‚Р С•Р Т‘Р В»Р ВµР Р…Р С‘РЎРЏ');
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

  // Multi-file upload РІР‚вЂќ try Firebase Storage first, fall back to base64
  const handleFilesChange = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newFiles = [...imageFiles, ...files].slice(0, 9);
    setImageFiles(newFiles);
    const localUrls = newFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(localUrls);
    setGeneratedImage(null);
    setStatusText('РІВРѓРїС‘РЏ Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С РЎвЂћР С•РЎвЂљР С•...');
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
          console.warn('РІС™В РїС‘РЏ Storage unavailable, using base64 fallback:', storageErr.message);
          return await fileToBase64(compressed);
        }
      }));
      const allUrls = [...garmentUrls, ...newUrls].slice(0, 9);
      setGarmentUrls(allUrls);
      setStatusText(`Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р ВµР Р…Р С• ${newFiles.length} Р Р†Р ВµРЎвЂ°${newFiles.length === 1 ? 'РЎРЉ' : newFiles.length < 5 ? 'Р С‘' : 'Р ВµР в„–'}. Р вЂ™РЎРѓР Вµ Р В±РЎС“Р Т‘РЎС“РЎвЂљ Р Р…Р В°Р Т‘Р ВµРЎвЂљРЎвЂ№ Р Р…Р В° Р СР С•Р Т‘Р ВµР В»РЎРЉ.`);
    } catch (err) {
      console.error('Upload error:', err);
      setStatusText('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С”Р С‘. Р СџР С•Р С—РЎР‚Р С•Р В±РЎС“Р в„–РЎвЂљР Вµ Р ВµРЎвЂ°РЎвЂ РЎР‚Р В°Р В·.');
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

  // РІвЂўС’РІвЂўС’РІвЂўС’ RUРІвЂ вЂ™EN Prompt Mapping РІР‚вЂќ ULTRA-DETAILED descriptors РІвЂўС’РІвЂўС’РІвЂўС’
  // Each characteristic MUST be described in enough detail that Gemini cannot skip it.
  const DETAIL_TO_PROMPT = {
    // РІвЂќР‚РІвЂќР‚РІвЂќР‚ BODY TYPE (critical РІР‚вЂќ needs strongest overrides) РІвЂќР‚РІвЂќР‚РІвЂќР‚
    'Р ТђРЎС“Р Т‘Р С•РЎвЂ°Р В°Р Р†Р С•Р Вµ': 'BODY TYPE: slim lean body with thin limbs, narrow bony shoulders, visible collarbones and wrist bones, very low body fat, elongated proportions, delicate frame. The person must look noticeably thin.',
    'Р РЋР С—Р С•РЎР‚РЎвЂљР С‘Р Р†Р Р…Р С•Р Вµ': 'BODY TYPE: athletic fit body with visibly toned muscles, defined arms and shoulders, flat toned stomach, healthy skin glow. Body of a person who exercises regularly. NOT overweight, NOT skinny.',
    'Р РЋРЎР‚Р ВµР Т‘Р Р…Р ВµР Вµ': 'BODY TYPE: average normal healthy body build, neither thin nor heavy, standard proportions, BMI 20-25. Natural everyday person, not a fitness model.',
    'Р СџР С•Р В»Р Р…Р С•Р Вµ': 'BODY TYPE: obese plus-size body, BMI 35+, large round fat belly, thick heavy neck, prominent double chin, chubby cheeks, wide thick torso, US clothing size 3XL, heavy-set build with visible body fat and round chubby face. The person MUST look explicitly fat and overweight, not slim.',
    'Р СљРЎС“РЎРѓР С”РЎС“Р В»Р С‘РЎРѓРЎвЂљР С•Р Вµ': 'BODY TYPE: muscular body with clearly visible muscle definition on arms, shoulders, chest and legs. Broad powerful shoulders, narrow waist (V-taper), low body fat 12-18%. Veins visible on forearms. Strong thick neck. The body MUST look like a fitness competitor or bodybuilder РІР‚вЂќ NOT soft, NOT average, NOT overweight.',

    // РІвЂќР‚РІвЂќР‚РІвЂќР‚ HAIR COLOR (specific tones, not generic words) РІвЂќР‚РІвЂќР‚РІвЂќР‚
    'Р вЂРЎР‚РЎР‹Р Р…Р ВµРЎвЂљР С”Р В°': 'HAIR: rich dark brunette brown hair color', 'Р вЂРЎР‚РЎР‹Р Р…Р ВµРЎвЂљ': 'HAIR: rich dark brunette brown hair color',
    'Р РЃР В°РЎвЂљР ВµР Р…Р С”Р В°': 'HAIR: warm chestnut medium-brown hair color with natural highlights', 'Р РЃР В°РЎвЂљР ВµР Р…': 'HAIR: warm chestnut medium-brown hair color with natural highlights',
    'Р вЂР В»Р С•Р Р…Р Т‘Р С‘Р Р…Р С”Р В°': 'HAIR: light golden blonde hair color', 'Р вЂР В»Р С•Р Р…Р Т‘Р С‘Р Р…': 'HAIR: light golden blonde hair color',
    'Р В РЎвЂ№Р В¶Р В°РЎРЏ': 'HAIR: vibrant red-ginger copper hair color (clearly red, not brown)', 'Р В РЎвЂ№Р В¶Р С‘Р в„–': 'HAIR: vibrant red-ginger copper hair color (clearly red, not brown)',
    'Р В§РЎвЂРЎР‚Р Р…РЎвЂ№Р Вµ': 'HAIR: jet black hair color, deep dark without any brown tint',
    'Р РЋР ВµР Т‘РЎвЂ№Р Вµ': 'HAIR: natural silver-gray hair color suggesting age 50+',

    // РІвЂќР‚РІвЂќР‚РІвЂќР‚ HAIR LENGTH (explicit visual description) РІвЂќР‚РІвЂќР‚РІвЂќР‚
    'Р С™Р С•РЎР‚Р С•РЎвЂљР С”Р С‘Р Вµ': 'HAIR LENGTH: short hair above the ears, cropped close to the head',
    'Р РЋРЎР‚Р ВµР Т‘Р Р…Р С‘Р Вµ': 'HAIR LENGTH: medium-length hair reaching the shoulders',
    'Р вЂќР В»Р С‘Р Р…Р Р…РЎвЂ№Р Вµ': 'HAIR LENGTH: long flowing hair reaching well below the shoulders, past the chest',
    'Р вЂРЎР‚Р С‘РЎвЂљР В°РЎРЏ': 'HAIR LENGTH: completely shaved bald head, no hair visible', 'Р вЂРЎР‚Р С‘РЎвЂљРЎвЂ№Р в„–': 'HAIR LENGTH: completely shaved bald head, no hair visible',

    // РІвЂќР‚РІвЂќР‚РІвЂќР‚ EMOTION (describe facial muscles, not abstract feelings) РІвЂќР‚РІвЂќР‚РІвЂќР‚
    'Р СњР ВµР в„–РЎвЂљРЎР‚Р В°Р В»РЎРЉР Р…Р В°РЎРЏ': 'EXPRESSION: neutral calm relaxed face, mouth closed, no smile, eyes looking directly at camera',
    'Р вЂєРЎвЂР С–Р С”Р В°РЎРЏ РЎС“Р В»РЎвЂ№Р В±Р С”Р В°': 'EXPRESSION: gentle slight warm smile with lips slightly curved upward, soft friendly eyes',
    'Р РЋР ВµРЎР‚РЎРЉРЎвЂР В·Р Р…Р В°РЎРЏ': 'EXPRESSION: serious intense focused expression, strong direct eye contact, slight frown, no smile', 'Р РЋР ВµРЎР‚РЎРЉРЎвЂР В·Р Р…РЎвЂ№Р в„–': 'EXPRESSION: serious intense focused expression, strong direct eye contact, slight frown, no smile',
    'Р Р€Р Р†Р ВµРЎР‚Р ВµР Р…Р Р…Р В°РЎРЏ': 'EXPRESSION: confident powerful self-assured expression, chin slightly raised, bold direct gaze, subtle commanding smile', 'Р Р€Р Р†Р ВµРЎР‚Р ВµР Р…Р Р…РЎвЂ№Р в„–': 'EXPRESSION: confident powerful self-assured expression, chin slightly raised, bold direct gaze, subtle commanding smile',
    'Р вЂќР ВµРЎР‚Р В·Р С”Р В°РЎРЏ': 'EXPRESSION: bold edgy rebellious attitude, slightly squinted eyes, smirk, defiant look', 'Р вЂќР ВµРЎР‚Р В·Р С”Р С‘Р в„–': 'EXPRESSION: bold edgy rebellious attitude, slightly squinted eyes, smirk, defiant look',

    // РІвЂќР‚РІвЂќР‚РІвЂќР‚ PIERCING (specific placement and visibility) РІвЂќР‚РІвЂќР‚РІвЂќР‚
    'Р Р€РЎв‚¬Р С‘': 'PIERCING: visible small metallic stud earrings in both earlobes, must be clearly visible',
    'Р СњР С•РЎРѓ': 'PIERCING: visible small subtle nose ring or stud piercing on one nostril, must be clearly visible',
    'Р Р€РЎв‚¬Р С‘ + Р СњР С•РЎРѓ': 'PIERCING: visible metallic stud earrings in both earlobes AND a small nose ring/stud on one nostril РІР‚вЂќ both must be clearly visible',

    // РІвЂќР‚РІвЂќР‚РІвЂќР‚ TATTOO (MANDATORY visibility РІР‚вЂќ these must actually appear) РІвЂќР‚РІвЂќР‚РІвЂќР‚
    'Р СљР С‘Р Р…Р С‘Р СР В°Р В»Р С‘Р В·Р С': 'TATTOO (MANDATORY РІР‚вЂќ MUST BE VISIBLE): small minimalist fine-line black ink tattoos on visible skin areas such as wrists, collarbones, or fingers. The tattoos MUST be clearly visible in the final image.',
    'Р В РЎС“Р С”Р В°Р Р†': 'TATTOO (MANDATORY РІР‚вЂќ MUST BE VISIBLE): full detailed tattoo sleeve covering one entire arm from shoulder to wrist with intricate dark ink artwork. The tattooed arm MUST be clearly visible in the final image.',
    'Р РЃР ВµРЎРЏ': 'TATTOO (MANDATORY РІР‚вЂќ MUST BE VISIBLE): prominent artistic tattoo on the neck/throat area with dark ink design clearly visible against the skin. The neck tattoo MUST be unmistakably present in the final image.',
  };

  // Build detail string (supports arrays for multi-select fields like tattoo)
  const buildDetailString = (detailsOverride) => {
    const parts = [];
    const details = detailsOverride || modelDetails;
    Object.entries(details).forEach(([k, v]) => {
      // EXPLICIT NEGATIVE CONSTRAINTS РІР‚вЂќ when "Р СњР ВµРЎвЂљ" is selected, add hard prohibition
      if (v === 'Р СњР ВµРЎвЂљ' || (Array.isArray(v) && v.length === 1 && v[0] === 'Р СњР ВµРЎвЂљ')) {
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
        const filtered = v.filter(x => x !== 'Р СњР ВµРЎвЂљ');
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

  // РІвЂўС’РІвЂўС’РІвЂўС’ AUTH FETCH: Р Т‘Р С•Р В±Р В°Р Р†Р В»РЎРЏР ВµРЎвЂљ Firebase ID Token Р С”Р С• Р Р†РЎРѓР ВµР С API-Р В·Р В°Р С—РЎР‚Р С•РЎРѓР В°Р С РІвЂўС’РІвЂўС’РІвЂўС’
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

    // РІвЂўС’РІвЂўС’РІвЂўС’ SUBSCRIPTION CHECK РІвЂўС’РІвЂўС’РІвЂўС’
    if (!canGenerate(subscription)) {
      setShowPricing(true);
      setStatusText('РІС™РЋ Р вЂќР В»РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ Р Р…РЎС“Р В¶Р ВµР Р… Р В°Р С”РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р в„– РЎвЂљР В°РЎР‚Р С‘РЎвЂћ'); setStatusType('error');
      return;
    }
    if ((subscription.credits || 0) < totalShots) {
      setStatusText(`РІС™РЋ Р СњР ВµР Т‘Р С•РЎРѓРЎвЂљР В°РЎвЂљР С•РЎвЂЎР Р…Р С• Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р†: Р Р…РЎС“Р В¶Р Р…Р С• ${totalShots}, Р Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р С• ${subscription.credits || 0}`); setStatusType('error');
      return;
    }

    // Р вЂєР С‘Р СР С‘РЎвЂљ 20 Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р в„– Р В·Р В° РЎР‚Р В°Р В·
    if (totalShots > 20) {
      setStatusText('РІС™В РїС‘РЏ Р СџРЎР‚Р ВµР Р†РЎвЂ№РЎв‚¬Р ВµР Р… Р В»Р С‘Р СР С‘РЎвЂљ: Р СР В°Р С”РЎРѓР С‘Р СРЎС“Р С 20 Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р в„– Р В·Р В° РЎР‚Р В°Р В·.'); setStatusType('error');
      return;
    }

    // Р вЂўРЎРѓР В»Р С‘ Р С”Р В°Р Т‘РЎР‚Р С•Р Р† >= 6, Р В·Р В°Р С—РЎР‚Р В°РЎв‚¬Р С‘Р Р†Р В°Р ВµР С Р С—Р С•Р Т‘РЎвЂљР Р†Р ВµРЎР‚Р В¶Р Т‘Р ВµР Р…Р С‘Р Вµ
    if (totalShots >= 6 && !skipConfirm) {
      triggerConfirm('batch', totalShots, () => handleGenerate(true));
      return;
    }

    const runBatchGeneration = async () => {
      setIsProcessing(true); setGeneratedImage(null); setStatusText('');
      setProcessingMsg('Р СџР С•Р Т‘Р С–Р С•РЎвЂљР В°Р Р†Р В»Р С‘Р Р†Р В°Р ВµР С Р С‘РЎРѓРЎвЂ¦Р С•Р Т‘Р Р…Р С‘Р С”Р С‘...');
      
      let msgI = 0;
      const iv = setInterval(() => { 
        if (totalShots === 1) {
          setProcessingMsg(msgI < MSGS.length ? MSGS[msgI++] : 'Р В¤Р С‘Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р Вµ РЎв‚¬РЎвЂљРЎР‚Р С‘РЎвЂ¦Р С‘...'); 
        }
      }, 8000);

      try {
        // Р В¤Р С•РЎР‚Р СР С‘РЎР‚РЎС“Р ВµР С Р С—Р В»Р С•РЎРѓР С”Р С‘Р в„– РЎРѓР С—Р С‘РЎРѓР С•Р С” Р В·Р В°Р Т‘Р В°РЎвЂЎ
        const tasks = [];

        if (appMode === 'product') {
          // Р С™Р С•Р СР С—Р С•Р В·Р С‘РЎвЂ Р С‘Р С‘
          const compsToUse = customPoseText.trim() ? [{ id: 'custom', prompt: customPoseText.trim(), label: 'Р РЋР Р†Р С•РЎРЏ Р С”Р С•Р СР С—Р С•Р В·Р С‘РЎвЂ Р С‘РЎРЏ' }] : selectedProductCompositions;
          // Р В¤Р С•Р Р…РЎвЂ№
          const bgsToUse = (customProductBg.trim() || selectedLocId) 
            ? [{ id: selectedLocId || 'custom', prompt: customProductBg.trim(), isLoc: !!selectedLocId }]
            : selectedProductBgs;
          // Р РЋР С—Р ВµРЎвЂ РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљРЎвЂ№
          const effectsToUse = customProductEffectText.trim()
            ? [{ id: 'custom', prompt: customProductEffectText.trim(), label: 'Р РЋР Р†Р С•Р в„– РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљ' }]
            : selectedProductEffects;
          // Р В¤Р С•РЎР‚Р СР В°РЎвЂљРЎвЂ№
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
          // Р СљР С•Р Т‘Р ВµР В»Р С‘
          const modelsToUse = (customModelPrompt.trim() || selectedSavedModelId)
            ? [{ id: selectedSavedModelId || 'custom', prompt: customModelPrompt.trim(), isSaved: !!selectedSavedModelId }]
            : [...selectedModels, ...customModelChips];
          // Р СџР С•Р В·РЎвЂ№
          const posesToUse = customPoseText.trim()
            ? [{ id: 'custom', prompt: customPoseText.trim(), label: 'Р РЋР Р†Р С•РЎРЏ Р С—Р С•Р В·Р В°' }]
            : [...selectedPoses, ...customPoseChips];
          // Р В Р В°Р С”РЎС“РЎР‚РЎРѓРЎвЂ№
          const camerasToUse = selectedCameras;
          // Р В¤Р С•Р Р…РЎвЂ№
          const bgsToUse = (customBgText.trim() || selectedLocId)
            ? [{ id: selectedLocId || 'custom', prompt: customBgText.trim(), isLoc: !!selectedLocId }]
            : [...selectedBgs, ...customBgChips];
          // Р В¤Р С•РЎР‚Р СР В°РЎвЂљРЎвЂ№
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

        // 1. Р вЂРЎР‚Р С•Р Р…Р С‘РЎР‚РЎС“Р ВµР С/РЎРѓР С—Р С‘РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№ Р С—Р В°Р С”Р ВµРЎвЂљР Р…Р С• Р С—Р ВµРЎР‚Р ВµР Т‘ Р В·Р В°Р С—РЎС“РЎРѓР С”Р С•Р С
        setProcessingMsg('РІС™РЋ Р вЂРЎР‚Р С•Р Р…Р С‘РЎР‚РЎС“Р ВµР С Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№...');
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
          throw new Error(deductData.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С—Р С‘РЎРѓР В°РЎвЂљРЎРЉ Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№');
        }
        refreshCreditsFromResponse(deductData);

        // 2. Р С›РЎвЂЎР ВµРЎР‚Р ВµР Т‘РЎРЉ Р Р†РЎвЂ№Р С—Р С•Р В»Р Р…Р ВµР Р…Р С‘РЎРЏ Р В·Р В°Р Т‘Р В°РЎвЂЎ РЎРѓ Р С”Р С•Р Р…Р С”РЎС“РЎР‚Р ВµР Р…РЎвЂљР Р…Р С•РЎРѓРЎвЂљРЎРЉРЎР‹ = 3
        let completedCount = 0;
        let failedCount = 0;
        const results = [];

        const updateProgressText = () => {
          if (totalShots > 1) {
            setProcessingMsg(`СЂСџвЂњС‘ Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ: Р С–Р С•РЎвЂљР С•Р Р†Р С• ${completedCount} Р С‘Р В· ${totalShots} Р С”Р В°Р Т‘РЎР‚Р С•Р Р†` + 
              (failedCount > 0 ? ` (Р С•РЎв‚¬Р С‘Р В±Р С•Р С”: ${failedCount})` : '') + 
              `...\nР СџР С•Р В¶Р В°Р В»РЎС“Р в„–РЎРѓРЎвЂљР В°, Р Р…Р Вµ Р В·Р В°Р С”РЎР‚РЎвЂ№Р Р†Р В°Р в„–РЎвЂљР Вµ Р Р†Р С”Р В»Р В°Р Т‘Р С”РЎС“.`);
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
                  ? `СЂСџР‹РЃ ${task.comp.label || 'Р С™Р В°Р Т‘РЎР‚'} (${task.variantIndex})`
                  : `СЂСџР‹РЃ ${task.pose.label || 'Р СџР С•Р В·Р В°'} (${task.variantIndex})`;
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

        // Р вЂ”Р В°Р С—РЎС“РЎРѓР С” Р С•РЎвЂЎР ВµРЎР‚Р ВµР Т‘Р С‘ РЎРѓ concurrency = 3
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

        // РІвЂўС’РІвЂўС’РІвЂўС’ REFUND Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р† Р В·Р В° Р Р…Р ВµРЎС“Р Т‘Р В°РЎвЂЎР Р…РЎвЂ№Р Вµ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ РІвЂўС’РІвЂўС’РІвЂўС’
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
              console.log(`СЂСџвЂ™В° Refunded ${failedCount} credit(s) for failed generations`);
            }
          } catch (refundErr) {
            console.warn('Failed to refund credits:', refundErr.message);
          }
        }

        const successItems = results.filter(r => r.success);
        if (successItems.length > 0) {
          const pluralForm = successItems.length === 1 ? '' : (successItems.length < 5 ? 'Р В° РІР‚вЂќ Р В»Р С‘РЎРѓРЎвЂљР В°Р в„–РЎвЂљР Вµ РІвЂ”Р‚РІвЂ“В¶' : ' РІР‚вЂќ Р В»Р С‘РЎРѓРЎвЂљР В°Р в„–РЎвЂљР Вµ РІвЂ”Р‚РІвЂ“В¶');
          setStatusText(`Р вЂњР С•РЎвЂљР С•Р Р†Р С•! ${successItems.length} Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ${pluralForm}${failedCount > 0 ? ` (${failedCount} Р Р…Р Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РІР‚вЂќ Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№ Р Р†Р С•Р В·Р Р†РЎР‚Р В°РЎвЂ°Р ВµР Р…РЎвЂ№)` : ''}`); setStatusType('success');
        } else {
          setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${results[0]?.details || results[0]?.error || 'Р СњР ВµР С‘Р В·Р Р†Р ВµРЎРѓРЎвЂљР Р…Р В°РЎРЏ Р С•РЎв‚¬Р С‘Р В±Р С”Р В°'}. Р С™РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№ Р Р†Р С•Р В·Р Р†РЎР‚Р В°РЎвЂ°Р ВµР Р…РЎвЂ№.`); setStatusType('error');
        }

      } catch (err) {
        setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${err.message}`); setStatusType('error');
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

  // Р С™Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘РЎРЏ URL РІвЂ вЂ™ base64 Р Р…Р В° Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР Вµ (Р С•Р В±РЎвЂ¦Р С•Р Т‘Р С‘Р С Р С—РЎР‚Р С•Р В±Р В»Р ВµР СРЎвЂ№ Firebase Storage Rules)
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

  // Р вЂ™РЎвЂ№Р В±Р С•РЎР‚ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘ РЎРѓ Р С—РЎР‚Р ВµР Т‘Р Р†Р В°РЎР‚Р С‘РЎвЂљР ВµР В»РЎРЉР Р…Р С•Р в„– Р С”Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘Р ВµР в„– Р С”Р В°РЎР‚РЎвЂљР С‘Р Р…Р С•Р С” Р Р† base64
  const selectLocation = async (locId) => {
    setSelectedLocId(locId);
    if (!locId || locBase64Cache[locId]) return; // РЎС“Р В¶Р Вµ Р ВµРЎРѓРЎвЂљРЎРЉ Р Р† Р С”Р ВµРЎв‚¬Р Вµ
    const loc = myLocations.find(l => l.id === locId);
    if (!loc || !loc.imageUrls) return;
    const b64arr = await Promise.all(loc.imageUrls.slice(0, 5).map(urlToBase64Client));
    const valid = b64arr.filter(Boolean);
    if (valid.length > 0) {
      setLocBase64Cache(prev => ({ ...prev, [locId]: valid }));
      console.log(`СЂСџвЂњРЊ Pre-fetched ${valid.length} loc images as base64 for loc ${locId}`);
    } else {
      console.warn(`РІС™В РїС‘РЏ Could not pre-fetch any loc images for ${locId}, will use raw URLs`);
    }
  };

  const saveLoc = async () => {
    if (!locName.trim() || locFiles.length < 2 || !user) return;
    setIsSaving(true);
    try {
      // PRIMARY: Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С inline base64 (Р С–Р В»Р В°Р Р†Р Р…РЎвЂ№Р в„– Р СР ВµРЎвЂ¦Р В°Р Р…Р С‘Р В·Р С РІР‚вЂќ Р Р…Р Вµ Р В·Р В°Р Р†Р С‘РЎРѓР С‘РЎвЂљ Р С•РЎвЂљ Firebase Storage)
      const imageBase64 = await Promise.all(locFiles.map(async (f) => {
        const compressed = await compressImage(f, 500); // 500px РІР‚вЂќ Р Т‘Р С•РЎРѓРЎвЂљР В°РЎвЂљР С•РЎвЂЎР Р…Р С• Р Т‘Р В»РЎРЏ AI-reference
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(compressed);
        });
      }));
      const validBase64 = imageBase64.filter(Boolean);
      if (validBase64.length === 0) throw new Error('Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р С•Р В±РЎР‚Р В°Р В±Р С•РЎвЂљР В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С•Р С–РЎР‚Р В°РЎвЂћР С‘Р С‘');

      // BONUS: Р С—РЎР‚Р С•Р В±РЎС“Р ВµР С Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљРЎРЉ Р Р† Firebase Storage (Р Р…Р Вµ Р С”РЎР‚Р С‘РЎвЂљР С‘РЎвЂЎР Р…Р С• Р ВµРЎРѓР В»Р С‘ РЎС“Р С—Р В°Р Т‘РЎвЂРЎвЂљ)
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
        console.warn('РІС™В РїС‘РЏ Firebase Storage upload failed (non-critical):', storageErr.message);
        // Р СџРЎР‚Р С•Р Т‘Р С•Р В»Р В¶Р В°Р ВµР С РІР‚вЂќ РЎС“ Р Р…Р В°РЎРѓ Р ВµРЎРѓРЎвЂљРЎРЉ base64, РЎРЊРЎвЂљР С•Р С–Р С• Р Т‘Р С•РЎРѓРЎвЂљР В°РЎвЂљР С•РЎвЂЎР Р…Р С•
      }

      await saveLocation(user.uid, {
        title: locName.trim(),
        imageUrls,      // Р СР С•Р В¶Р ВµРЎвЂљ Р В±РЎвЂ№РЎвЂљРЎРЉ Р С—РЎС“РЎРѓРЎвЂљРЎвЂ№Р С Р ВµРЎРѓР В»Р С‘ Storage Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р ВµР Р…
        storagePaths,   // Р СР С•Р В¶Р ВµРЎвЂљ Р В±РЎвЂ№РЎвЂљРЎРЉ Р С—РЎС“РЎРѓРЎвЂљРЎвЂ№Р С Р ВµРЎРѓР В»Р С‘ Storage Р Р…Р ВµР Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р ВµР Р…
        thumbnail: imageUrls[0] || null,
        imageBase64: validBase64, // Р вЂњР вЂєР С’Р вЂ™Р СњР В«Р в„ў Р С‘РЎРѓРЎвЂљР С•РЎвЂЎР Р…Р С‘Р С” РЎвЂћР С•РЎвЂљР С•
      });
      const locations = await getLocations(user.uid);
      setMyLocations(locations);
      // Р РЋРЎР‚Р В°Р В·РЎС“ Р В·Р В°Р С—Р С•Р В»Р Р…РЎРЏР ВµР С Р С”Р ВµРЎв‚¬ Р Т‘Р В»РЎРЏ Р Р…Р С•Р Р†Р С•Р в„– Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘
      if (validBase64.length > 0) {
        const newLocId = locations.find(l => l.title === locName.trim())?.id;
        if (newLocId) setLocBase64Cache(prev => ({ ...prev, [newLocId]: validBase64 }));
      }
      setShowLocModal(false); setLocName(''); setLocFiles([]); setLocPreviews([]);
      setStatusText('СЂСџвЂњРЊ Р вЂєР С•Р С”Р В°РЎвЂ Р С‘РЎРЏ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р В°!'); setStatusType('success');
    } catch (err) {
      console.error('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘:', err);
      setStatusText(`РІСњРЉ Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘: ${err.message || 'Р СњР ВµР С‘Р В·Р Р†Р ВµРЎРѓРЎвЂљР Р…Р В°РЎРЏ Р С•РЎв‚¬Р С‘Р В±Р С”Р В°'}`); setStatusType('error');
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

  // LoRA model save (Firebase) РІР‚вЂќ base64-first, Storage optional
  const saveLoraModel = async (photosOverride) => {
    if (!loraName.trim() || !user) return;
    setIsSaving(true);
    try {
      const photos = photosOverride || loraPhotos;
      const photoEntries = Object.entries(photos).filter(([, v]) => v);
      if (photoEntries.length === 0) throw new Error('Р СњР ВµРЎвЂљ РЎвЂћР С•РЎвЂљР С•Р С–РЎР‚Р В°РЎвЂћР С‘Р в„– Р Т‘Р В»РЎРЏ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ');

      // PRIMARY: base64 inline (Р С–Р В°РЎР‚Р В°Р Р…РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р С• РЎР‚Р В°Р В±Р С•РЎвЂљР В°Р ВµРЎвЂљ)
      const imageBase64 = photoEntries.map(([, base64]) => base64);

      // BONUS: Storage upload (Р Р…Р Вµ Р В±Р В»Р С•Р С”Р С‘РЎР‚РЎС“Р ВµРЎвЂљ Р ВµРЎРѓР В»Р С‘ РЎС“Р С—Р В°Р Т‘РЎвЂРЎвЂљ)
      let imageUrls = [];
      let storagePaths = [];
      try {
        const uploads = await Promise.all(photoEntries.map(async ([, base64]) => {
          return uploadBase64Image(user.uid, base64, 'models');
        }));
        imageUrls = uploads.map(u => u.url);
        storagePaths = uploads.map(u => u.path);
      } catch (storageErr) {
        console.warn('РІС™В РїС‘РЏ Storage upload failed (non-critical):', storageErr.message);
      }

      await saveModel(user.uid, { name: loraName.trim(), type: 'lora', modelType: 'own_model', imageUrls, storagePaths, imageBase64, prompt: '' });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowLoraModal(false); setLoraName(''); setLoraPhotos({ front: null, left34: null, right34: null, fullbody: null });
      setStatusText('РІВ­С’ Р СљР С•Р Т‘Р ВµР В»РЎРЉ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р В°!'); setStatusType('success');
    } catch (err) {
      console.error('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ Р СР С•Р Т‘Р ВµР В»Р С‘:', err);
      throw err;
    }
    finally { setIsSaving(false); }
  };

  // Save generated model (Firebase) РІР‚вЂќ base64-first, Storage optional
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
        console.warn('РІС™В РїС‘РЏ Storage upload failed (non-critical):', storageErr.message);
      }

      await saveModel(user.uid, { name: saveModelName.trim(), type: 'generated', imageUrls, storagePaths, imageBase64, prompt: mp });
      const models = await getModels(user.uid);
      setMyModels(models);
      setShowSaveModelModal(false); setSaveModelName('');
      setStatusText('РІСљвЂ¦ Р СљР С•Р Т‘Р ВµР В»РЎРЉ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р В°!');
      setStatusType('success');
    } catch (err) { console.error('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ Р СР С•Р Т‘Р ВµР В»Р С‘:', err); setStatusText('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ'); setStatusType('error'); }
    finally { setIsSaving(false); }
  };

  // Save calibrated model from wizard (3-angle photos) РІР‚вЂќ base64-first
  const saveCalibratedModel = async (name, photos, prompt) => {
    if (!user) {
      throw new Error('Р СџР С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЉ Р Р…Р Вµ Р В°Р Р†РЎвЂљР С•РЎР‚Р С‘Р В·Р С•Р Р†Р В°Р Р…. Р вЂ™Р С•Р в„–Р Т‘Р С‘РЎвЂљР Вµ Р Р† Р В°Р С”Р С”Р В°РЎС“Р Р…РЎвЂљ.');
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
        console.warn('РІС™В РїС‘РЏ Storage upload failed (non-critical):', storageErr.message);
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
      setStatusText('РІСљвЂ¦ Р С›РЎвЂљР С”Р В°Р В»Р С‘Р В±РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р В°РЎРЏ Р СР С•Р Т‘Р ВµР В»РЎРЉ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р В°!');
      setStatusType('success');

    } catch (err) {
      console.error('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ Р СР С•Р Т‘Р ВµР В»Р С‘:', err);
      setStatusText('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ Р СР С•Р Т‘Р ВµР В»Р С‘');
      setStatusType('error');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };


  // Save persona model (from PersonaWizard comp card)
  const savePersonaModel = async ({ name, type, compCardBase64, compCardUrl, sourcePhotos }) => {
    if (!user) throw new Error('Р СњР Вµ Р В°Р Р†РЎвЂљР С•РЎР‚Р С‘Р В·Р С•Р Р†Р В°Р Р…');
    setIsSaving(true);
    try {
      const compUpload = await uploadBase64Image(user.uid, compCardBase64, 'models');
      const sourceUploads = await Promise.all(
        sourcePhotos.map(async (base64) => uploadBase64Image(user.uid, base64, 'models'))
      );
      await saveModel(user.uid, {
        name,
        type: 'persona',
        modelType: 'persona',  // РІвЂ С’ Р СР В°РЎР‚Р С”Р ВµРЎР‚ Р Т‘Р В»РЎРЏ VTON pipeline
        // imageUrls = РЎвЂљР С•Р В»РЎРЉР С”Р С• comp card (1 РЎвЂћР В°Р в„–Р В») РІР‚вЂќ Р С‘Р СР ВµР Р…Р Р…Р С• Р С•Р Р… РЎС“Р в„–Р Т‘РЎвЂРЎвЂљ Р Р† GPT Image 2 Р С”Р В°Р С” РЎР‚Р ВµРЎвЂћР ВµРЎР‚Р ВµР Р…РЎРѓ
        imageUrls: [compUpload.url],
        sourcePhotoUrls: sourceUploads.map(u => u.url),
        storagePaths: [compUpload.path, ...sourceUploads.map(u => u.path)],
        compCardUrl: compUpload.url,
        prompt: '',
      });
      const models = await getModels(user.uid);
      setMyModels(models);
      setStatusText('\u2705 Р СџР ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В¶ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎвЂР Р…!');
      setStatusType('success');
    } catch (err) {
      console.error('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ Р С—Р ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В¶Р В°:', err);
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
  // CRITICAL: Do NOT include generatedImage РІР‚вЂќ it may contain product objects (cups, bottles etc.)
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
      const refImgs = (sm?.imageBase64?.length ? sm.imageBase64 : null) || sm?.imageUrls || [];
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
        setStatusText('Р СџРЎР‚Р ВµР Р†РЎРЉРЎР‹ Р СР С•Р Т‘Р ВµР В»Р С‘ Р С–Р С•РЎвЂљР С•Р Р†Р С•! Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ Р С”Р В°Р С” Р Р…Р С•Р Р†РЎС“РЎР‹?'); setStatusType('success');
      } else { setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${data.details||data.error}`); setStatusType('error'); }
    } catch (err) { setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${err.message}`); setStatusType('error'); }
    finally { setIsPreviewingModel(false); }
  };

  // Save modified model as NEW РІР‚вЂќ base64-first
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
        console.warn('РІС™В РїС‘РЏ Storage upload failed (non-critical):', storageErr.message);
      }

      await saveModel(user.uid, { name: modelPreviewName.trim(), type: 'generated', imageUrls, storagePaths, imageBase64, prompt: newPrompt });
      const models = await getModels(user.uid);
      setMyModels(models);
      setModelPreviewSrc(null); setModelPreviewName(''); setModelModifier(''); setShowModelModifier(false);
      setShowModelPreviewSave(false);
      setStatusText('РІСљвЂ¦ Р СњР С•Р Р†Р В°РЎРЏ Р СР С•Р Т‘Р ВµР В»РЎРЉ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р В°!'); setStatusType('success');
    } catch (err) { console.error(err); setStatusText('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ'); setStatusType('error'); }
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
      setStatusText('РІСљвЂ¦ Р ВР В·Р СР ВµР Р…Р ВµР Р…Р С‘РЎРЏ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…РЎвЂ№!'); setStatusType('success');
    } catch (err) { console.error(err); setStatusText('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ'); setStatusType('error'); }
  };

  // Re-generate with shot modifier (iterative editing)
  const handleRegenerate = async () => {
    if (!shotModifier.trim() || !garmentUrls.length) return;

    // РІвЂўС’РІвЂўС’РІвЂўС’ SUBSCRIPTION CHECK РІвЂўС’РІвЂўС’РІвЂўС’
    if (!canGenerate(subscription)) {
      setShowPricing(true);
      setStatusText('РІС™РЋ Р вЂќР В»РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ Р Р…РЎС“Р В¶Р ВµР Р… Р В°Р С”РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р в„– РЎвЂљР В°РЎР‚Р С‘РЎвЂћ'); setStatusType('error');
      return;
    }

    setIsProcessing(true);
    // DON'T clear generatedImage here РІР‚вЂќ preserve it in case of error
    setStatusText('');
    let msgI = 0;
    const iv = setInterval(() => { setProcessingMsg(msgI < MSGS.length ? MSGS[msgI++] : 'Р В¤Р С‘Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р Вµ РЎв‚¬РЎвЂљРЎР‚Р С‘РЎвЂ¦Р С‘...'); }, 8000);

    try {
      setProcessingMsg('Р СџР С•Р Т‘Р С–Р С•РЎвЂљР В°Р Р†Р В»Р С‘Р Р†Р В°Р ВµР С Р С‘РЎРѓРЎвЂ¦Р С•Р Т‘Р Р…Р С‘Р С”Р С‘...');

      let modelPrompt = '';
      let posePrompt = '';
      let bgPrompt = '';
      let modelRefImages = null;
      let locImages = null;
      const mod = shotModifier.trim();

      if (appMode === 'product') {
        // Р СћР С•Р Р†Р В°РЎР‚Р Р…РЎвЂ№Р в„– РЎР‚Р ВµР В¶Р С‘Р С
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
        
        // Р СџРЎР‚Р С‘Р СР ВµР Р…Р ВµР Р…Р С‘Р Вµ Р С—РЎР‚Р В°Р Р†Р С•Р С” Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЏ Р С” РЎвЂљР С•Р Р†Р В°РЎР‚РЎС“ Р С‘Р В»Р С‘ РЎвЂћР С•Р Р…РЎС“
        const bgKeywords = /(?:РЎвЂћР С•Р Р…|Р В·Р В°Р Т‘Р Р…Р С‘Р в„–|Р С—Р В»РЎРЏР В¶|РЎС“Р В»Р С‘РЎвЂ |Р С–Р С•РЎР‚Р С•Р Т‘|Р С—Р В°РЎР‚Р С”|Р В»Р ВµРЎРѓ|Р С–Р С•РЎР‚РЎвЂ№|Р С‘Р Р…РЎвЂљР ВµРЎР‚РЎРЉР ВµРЎР‚|РЎРѓРЎвЂљРЎС“Р Т‘Р С‘|background|beach|street|city|park|forest|mountain|interior|studio|wood|marble|table|desk|neon|droplets|splash|petals|glow)/i;
        if (bgKeywords.test(mod)) {
          bgPrompt += `. Additionally: ${mod}`;
        } else {
          modelPrompt += `. Additionally: ${mod}`;
        }
      } else {
        // Р В Р ВµР В¶Р С‘Р С Р С•Р Т‘Р ВµР В¶Р Т‘РЎвЂ№ (VTON)
        modelPrompt = customModelPrompt.trim()
          || (customModelChips.length > 0 ? customModelChips[0].prompt : null)
          || (selectedModels[0].prompt + buildDetailString(modelDetailsMap[selectedModels[0]?.id]));
        if (selectedSavedModelId) {
          const sm = myModels.find(m => m.id === selectedSavedModelId);
          if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = (sm.imageBase64?.length ? sm.imageBase64 : null) || sm.imageUrls || []; }
        }

        posePrompt = customPoseText.trim() || selectedPoses[0].prompt;
        const poseKeywords = /(?:Р С—Р С•Р В·[Р В°Р ВµРЎС“РЎвЂ№]|РЎРѓР С‘Р Т‘(?:Р С‘РЎвЂљ|РЎРЏ|Р ВµРЎвЂљРЎРЉ)|РЎРѓРЎвЂљР С•Р С‘РЎвЂљ|Р В»Р ВµР В¶Р С‘РЎвЂљ|Р С‘Р Т‘РЎвЂРЎвЂљ|Р С‘Р Т‘Р ВµРЎвЂљ|РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљ|Р В±Р ВµР В¶Р С‘РЎвЂљ|РЎвЂљР В°Р Р…РЎвЂ РЎС“|Р С—РЎР‚РЎвЂ№Р С–Р В°|lotus|sitting|standing|lying|walking|running|dancing|crouching|leaning|kneeling|jumping|squat)/i;
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

        const bgKeywords = /(?:РЎвЂћР С•Р Р…|Р В±Р В°Р В»Р С‘|Р С—Р В»РЎРЏР В¶|РЎС“Р В»Р С‘РЎвЂ |Р С–Р С•РЎР‚Р С•Р Т‘|Р С—Р В°РЎР‚Р С”|Р В»Р ВµРЎРѓ|Р С–Р С•РЎР‚РЎвЂ№|Р С‘Р Р…РЎвЂљР ВµРЎР‚РЎРЉР ВµРЎР‚|РЎРѓРЎвЂљРЎС“Р Т‘Р С‘|background|beach|street|city|park|forest|mountain|interior|studio)/i;
        if (bgKeywords.test(mod)) {
          bgPrompt += `. ${mod}`;
        }
      }

      setProcessingMsg('СЂСџС™Р‚ Р С›РЎвЂљР С—РЎР‚Р В°Р Р†Р В»РЎРЏР ВµР С Р Р† Nano Banano 2...');
      // РІвЂўС’РІвЂўС’РІвЂўС’ STATELESS REGENERATION РІвЂўС’РІвЂўС’РІвЂўС’
      // NEVER send the generated photo back as reference РІР‚вЂќ it creates "Visual Attention Sink"
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
        // Р С™РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№ РЎС“Р В¶Р Вµ РЎРѓР С—Р С‘РЎРѓР В°Р Р…РЎвЂ№ Р В±РЎРЊР С”Р ВµР Р…Р Т‘Р С•Р С РІР‚вЂќ Р С•Р В±Р Р…Р С•Р Р†Р В»РЎРЏР ВµР С Р В±Р В°Р В»Р В°Р Р…РЎРѓ Р С‘Р В· Р С•РЎвЂљР Р†Р ВµРЎвЂљР В°
        refreshCreditsFromResponse(data);

        const newImg = data.imageUrl || data.imageBase64;
        setGeneratedImage(newImg);
        const editLabel = shotModifier.trim() || 'Р СџР ВµРЎР‚Р ВµР С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ';
        setImageHistory(prev => { const h = [...prev, { image: newImg, label: editLabel }]; setHistoryIndex(h.length - 1); return h; });
        setStatusText('Р С™Р В°Р Т‘РЎР‚ Р С•Р В±Р Р…Р С•Р Р†Р В»РЎвЂР Р…!');
        setStatusType('success');
      } else {
        setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${data.details || data.error}`);
        setStatusType('error');
      }
    } catch (err) {
      setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${err.message}`);
      setStatusType('error');
      clearInterval(iv);
    } finally {
      setIsProcessing(false);
      setShotModifier('');
    }
  };

  // РІвЂўС’РІвЂўС’РІвЂўС’ CARD DESIGN РІР‚вЂќ show count modal first РІвЂўС’РІвЂўС’РІвЂўС’
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
      setStatusText(`РІС™РЋ Р вЂќР В»РЎРЏ ${count} Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР ВµР С” Р Р…РЎС“Р В¶Р Р…Р С• ${totalCredits} Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р†`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < totalCredits) {
      setStatusText(`РІС™РЋ Р вЂќР В»РЎРЏ ${count} Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР ВµР С” Р Р…РЎС“Р В¶Р Р…Р С• ${totalCredits} Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р†`); setStatusType('error');
      return;
    }

    setIsCardGenerating(true);
    setCardResult(null);
    setStatusText(`СЂСџР‹Т‘ Р РЋР С•Р В·Р Т‘Р В°РЎвЂР С ${count > 1 ? count + ' Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР ВµР С”' : 'Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“'}...`);
    setStatusType('processing');

    const progressSteps = ['СЂСџР‹Т‘ Р С’Р Р…Р В°Р В»Р С‘Р В·Р С‘РЎР‚РЎС“Р ВµР С РЎвЂљР С•Р Р†Р В°РЎР‚...', 'СЂСџР‹РЃ Р СџР С•Р Т‘Р В±Р С‘РЎР‚Р В°Р ВµР С РЎРѓРЎвЂљР С‘Р В»РЎРЉ...', 'РІСљРЊРїС‘РЏ Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С РЎвЂљР С‘Р С—Р С•Р С–РЎР‚Р В°РЎвЂћР С‘Р С”РЎС“...', 'СЂСџвЂњС’ Р С™Р С•Р СР С—Р С•Р Р…РЎС“Р ВµР С Р СР В°Р С”Р ВµРЎвЂљ...', 'РІСљРЃ Р В¤Р С‘Р Р…Р В°Р В»РЎРЉР Р…Р В°РЎРЏ Р С—Р С•Р В»Р С‘РЎР‚Р С•Р Р†Р С”Р В°...'];
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
        // Р С™РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№ РЎС“Р В¶Р Вµ РЎРѓР С—Р С‘РЎРѓР В°Р Р…РЎвЂ№ Р В±РЎРЊР С”Р ВµР Р…Р Т‘Р С•Р С РІР‚вЂќ Р С•Р В±Р Р…Р С•Р Р†Р В»РЎРЏР ВµР С Р В±Р В°Р В»Р В°Р Р…РЎРѓ Р С‘Р В· Р С•РЎвЂљР Р†Р ВµРЎвЂљР В°
        const lastCard = results.find(d => d.success && d.creditsRemaining != null);
        refreshCreditsFromResponse(lastCard || results.find(d => d.success));
        setCardResult(successCards);
        setStatusText(`СЂСџР‹Т‘ Р вЂњР С•РЎвЂљР С•Р Р†Р С•! ${successCards.length} ${successCards.length === 1 ? 'Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В°' : 'Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР ВµР С”'}`);
        setStatusType('success');
      } else {
        const firstError = results.find(d => !d.success);
        setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${firstError?.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“'}`);
        setStatusType('error');
      }
    } catch (err) {
      clearInterval(iv);
      setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsCardGenerating(false);
    }
  };

  // РІвЂўС’РІвЂўС’РІвЂўС’ GALLERY GENERATION РІвЂўС’РІвЂўС’РІвЂўС’
  const handleGenerateGallery = async () => {
    if (!garmentUrls.length) {
      setStatusText('Р РЋР Р…Р В°РЎвЂЎР В°Р В»Р В° Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљР Вµ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°'); setStatusType('error');
      return;
    }
    const creditsNeeded = 5;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < creditsNeeded && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`РІС™РЋ Р вЂќР В»РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ Р С–Р В°Р В»Р ВµРЎР‚Р ВµР С‘ Р Р…РЎС“Р В¶Р Р…Р С• 5 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р†`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < creditsNeeded) {
      setStatusText(`РІС™РЋ Р вЂќР В»РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ Р С–Р В°Р В»Р ВµРЎР‚Р ВµР С‘ Р Р…РЎС“Р В¶Р Р…Р С• 5 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р†`); setStatusType('error');
      return;
    }
    
    setIsGalleryGenerating(true);
    setIsProcessing(true);
    setStatusType('processing');
    setStatusText('СЂСџвЂњвЂ№ Р СњР В°РЎвЂЎР С‘Р Р…Р В°Р ВµР С РЎРѓР В±Р С•РЎР‚Р С”РЎС“ Р С–Р В°Р В»Р ВµРЎР‚Р ВµР С‘ (4 РЎРѓР В»Р В°Р в„–Р Т‘Р В°)...');

    // Р РЋР С—Р С‘РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С 5 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р†
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
        throw new Error(deductData.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С—Р С‘РЎРѓР В°РЎвЂљРЎРЉ Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№');
      }
      refreshCreditsFromResponse(deductData);
    } catch (deductErr) {
      setStatusText(`РІС™В РїС‘РЏ Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С—Р С‘РЎРѓР В°Р Р…Р С‘РЎРЏ Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р†: ${deductErr.message}`);
      setStatusType('error');
      setIsGalleryGenerating(false);
      setIsProcessing(false);
      return;
    }

    const gallerySlides = [
      quickCardImage || generatedImage || garmentUrls[0] // Р РЋР В»Р В°Р в„–Р Т‘ 1: РЎвЂљР ВµР С”РЎС“РЎвЂ°Р В°РЎРЏ Р С•Р В±Р В»Р С•Р В¶Р С”Р В°
    ];

    try {
      const isFashion = appMode === 'fashion';

      // Р РЋР В»Р В°Р в„–Р Т‘ 2: Р С™РЎР‚РЎС“Р С—Р Р…РЎвЂ№Р в„– Р С—Р В»Р В°Р Р…
      setStatusText('СЂСџвЂќРЊ Р РЃР В°Р С– 1/3: Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С Р С”РЎР‚РЎС“Р С—Р Р…РЎвЂ№Р в„– Р С—Р В»Р В°Р Р… Р Т‘Р ВµРЎвЂљР В°Р В»Р ВµР в„–...');
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
      if (!dataDetail.success) throw new Error(dataDetail.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С”РЎР‚РЎС“Р С—Р Р…РЎвЂ№Р в„– Р С—Р В»Р В°Р Р…');
      const imgDetail = dataDetail.imageBase64 || dataDetail.imageUrl;
      gallerySlides.push(imgDetail);

      // Р РЋР В»Р В°Р в„–Р Т‘ 3: Р В Р В°Р В·Р СР ВµРЎР‚РЎвЂ№ (Р ВР Р…РЎвЂћР С•Р С–РЎР‚Р В°РЎвЂћР С‘Р С”Р В°)
      setStatusText('СЂСџвЂњС’ Р РЃР В°Р С– 2/3: Р вЂќР С•РЎРѓРЎвЂљРЎР‚Р В°Р С‘Р Р†Р В°Р ВµР С Р С‘Р Р…РЎвЂћР С•Р С–РЎР‚Р В°РЎвЂћР С‘Р С”РЎС“ РЎРѓ РЎР‚Р В°Р В·Р СР ВµРЎР‚Р В°Р СР С‘...');
      const infoText = isFashion
        ? (userProductInfo && userProductInfo.trim()
            ? `Р ВР СњР В¤Р С›Р В Р СљР С’Р В¦Р ВР Р‡ Р С› Р СћР С›Р вЂ™Р С’Р В Р вЂў:
${userProductInfo.trim()}

Р В Р С’Р вЂ”Р СљР вЂўР В Р СњР С’Р Р‡ Р РЋР вЂўР СћР С™Р С’:
S (42-44), M (44-46), L (46-48), XL (48-50)`
            : `Р СћР С’Р вЂР вЂєР ВР В¦Р С’ Р В Р С’Р вЂ”Р СљР вЂўР В Р С›Р вЂ™:
S (42-44)
M (44-46)
L (46-48)
XL (48-50)
Р СџРЎР‚Р ВµР СР С‘Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р СР В°РЎвЂљР ВµРЎР‚Р С‘Р В°Р В», Р С‘Р Т‘Р ВµР В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р С”РЎР‚Р С•Р в„–.`)
        : (userProductInfo && userProductInfo.trim()
            ? `Р ВР СњР В¤Р С›Р В Р СљР С’Р В¦Р ВР Р‡ Р С› Р СћР С›Р вЂ™Р С’Р В Р вЂў:
${userProductInfo.trim()}

Р вЂњР С’Р вЂР С’Р В Р ВР СћР В« Р СћР С›Р вЂ™Р С’Р В Р С’:
Р вЂ™РЎвЂ№РЎРѓР С•РЎвЂљР В°, РЎв‚¬Р С‘РЎР‚Р С‘Р Р…Р В°, Р С–Р В»РЎС“Р В±Р С‘Р Р…Р В°, РЎРЊРЎР‚Р С–Р С•Р Р…Р С•Р СР С‘РЎвЂЎР Р…РЎвЂ№Р в„– Р С—РЎР‚Р ВµР СР С‘РЎС“Р С Р Т‘Р С‘Р В·Р В°Р в„–Р Р….`
            : `Р вЂњР С’Р вЂР С’Р В Р ВР СћР В« Р В Р ТђР С’Р В Р С’Р С™Р СћР вЂўР В Р ВР РЋР СћР ВР С™Р В:
Р С›Р С—РЎвЂљР С‘Р СР В°Р В»РЎРЉР Р…РЎвЂ№Р в„– РЎР‚Р В°Р В·Р СР ВµРЎР‚
Р вЂ™РЎвЂ№РЎРѓР С•РЎвЂљР В°: 30 РЎРѓР С
Р РЃР С‘РЎР‚Р С‘Р Р…Р В°: 28 РЎРѓР С
Р вЂњР В»РЎС“Р В±Р С‘Р Р…Р В°: 10 РЎРѓР С
Р СџРЎР‚Р ВµР СР С‘Р В°Р В»РЎРЉР Р…РЎвЂ№Р Вµ Р СР В°РЎвЂљР ВµРЎР‚Р С‘Р В°Р В»РЎвЂ№, Р СР В°Р С”РЎРѓР С‘Р СР В°Р В»РЎРЉР Р…Р С•Р Вµ РЎС“Р Т‘Р С•Р В±РЎРѓРЎвЂљР Р†Р С•.`);
      
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
      if (!dataSize.success) throw new Error(dataSize.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С‘Р Р…РЎвЂћР С•Р С–РЎР‚Р В°РЎвЂћР С‘Р С”РЎС“ РЎР‚Р В°Р В·Р СР ВµРЎР‚Р С•Р Р†');
      const imgSize = dataSize.imageBase64 || dataSize.imageUrl;
      gallerySlides.push(imgSize);

      // Р РЋР В»Р В°Р в„–Р Т‘ 4: Lifestyle
      setStatusText(isFashion ? 'СЂСџРЉС– Р РЃР В°Р С– 3/3: Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С РЎвЂћР С•РЎвЂљР С• Р СР С•Р Т‘Р ВµР В»Р С‘ Р Р…Р В° РЎС“Р В»Р С‘РЎвЂ Р Вµ (Lifestyle)...' : 'СЂСџРЏВ  Р РЃР В°Р С– 3/3: Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С РЎвЂћР С•РЎвЂљР С• Р Р† Р С‘Р Р…РЎвЂљР ВµРЎР‚РЎРЉР ВµРЎР‚Р Вµ (Lifestyle)...');
      
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
      if (!dataLife.success) throw new Error(dataLife.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ lifestyle РЎвЂћР С•РЎвЂљР С•');
      const imgLife = dataLife.imageBase64 || dataLife.imageUrl;
      gallerySlides.push(imgLife);

      setQuickResults(prev => ({ ...prev, gallery: gallerySlides }));
      setStatusText('РІСљвЂ¦ Р вЂњР В°Р В»Р ВµРЎР‚Р ВµРЎРЏ Р С‘Р В· 4-РЎвЂ¦ РЎРѓР В»Р В°Р в„–Р Т‘Р С•Р Р† РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• РЎРѓР С•Р В±РЎР‚Р В°Р Р…Р В°!');
      setStatusType('success');
    } catch (err) {
      console.error('Gallery generation error:', err);
      setStatusText(`РІС™В РїС‘РЏ Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р С—РЎР‚Р С‘ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ Р С–Р В°Р В»Р ВµРЎР‚Р ВµР С‘: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsGalleryGenerating(false);
      setIsProcessing(false);
    }
  };

  // РІвЂўС’РІвЂўС’РІвЂўС’ A/B TEST GENERATION РІвЂўС’РІвЂўС’РІвЂўС’
  const handleGenerateABTest = async () => {
    if (!garmentUrls.length) {
      setStatusText('Р РЋР Р…Р В°РЎвЂЎР В°Р В»Р В° Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљР Вµ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°'); setStatusType('error');
      return;
    }
    const creditsNeeded = 2;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < creditsNeeded && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`РІС™РЋ Р вЂќР В»РЎРЏ Р В·Р В°Р С—РЎС“РЎРѓР С”Р В° A/B РЎвЂљР ВµРЎРѓРЎвЂљР В° Р Р…РЎС“Р В¶Р Р…Р С• 2 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР В°`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < creditsNeeded) {
      setStatusText(`РІС™РЋ Р вЂќР В»РЎРЏ Р В·Р В°Р С—РЎС“РЎРѓР С”Р В° A/B РЎвЂљР ВµРЎРѓРЎвЂљР В° Р Р…РЎС“Р В¶Р Р…Р С• 2 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР В°`); setStatusType('error');
      return;
    }

    setIsAbGenerating(true);
    setIsProcessing(true);
    setStatusType('processing');
    setStatusText('РІС™вЂ“РїС‘РЏ Р вЂ”Р В°Р С—РЎС“РЎРѓР С”Р В°Р ВµР С A/B Р СћР ВµРЎРѓРЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ (2 Р С•Р В±Р В»Р С•Р В¶Р С”Р С‘)...');

    // Р РЋР С—Р С‘РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С 2 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР В°
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
        throw new Error(deductData.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С—Р С‘РЎРѓР В°РЎвЂљРЎРЉ Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№');
      }
      refreshCreditsFromResponse(deductData);
    } catch (deductErr) {
      setStatusText(`РІС™В РїС‘РЏ Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР С—Р С‘РЎРѓР В°Р Р…Р С‘РЎРЏ Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р†: ${deductErr.message}`);
      setStatusType('error');
      setIsAbGenerating(false);
      setIsProcessing(false);
      return;
    }

    try {
      // Р вЂ™Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ A (Natural)
      setStatusText('РІС™вЂ“РїС‘РЏ Р РЃР В°Р С– 1/2: Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С РЎРѓР Р†Р ВµРЎвЂљР В»РЎвЂ№Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ (Natural)...');
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
          skipCreditDeduction: true, // Р СџРЎР‚Р С•Р С—РЎС“РЎРѓР С”Р В°Р ВµР С РЎРѓР С—Р С‘РЎРѓР В°Р Р…Р С‘Р Вµ Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р† Р Р…Р В° Р В±РЎРЊР С”Р ВµР Р…Р Т‘Р Вµ
        }),
      });
      const dataA = await safeParseJSON(respA);
      if (!dataA.success) throw new Error(dataA.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ Р С’');
      const imgA = dataA.imageBase64 || dataA.imageUrl;

      // Р вЂ™Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ B (Epic)
      setStatusText('РІС™вЂ“РїС‘РЏ Р РЃР В°Р С– 2/2: Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С РЎвЂљРЎвЂР СР Р…РЎвЂ№Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ (Epic)...');
      const seedB = Math.floor(Math.random() * 1000000) + 7; // Р вЂќРЎР‚РЎС“Р С–Р С•Р в„– РЎРѓР С‘Р Т‘ Р Т‘Р В»РЎРЏ РЎС“Р Р…Р С‘Р С”Р В°Р В»РЎРЉР Р…Р С•РЎРѓРЎвЂљР С‘
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
          skipCreditDeduction: true, // Р СџРЎР‚Р С•Р С—РЎС“РЎРѓР С”Р В°Р ВµР С РЎРѓР С—Р С‘РЎРѓР В°Р Р…Р С‘Р Вµ Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р† Р Р…Р В° Р В±РЎРЊР С”Р ВµР Р…Р Т‘Р Вµ
        }),
      });
      const dataB = await safeParseJSON(respB);
      if (!dataB.success) throw new Error(dataB.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ B');
      const imgB = dataB.imageBase64 || dataB.imageUrl;

      setQuickResults(prev => ({ ...prev, abTest: [imgA, imgB] }));
      setStatusText('РІСљвЂ¦ Р С’Р В»РЎРЉРЎвЂљР ВµРЎР‚Р Р…Р В°РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р Вµ Р С•Р В±Р В»Р С•Р В¶Р С”Р С‘ Р Т‘Р В»РЎРЏ A/B Р СћР ВµРЎРѓРЎвЂљР В° Р С–Р С•РЎвЂљР С•Р Р†РЎвЂ№!');
      setStatusType('success');
    } catch (err) {
      console.error('A/B test generation error:', err);
      setStatusText(`РІС™В РїС‘РЏ Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р С—РЎР‚Р С‘ A/B РЎвЂљР ВµРЎРѓРЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р С‘: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsAbGenerating(false);
      setIsProcessing(false);
    }
  };

  const triggerConfirm = (type, cost, onConfirm) => {
    setConfirmModal({ type, cost, onConfirm });
  };

  // РІвЂўС’РІвЂўС’РІвЂўС’ QUICK MODE V2 РІР‚вЂќ GPT Image 2 card generation РІвЂўС’РІвЂўС’РІвЂўС’
  const handleQuickGenerate = async () => {
    if (!garmentUrls.length) {
      setStatusText('Р РЋР Р…Р В°РЎвЂЎР В°Р В»Р В° Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљР Вµ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°'); setStatusType('error');
      return;
    }
    const isCardMode = quickMode === 'card';
    const isUgcMode = quickMode === 'ugc';
    const isModelMode = quickMode === 'model';
    const creditsNeeded = isCardMode ? 2 : 1;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < creditsNeeded && !subscription?.local) {
      setShowPricing(true);
      setStatusText(`РІС™РЋ Р вЂќР В»РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ Р Р…РЎС“Р В¶Р Р…Р С• ${creditsNeeded} Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљ${creditsNeeded > 1 ? 'Р В°' : ''}`); setStatusType('error');
      return;
    }
    if (subscription?.local && creditsAvailable < creditsNeeded) {
      setStatusText(`РІС™РЋ Р вЂќР В»РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ Р Р…РЎС“Р В¶Р Р…Р С• ${creditsNeeded} Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљ${creditsNeeded > 1 ? 'Р В°' : ''}`); setStatusType('error');
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
    setStatusText(isCardMode ? 'СЂСџвЂњвЂ№ Р РЋР С•Р В·Р Т‘Р В°РЎвЂР С Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В°...' : isUgcMode ? 'СЂСџвЂњВ± Р РЋР С•Р В·Р Т‘Р В°РЎвЂР С РЎвЂћР С•РЎвЂљР С• Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»РЎРЏ...' : isModelMode ? 'СЂСџвЂВ¤ Р РЋР С•Р В·Р Т‘Р В°РЎвЂР С Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹...' : 'СЂСџР‹РЃ Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С РЎРѓРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…РЎвЂ№Р в„– Р С”Р В°Р Т‘РЎР‚...');
    setStatusType('processing');

    const statusMessages = isCardMode
      ? ['СЂСџвЂњвЂ№ Р С’Р Р…Р В°Р В»Р С‘Р В·Р С‘РЎР‚РЎС“Р ВµР С РЎвЂљР С•Р Р†Р В°РЎР‚...', 'СЂСџР‹РЃ Р СџР С•Р Т‘Р В±Р С‘РЎР‚Р В°Р ВµР С Р Т‘Р С‘Р В·Р В°Р в„–Р Р… Р С‘ РЎвЂљР ВµР С”РЎРѓРЎвЂљРЎвЂ№...', 'СЂСџвЂњС’ Р С™Р С•Р СР С—Р С•Р Р…РЎС“Р ВµР С Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“...', 'РІСљРЃ Р В¤Р С‘Р Р…Р В°Р В»РЎРЉР Р…Р В°РЎРЏ Р С—Р С•Р В»Р С‘РЎР‚Р С•Р Р†Р С”Р В°...']
      : isModelMode
      ? ['СЂСџвЂВ¤ Р С’Р Р…Р В°Р В»Р С‘Р В·Р С‘РЎР‚РЎС“Р ВµР С РЎвЂљР С•Р Р†Р В°РЎР‚...', 'СЂСџвЂвЂ” Р СџР С•Р Т‘Р В±Р С‘РЎР‚Р В°Р ВµР С Р СР С•Р Т‘Р ВµР В»РЎРЉ...', 'СЂСџР‹РЃ Р С™Р С•Р СР С—Р С•Р Р…РЎС“Р ВµР С Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“...', 'РІСљРЃ Р В¤Р С‘Р Р…Р В°Р В»РЎРЉР Р…Р В°РЎРЏ Р С—Р С•Р В»Р С‘РЎР‚Р С•Р Р†Р С”Р В°...']
      : isUgcMode
      ? ['СЂСџвЂњВ± Р В Р В°РЎРѓР С—Р С•Р В·Р Р…Р В°РЎвЂР С РЎвЂљР С•Р Р†Р В°РЎР‚...', 'СЂСџРЏВ  Р СџР С•Р Т‘Р В±Р С‘РЎР‚Р В°Р ВµР С Р Т‘Р С•Р СР В°РЎв‚¬Р Р…РЎР‹РЎР‹ РЎРѓРЎвЂ Р ВµР Р…РЎС“...', 'СЂСџвЂњВ· Р ВР СР С‘РЎвЂљР С‘РЎР‚РЎС“Р ВµР С РЎРѓР Р…Р С‘Р СР С•Р С” Р Р…Р В° РЎРѓР СР В°РЎР‚РЎвЂљРЎвЂћР С•Р Р…...', 'РІСљРЃ Р вЂќР С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С РЎР‚Р ВµР В°Р В»Р С‘Р В·Р С...']
      : ['СЂСџвЂњС‘ Р вЂ™РЎвЂ№РЎРѓРЎвЂљР В°Р Р†Р В»РЎРЏР ВµР С РЎРѓР Р†Р ВµРЎвЂљ...', 'СЂСџР‹РЃ Р В Р ВµР Р…Р Т‘Р ВµРЎР‚Р С‘Р С Р С”Р В°Р Т‘РЎР‚...', 'РІСљРЃ Р В¤Р С‘Р Р…Р В°Р В»РЎРЉР Р…Р В°РЎРЏ Р С—Р С•Р В»Р С‘РЎР‚Р С•Р Р†Р С”Р В°...'];
    let msgIdx = 0;
    const statusIv = setInterval(() => {
      msgIdx = (msgIdx + 1) % statusMessages.length;
      setStatusText(statusMessages[msgIdx]);
    }, 6000);

    try {
      if (isModelMode) {
        // РІвЂўС’РІвЂўС’РІвЂўС’ MODEL MODE: Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹ РЎвЂЎР ВµРЎР‚Р ВµР В· GPT Image 2 РІвЂўС’РІвЂўС’РІвЂўС’
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
          setCardEditHistory([{ image: img, editText: 'Р С›РЎР‚Р С‘Р С–Р С‘Р Р…Р В°Р В»' }]);
          setQuickResults(prev => ({...prev, model: { image: img, editHistory: [{ image: img, editText: 'Р С›РЎР‚Р С‘Р С–Р С‘Р Р…Р В°Р В»' }] }}));
          setStatusText('РІСљвЂ¦ Р С™Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹ Р С–Р С•РЎвЂљР С•Р Р†Р В°!');
          setStatusType('success');
        } else {
          setStatusText(`РІС™В РїС‘РЏ ${data.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С• РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹'}`);
          setStatusType('error');
        }
      } else if (isUgcMode) {
        // РІвЂўС’РІвЂўС’РІвЂўС’ UGC MODE: РЎР‚Р ВµР В°Р В»Р С‘РЎРѓРЎвЂљР С‘РЎвЂЎР Р…Р С•Р Вµ РЎвЂћР С•РЎвЂљР С• Р’В«Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»РЎРЏР’В» РЎвЂЎР ВµРЎР‚Р ВµР В· GPT Image 2 РІвЂўС’РІвЂўС’РІвЂўС’
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
          setStatusText('РІСљвЂ¦ Р В¤Р С•РЎвЂљР С• Р’В«Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»РЎРЏР’В» Р С–Р С•РЎвЂљР С•Р Р†Р С•!');
          setStatusType('success');
        } else {
          setStatusText(`РІС™В РїС‘РЏ ${data.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ UGC-РЎвЂћР С•РЎвЂљР С•'}`);
          setStatusType('error');
        }
      } else if (isCardMode) {
        // РІвЂўС’РІвЂўС’РІвЂўС’ CARD MODE: Р С—Р С•Р В»Р Р…Р С•РЎвЂ Р ВµР Р…Р Р…Р В°РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В° РЎвЂЎР ВµРЎР‚Р ВµР В· GPT Image 2 РІвЂўС’РІвЂўС’РІвЂўС’
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
          setCardEditHistory([{ image: img, editText: 'Р С›РЎР‚Р С‘Р С–Р С‘Р Р…Р В°Р В»' }]);
          setQuickResults(prev => ({...prev, card: { image: img, editHistory: [{ image: img, editText: 'Р С›РЎР‚Р С‘Р С–Р С‘Р Р…Р В°Р В»' }] }}));
          setStatusText('РІСљвЂ¦ Р С™Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° Р С–Р С•РЎвЂљР С•Р Р†Р В°! Р вЂ™РЎвЂ№ Р СР С•Р В¶Р ВµРЎвЂљР Вµ Р С•РЎвЂљРЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ РЎР‚Р ВµР В·РЎС“Р В»РЎРЉРЎвЂљР В°РЎвЂљ.');
          setStatusType('success');
        } else {
          setStatusText(`РІС™В РїС‘РЏ ${data.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“'}`);
          setStatusType('error');
        }
      } else {
        // РІвЂўС’РІвЂўС’РІвЂўС’ PHOTO MODE: Р С”РЎР‚Р В°РЎРѓР С‘Р Р†РЎвЂ№Р в„– РЎРѓРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…РЎвЂ№Р в„– Р С”Р В°Р Т‘РЎР‚ (Product Mode pipeline) РІвЂўС’РІвЂўС’РІвЂўС’
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
          setStatusText('РІСљвЂ¦ Р РЋРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…Р С•Р Вµ РЎвЂћР С•РЎвЂљР С• Р С–Р С•РЎвЂљР С•Р Р†Р С•!');
          setStatusType('success');
        } else {
          setStatusText(`РІС™В РїС‘РЏ ${data.error || 'Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С•'}`);
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
        setStatusText('РІвЂєвЂќ Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р С•РЎвЂљР СР ВµР Р…Р ВµР Р…Р В°');
        setStatusType('error');
      } else {
        setStatusText(`РІС™В РїС‘РЏ Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${err.message}`);
        setStatusType('error');
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  // РІвЂўС’РІвЂўС’РІвЂўС’ CARD EDIT РІР‚вЂќ РЎвЂљР ВµР С”РЎРѓРЎвЂљР С•Р Р†Р С•Р Вµ РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘ РЎвЂЎР ВµРЎР‚Р ВµР В· GPT Image 2 РІвЂўС’РІвЂўС’РІвЂўС’
  const handleCardEdit = async () => {
    if (!cardEditText.trim() || !quickCardImage) return;
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < 1 && !subscription?.local) {
      setShowPricing(true);
      setStatusText('РІС™РЋ Р вЂќР В»РЎРЏ РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ Р Р…РЎС“Р В¶Р ВµР Р… 1 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљ'); setStatusType('error');
      return;
    }

    setIsCardEditing(true);
    setStatusText('РІСљРЏРїС‘РЏ Р СџРЎР‚Р С‘Р СР ВµР Р…РЎРЏР ВµР С Р С‘Р В·Р СР ВµР Р…Р ВµР Р…Р С‘РЎРЏ...'); setStatusType('processing');

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
        setStatusText('РІСљвЂ¦ Р ВР В·Р СР ВµР Р…Р ВµР Р…Р С‘РЎРЏ Р С—РЎР‚Р С‘Р СР ВµР Р…Р ВµР Р…РЎвЂ№!'); setStatusType('success');
      } else {
        setStatusText(`РІС™В РїС‘РЏ ${data.error || 'Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ'}`); setStatusType('error');
      }
    } catch (err) {
      setStatusText(`РІС™В РїС‘РЏ Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${err.message}`); setStatusType('error');
    } finally {
      setIsCardEditing(false);
    }
  };


  // Auto-Catalog integration
  const handleAutoCatalog = async () => {
    if (!garmentUrls.length) {
      setStatusText('Р РЋР Р…Р В°РЎвЂЎР В°Р В»Р В° Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљР Вµ РЎвЂћР С•РЎвЂљР С• Р С•Р Т‘Р ВµР В¶Р Т‘РЎвЂ№'); setStatusType('error');
      return;
    }
    
    // РІвЂўС’РІвЂўС’РІвЂўС’ SUBSCRIPTION CHECK (requires 3 credits) РІвЂўС’РІвЂўС’РІвЂўС’
    const creditsAvailable = subscription?.credits || 0;
    if (creditsAvailable < 3 && !subscription?.local) {
      setShowPricing(true);
      setStatusText('РІС™РЋ Р вЂќР В»РЎРЏ Р В°Р Р†РЎвЂљР С•Р С”Р В°РЎвЂљР В°Р В»Р С•Р С–Р В° РЎвЂљРЎР‚Р ВµР В±РЎС“Р ВµРЎвЂљРЎРѓРЎРЏ Р СР С‘Р Р…Р С‘Р СРЎС“Р С 3 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР В°'); setStatusType('error');
      return;
    }
    if (subscription?.local && (subscription.credits || 0) < 3) {
      setStatusText('РІС™РЋ Р вЂќР В»РЎРЏ Р В°Р Р†РЎвЂљР С•Р С”Р В°РЎвЂљР В°Р В»Р С•Р С–Р В° РЎвЂљРЎР‚Р ВµР В±РЎС“Р ВµРЎвЂљРЎРѓРЎРЏ Р СР С‘Р Р…Р С‘Р СРЎС“Р С 3 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР В°'); setStatusType('error');
      return;
    }

    setStatusText('Р С›РЎвЂљР С—РЎР‚Р В°Р Р†Р С”Р В° Р В±Р В°РЎвЂљРЎвЂЎР В° Р Р† Auto-Catalog...'); setStatusType('');
    
    // Transform uploaded garment URLs into SKU items
    const items = garmentUrls.map((url, i) => ({
      skuId: `SKU-${Date.now()}-${i}`,
      name: `Р СћР С•Р Р†Р В°РЎР‚ ${i + 1}`,
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
        // Р РЋР С—Р С‘РЎРѓР В°Р Р…Р С‘Р Вµ 3 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р† (Р В»Р С•Р С”Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– РЎРѓР ВµРЎР‚Р Р†Р ВµРЎР‚ РІР‚вЂќ Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С Р С•Р С—РЎвЂљР С‘Р СР С‘РЎРѓРЎвЂљР С‘РЎвЂЎР Р…Р С•Р Вµ РЎРѓР С—Р С‘РЎРѓР В°Р Р…Р С‘Р Вµ)
        setSubscription(prev => ({ ...prev, credits: Math.max(0, (prev.credits || 0) - 3) }));

        setStatusText(`РІСљвЂ¦ Auto-Catalog Р В·Р В°Р С—РЎС“РЎвЂ°Р ВµР Р…! Р вЂР В°РЎвЂљРЎвЂЎ Р С•РЎвЂљР С—РЎР‚Р В°Р Р†Р В»Р ВµР Р… Р Р…Р В° РЎвЂћР С•Р Р…Р С•Р Р†РЎС“РЎР‹ Р С•Р В±РЎР‚Р В°Р В±Р С•РЎвЂљР С”РЎС“.`);
        setStatusType('success');
      } else {
        setStatusText(`РІСњРЉ Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${data.error}`);
        setStatusType('error');
      }
    } catch (err) {
      setStatusText(`РІСњРЉ Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎРѓР ВµРЎвЂљР С‘: ${err.message}. Р Р€Р В±Р ВµР Т‘Р С‘РЎвЂљР ВµРЎРѓРЎРЉ РЎвЂЎРЎвЂљР С• РЎРѓР ВµРЎР‚Р Р†Р ВµРЎР‚ Р Р…Р В° Р С—Р С•РЎР‚РЎвЂљРЎС“ 3002 Р В·Р В°Р С—РЎС“РЎвЂ°Р ВµР Р….`);
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
    setStatusText(`СЂСџвЂњС‘ Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С Р ВµРЎвЂ°РЎвЂ ${count} Р С”Р В°Р Т‘РЎР‚Р С•Р Р†...`); setStatusType('');
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
        // Р СљР С•Р Т‘Р ВµР В»РЎРЉ-РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С” Р Р† РЎвЂћР С•РЎвЂљР С•РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р†
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

      // SEQUENTIAL generation РІР‚вЂќ one at a time, each gets full 55s before timeout
      // This avoids rate-limiting and ensures each frame gets the full Vercel 60s window
      let successCount = 0;
      for (let idx = 0; idx < angles.length; idx++) {
        const angle = angles[idx];
        const slotIdx = existingCount + idx;
        setStatusText(`СЂСџвЂњС‘ Р С™Р В°Р Т‘РЎР‚ ${idx + 1}/${count}...`); setStatusType('');
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
            console.warn(`Р С™Р В°Р Т‘РЎР‚ ${idx + 1}: ${data.details || data.error}`);
            // Remove the null placeholder for failed frame
            setPhotoshootImages(prev => { const n = [...prev]; n[slotIdx] = null; return n; });
          }
        } catch (frameErr) {
          if (frameErr.name === 'AbortError') {
            console.warn(`Р С™Р В°Р Т‘РЎР‚ ${idx + 1}: РЎвЂљР В°Р в„–Р СР В°РЎС“РЎвЂљ 55 РЎРѓР ВµР С”`);
          } else {
            console.warn(`Р С™Р В°Р Т‘РЎР‚ ${idx + 1} Р С•РЎв‚¬Р С‘Р В±Р С”Р В°:`, frameErr.message);
          }
          // Remove null placeholder
          setPhotoshootImages(prev => { const n = [...prev]; n[slotIdx] = null; return n; });
        }
      }
      // Clean up nulls from failed frames
      setPhotoshootImages(prev => prev.filter(Boolean));
      setStatusText(successCount > 0 ? `СЂСџР‹вЂ° Р В¤Р С•РЎвЂљР С•РЎРѓР ВµРЎРѓРЎРѓР С‘РЎРЏ: ${successCount} Р С”Р В°Р Т‘РЎР‚Р С•Р Р† Р С–Р С•РЎвЂљР С•Р Р†Р С•!` : 'РІСњРЉ Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р Р…Р С‘ Р С•Р Т‘Р Р…Р С•Р С–Р С• Р С”Р В°Р Т‘РЎР‚Р В°. Р СџР С•Р С—РЎР‚Р С•Р В±РЎС“Р в„–РЎвЂљР Вµ РЎРѓР Р…Р С•Р Р†Р В°.');
      setStatusType(successCount > 0 ? 'success' : 'error');
    } catch (err) { setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎвЂћР С•РЎвЂљР С•РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘: ${err.message}`); setStatusType('error'); }
    finally { setIsPhotoshooting(false); }
  };

  // РІвЂўС’РІвЂўС’РІвЂўС’ PER-PHOTO EDITOR РІвЂўС’РІвЂўС’РІвЂўС’
  // Takes a specific photo from the photoshoot gallery, sends it with an edit instruction,
  // and replaces the original photo with the result.
  const handlePhotoEdit = async () => {
    if (editingPhotoIdx === null || !photoEditText.trim()) return;
    const idx = editingPhotoIdx;
    const instruction = photoEditText.trim();
    const currentVersions = photoHistory[idx] || [photoshootImages[idx]];
    const currentImg = currentVersions[currentVersions.length - 1];
    if (!currentImg) return;

    // Close modal immediately РІР‚вЂќ editing runs in background
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
        setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В° РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ Р С”Р В°Р Т‘РЎР‚Р В° ${idx + 1}: ${data.details || data.error}`); setStatusType('error');
      }
    } catch (err) {
      setStatusText(`Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ${err.message}`); setStatusType('error');
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
    setStatusText('РІСљвЂ¦ Р СњР В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• Р В·Р В°Р С–РЎР‚РЎС“Р В¶Р ВµР Р…РЎвЂ№!');
    setStatusType('success');
  };

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <motion.h1 className="app-logo" initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} transition={{duration:0.6}}>Р РЋР ВµР В»Р В»Р ВµРЎР‚-Р РЋРЎвЂљРЎС“Р Т‘Р С‘РЎРЏ</motion.h1>
        <p className="app-subtitle">Р ВР В-РЎвЂћР С•РЎвЂљР С•РЎРѓРЎвЂљРЎС“Р Т‘Р С‘РЎРЏ Р Т‘Р В»РЎРЏ Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР С•Р Р† Ozon, WB Р С‘ Р Т‘РЎР‚РЎС“Р С–Р С‘РЎвЂ¦</p>
        
        {/* Р СџРЎР‚Р ВµР СР С‘Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р С—Р ВµРЎР‚Р ВµР С”Р В»РЎР‹РЎвЂЎР В°РЎвЂљР ВµР В»РЎРЉ РЎР‚Р ВµР В¶Р С‘Р СР С•Р Р† */}
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
              СЂСџвЂвЂў Р С›Р Т‘Р ВµР В¶Р Т‘Р В°
            </button>
            <button
              className={`mode-btn ${appMode === 'product' ? 'active' : ''}`}
              onClick={() => { setAppMode('product'); setQuickCardImage(null); setCardEditHistory([]); }}
            >
              СЂСџвЂњВ¦ Р СџРЎР‚Р ВµР Т‘Р СР ВµРЎвЂљР С”Р В°
            </button>
            <button
              className={`mode-btn ${appMode === 'quick' ? 'active' : ''}`}
              onClick={() => { setAppMode('quick'); setGeneratedImage(null); }}
            >
              РІС™РЋ Р вЂ™ Р Т‘Р Р†Р В° Р С”Р В»Р С‘Р С”Р В°
            </button>
          </div>
        </div>

        <div style={{marginTop:16,display:'flex',alignItems:'center',justifyContent:'center',gap:8,flexWrap:'wrap'}}>
          <SubscriptionBadge subscription={subscription} onClick={() => setShowPricing(true)} />
          <button className="my-history-btn" onClick={() => setShowHistory(true)} title="Р СљР С•Р С‘ РЎР‚Р В°Р В±Р С•РЎвЂљРЎвЂ№">
            СЂСџвЂ“СРїС‘РЏ Р СљР С•Р С‘ РЎР‚Р В°Р В±Р С•РЎвЂљРЎвЂ№
          </button>
          <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{user.displayName || user.email}</span>
          {!isEmbedded && <button onClick={signOut} style={{fontSize:'0.7rem',color:'var(--text-muted)',background:'none',border:'1px solid var(--border-subtle)',borderRadius:'9999px',padding:'4px 14px',cursor:'pointer',fontFamily:'var(--font-body)',letterSpacing:'1px',textTransform:'uppercase'}}>Р вЂ™РЎвЂ№Р в„–РЎвЂљР С‘</button>}
        </div>
      </header>

      {/* РІвЂўС’РІвЂўС’РІвЂўС’ PRICING MODAL РІвЂўС’РІвЂўС’РІвЂўС’ */}
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

      {/* РІвЂўС’РІвЂўС’РІвЂўС’ CONFIRM MODAL РІвЂўС’РІвЂўС’РІвЂўС’ */}
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
              {confirmModal.type === 'gallery' ? 'СЂСџвЂњС‘ Р РЋР С•Р В±РЎР‚Р В°РЎвЂљРЎРЉ Р С–Р В°Р В»Р ВµРЎР‚Р ВµРЎР‹?' : 
               confirmModal.type === 'ab' ? 'РІС™вЂ“РїС‘РЏ Р вЂ”Р В°Р С—РЎС“РЎРѓРЎвЂљР С‘РЎвЂљРЎРЉ A/B Р СћР ВµРЎРѓРЎвЂљ?' : 
               confirmModal.type === 'video' ? 'СЂСџР‹В¬ Р С›Р В¶Р С‘Р Р†Р С‘РЎвЂљРЎРЉ Р Р† Р вЂ™Р С‘Р Т‘Р ВµР С•Р С•Р В±Р В»Р С•Р В¶Р С”РЎС“?' : 
               confirmModal.type === 'batch' ? 'СЂСџвЂњС‘ Р вЂ”Р В°Р С—РЎС“РЎРѓРЎвЂљР С‘РЎвЂљРЎРЉ РЎРѓР ВµРЎР‚Р С‘РЎР‹ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р в„–?' :
               'СЂСџвЂњВ± Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С• Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»Р ВµР в„–?'}
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px 0', textAlign: 'center', lineHeight: 1.5 }}>
              {confirmModal.type === 'gallery' ? 'Р ВР В РЎРѓР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµРЎвЂљ 3 Р Т‘Р С•Р С—Р С•Р В»Р Р…Р С‘РЎвЂљР ВµР В»РЎРЉР Р…РЎвЂ№РЎвЂ¦ РЎРѓР В»Р В°Р в„–Р Т‘Р В° Р Р†Р С•РЎР‚Р С•Р Р…Р С”Р С‘ (Р С”РЎР‚РЎС“Р С—Р Р…РЎвЂ№Р в„– Р С—Р В»Р В°Р Р… Р Т‘Р ВµРЎвЂљР В°Р В»Р ВµР в„–, РЎР‚Р В°Р В·Р СР ВµРЎР‚РЎвЂ№ Р С‘ lifestyle-Р С”Р В°Р Т‘РЎР‚) Р Р…Р В° Р С•РЎРѓР Р…Р С•Р Р†Р Вµ Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р…Р Р…Р С•Р С–Р С• Р С”Р В°Р Т‘РЎР‚Р В°.' : 
               confirmModal.type === 'ab' ? 'Р ВР В РЎРѓР С•Р В·Р Т‘Р В°РЎРѓРЎвЂљ 2 Р В°Р В»РЎРЉРЎвЂљР ВµРЎР‚Р Р…Р В°РЎвЂљР С‘Р Р†Р Р…РЎвЂ№РЎвЂ¦ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР В° Р С•Р В±Р В»Р С•Р В¶Р С”Р С‘ (РЎРѓР Р†Р ВµРЎвЂљР В»РЎвЂ№Р в„– Р С‘ РЎвЂљР ВµР СР Р…РЎвЂ№Р в„– РЎРѓРЎвЂљР С‘Р В»Р С‘) Р Т‘Р В»РЎРЏ РЎвЂљР ВµРЎРѓРЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ CTR.' : 
               confirmModal.type === 'video' ? 'Р ВР В РЎРѓР С•Р В·Р Т‘Р В°РЎРѓРЎвЂљ 3D-Р В°Р Р…Р С‘Р СР В°РЎвЂ Р С‘РЎР‹ Р С‘ motion-РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљРЎвЂ№ Р Т‘Р В»РЎРЏ Р Р†Р С‘Р Т‘Р ВµР С•Р С•Р В±Р В»Р С•Р В¶Р С”Р С‘.' : 
               confirmModal.type === 'batch' ? `Р ВР В РЎРѓР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµРЎвЂљ РЎРѓР ВµРЎР‚Р С‘РЎР‹ Р С‘Р В· ${confirmModal.cost} Р С”Р В°Р Т‘РЎР‚Р С•Р Р† Р Р…Р В° Р С•РЎРѓР Р…Р С•Р Р†Р Вµ Р Р†Р В°РЎв‚¬Р С‘РЎвЂ¦ Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР С” Р СРЎС“Р В»РЎРЉРЎвЂљР С‘Р Р†РЎвЂ№Р В±Р С•РЎР‚Р В°. Р С™Р В°Р Т‘РЎР‚РЎвЂ№ Р В±РЎС“Р Т‘РЎС“РЎвЂљ РЎРѓР С•Р В·Р Т‘Р В°Р Р†Р В°РЎвЂљРЎРЉРЎРѓРЎРЏ Р С—Р В°РЎР‚Р В°Р В»Р В»Р ВµР В»РЎРЉР Р…Р С•.` :
               'Р ВР В Р С—Р ВµРЎР‚Р ВµР Р…Р ВµРЎРѓР ВµРЎвЂљ РЎвЂљР С•Р Р†Р В°РЎР‚ РЎРѓ Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р…Р Р…Р С•Р С–Р С• Р С”Р В°Р Т‘РЎР‚Р В° Р Р† Р Т‘Р С•Р СР В°РЎв‚¬Р Р…РЎР‹РЎР‹ РЎР‚Р ВµР В°Р В»Р С‘РЎРѓРЎвЂљР С‘РЎвЂЎР Р…РЎС“РЎР‹ Р С•Р В±РЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р С”РЎС“.'}
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
                  alt="Р ВРЎРѓРЎвЂ¦Р С•Р Т‘Р Р…РЎвЂ№Р в„– Р С”Р В°Р Т‘РЎР‚" 
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
                Р ВРЎРѓРЎвЂ¦Р С•Р Т‘Р Р…РЎвЂ№Р в„– Р С”Р В°Р Т‘РЎР‚
              </div>
            </div>
            )}

            <div style={{ margin: '15px 0 25px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Р РЋРЎвЂљР С•Р С‘Р СР С•РЎРѓРЎвЂљРЎРЉ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#ffd700', marginTop: 4 }}>
                {confirmModal.cost} Р С”РЎР‚.
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
                Р С›РЎвЂљР СР ВµР Р…Р В°
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
                Р вЂќР В°, РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* РІвЂўС’РІвЂўС’РІвЂўС’ Р СљР С›Р В Р В Р С’Р вЂР С›Р СћР В« РІвЂўС’РІвЂўС’РІвЂўС’ */}
      {showHistory && <MyHistoryPage onClose={() => setShowHistory(false)} onReuseSettings={handleReuseSettings} />}

      {/* РІвЂўС’РІвЂўС’РІвЂўС’ QUICK MODE PANEL РІвЂўС’РІвЂўС’РІвЂўС’ */}
      {appMode === 'quick' && !generatedImage && (
        <motion.div className="section quick-mode-panel" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.1,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
            <span><span className="icon">РІС™РЋ</span> Р вЂ™ Р Т‘Р Р†Р В° Р С”Р В»Р С‘Р С”Р В°</span>
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
                СЂСџвЂРѓРїС‘РЏ Р СџР С•Р С”Р В°Р В·Р В°РЎвЂљРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р Р…Р С•Р Вµ
              </button>
            )}
          </div>
          <p className="quick-mode-subtitle">Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљР Вµ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В° РІР‚вЂќ Р С—Р С•Р В»РЎС“РЎвЂЎР С‘РЎвЂљР Вµ Р С–Р С•РЎвЂљР С•Р Р†РЎС“РЎР‹ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ Р Т‘Р В»РЎРЏ Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В°</p>

          {/* Upload zone РІР‚вЂќ reuse garmentUrls */}
          <div className="quick-upload-zone">
            {previewUrls.length > 0 ? (
              <div className="multi-preview-grid">
                {previewUrls.map((url, i) => (
                  <div key={i} className="multi-preview-item">
                    <img src={url} alt={`Р СћР С•Р Р†Р В°РЎР‚ ${i+1}`} style={{cursor:'zoom-in'}} onClick={() => setLightboxSrc(url)} />
                    <button className="remove-preview" onClick={() => removeFile(i)}>РІСљвЂў</button>
                  </div>
                ))}
              </div>
            ) : (
              <label className="drop-zone compact" htmlFor="quick-upload">
                <span className="dz-emoji">СЂСџвЂњВ·</span>
                <span className="dz-text">Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљР Вµ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°</span>
                <input id="quick-upload" type="file" accept="image/*" multiple onChange={handleFilesChange} style={{display:'none'}} />
              </label>
            )}
          </div>

          {/* РІвЂўС’РІвЂўС’РІвЂўС’ MODE TOGGLE: Р С™РЎР‚Р В°РЎРѓР С‘Р Р†РЎвЂ№Р в„– Р С”Р В°Р Т‘РЎР‚ / Р вЂњР С•РЎвЂљР С•Р Р†Р В°РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° / UGC РІвЂўС’РІвЂўС’РІвЂўС’ */}
          <div className="card-style-picker" style={{marginBottom: 16}}>
            <div className="card-style-label">Р В§РЎвЂљР С• РЎРѓР С•Р В·Р Т‘Р В°РЎвЂР С:</div>
            <div className="card-style-options">
              <button
                className={`card-style-btn ${quickMode === 'photo' ? 'active' : ''}`}
                onClick={() => setQuickMode('photo')}
              >
                <span className="card-style-icon">СЂСџР‹РЃ</span>
                <span className="card-style-name">Р С™РЎР‚Р В°РЎРѓР С‘Р Р†РЎвЂ№Р в„– Р С”Р В°Р Т‘РЎР‚</span>
                <span className="card-style-desc">Р РЋРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…Р С•Р Вµ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°</span>
              </button>
              <button
                className={`card-style-btn ${quickMode === 'card' ? 'active' : ''}`}
                onClick={() => setQuickMode('card')}
              >
                <span className="card-style-icon">СЂСџвЂњвЂ№</span>
                <span className="card-style-name">Р вЂњР С•РЎвЂљР С•Р Р†Р В°РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В°</span>
                <span className="card-style-desc">Р ВР Р…РЎвЂћР С•Р С–РЎР‚Р В°РЎвЂћР С‘Р С”Р В° Р Т‘Р В»РЎРЏ Р СР В°РЎР‚Р С”Р ВµРЎвЂљР С—Р В»Р ВµР в„–РЎРѓР В°</span>
              </button>
              <button
                className={`card-style-btn ${quickMode === 'ugc' ? 'active' : ''}`}
                onClick={() => setQuickMode('ugc')}
              >
                <span className="card-style-icon">СЂСџвЂњВ±</span>
                <span className="card-style-name">Р В¤Р С•РЎвЂљР С• Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»Р ВµР в„–</span>
                <span className="card-style-desc">Р В Р ВµР В°Р В»Р С‘РЎРѓРЎвЂљР С‘РЎвЂЎР Р…РЎвЂ№Р Вµ РЎвЂћР С•РЎвЂљР С• Р Т‘Р В»РЎРЏ Р С•РЎвЂљР В·РЎвЂ№Р Р†Р С•Р Р†</span>
              </button>
              <button
                className={`card-style-btn ${quickMode === 'model' ? 'active' : ''}`}
                onClick={() => setQuickMode('model')}
              >
                <span className="card-style-icon">СЂСџвЂВ¤</span>
                <span className="card-style-name">Р В¤Р С•РЎвЂљР С• РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹</span>
                <span className="card-style-desc">Р СљР С•Р Т‘Р ВµР В»РЎРЉ Р С—Р С•Р В·Р С‘РЎР‚РЎС“Р ВµРЎвЂљ РЎРѓ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р С</span>
              </button>
            </div>
          </div>

          {/* РІвЂўС’РІвЂўС’РІвЂўС’ CARD MODE: РЎРѓРЎвЂљР С‘Р В»РЎРЉ + Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎРЏ Р С• РЎвЂљР С•Р Р†Р В°РЎР‚Р Вµ РІвЂўС’РІвЂўС’РІвЂўС’ */}
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
                    РІС™РЋ Р РЋР С‘РЎРѓРЎвЂљР ВµР СР В° Р В°Р Р†РЎвЂљР С•Р СР В°РЎвЂљР С‘РЎвЂЎР ВµРЎРѓР С”Р С‘ РЎРѓР С•Р В·Р Т‘Р В°РЎРѓРЎвЂљ Р С—РЎР‚Р С•РЎвЂћР ВµРЎРѓРЎРѓР С‘Р С•Р Р…Р В°Р В»РЎРЉР Р…РЎС“РЎР‹ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ РЎвЂљР С•Р Р†Р В°РЎР‚Р В° РЎРѓ РЎвЂљР ВµР С”РЎРѓРЎвЂљР В°Р СР С‘, Р Т‘Р С‘Р В·Р В°Р в„–Р Р…Р С•Р С Р С‘ РЎвЂљР С‘Р С—Р С•Р С–РЎР‚Р В°РЎвЂћР С‘Р С”Р С•Р в„–. Р РЋРЎвЂљР С•Р С‘Р СР С•РЎРѓРЎвЂљРЎРЉ: <strong style={{color:'#ffd700'}}>2 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР В°</strong>. Р СџР С•РЎРѓР В»Р Вµ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ Р Р†РЎвЂ№ РЎРѓР СР С•Р В¶Р ВµРЎвЂљР Вµ Р С•РЎвЂљРЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ РЎР‚Р ВµР В·РЎС“Р В»РЎРЉРЎвЂљР В°РЎвЂљ (<strong>1 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљ</strong> Р В·Р В° Р С—РЎР‚Р В°Р Р†Р С”РЎС“).
                  </p>
                </div>

                {/* Card style picker */}
                <div className="card-style-picker">
                  <div className="card-style-label">Р РЋРЎвЂљР С‘Р В»РЎРЉ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘:</div>
                  <div className="card-style-options">
                    <button
                      className={`card-style-btn ${quickCardStyle === 'natural' ? 'active' : ''}`}
                      onClick={() => setQuickCardStyle('natural')}
                    >
                      <span className="card-style-icon">СЂСџРЉС—</span>
                      <span className="card-style-name">Р вЂўРЎРѓРЎвЂљР ВµРЎРѓРЎвЂљР Р†Р ВµР Р…Р Р…Р В°РЎРЏ</span>
                      <span className="card-style-desc">Р В­Р В»Р ВµР С–Р В°Р Р…РЎвЂљР Р…Р В°РЎРЏ, Р СР С‘Р Р…Р С‘Р СР В°Р В»Р С‘Р В·Р С</span>
                    </button>
                    <button
                      className={`card-style-btn ${quickCardStyle === 'epic' ? 'active' : ''}`}
                      onClick={() => setQuickCardStyle('epic')}
                    >
                      <span className="card-style-icon">СЂСџвЂќТђ</span>
                      <span className="card-style-name">Р В­Р С—Р С‘РЎвЂЎР Р…Р В°РЎРЏ</span>
                      <span className="card-style-desc">Р С™Р С‘Р Р…Р ВµР СР В°РЎвЂљР С•Р С–РЎР‚Р В°РЎвЂћ, wow</span>
                    </button>
                  </div>
                </div>

                {/* Optional product info */}
                <div style={{marginTop: 16}}>
                  <div className="detail-label" style={{marginBottom: 8}}>
                    СЂСџвЂ™РЋ Р ВР Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎРЏ Р С• РЎвЂљР С•Р Р†Р В°РЎР‚Р Вµ <span style={{color:'rgba(255,255,255,0.4)', fontSize:12}}>(Р Р…Р ВµР С•Р В±РЎРЏР В·Р В°РЎвЂљР ВµР В»РЎРЉР Р…Р С•)</span>
                  </div>
                  <textarea
                    className="modifier-input"
                    rows={3}
                    placeholder="Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: Р’В«Р С›РЎвЂћР С‘РЎРѓР Р…РЎвЂ№Р в„– РЎРѓРЎвЂљРЎС“Р В», РЎРѓРЎвЂљР В°Р В»РЎРЉР Р…Р С•Р в„– Р С”Р В°РЎР‚Р С”Р В°РЎРѓ, Р Т‘Р С• 120 Р С”Р С–, РЎвЂљР С”Р В°Р Р…РЎРЉ Р С•Р С”РЎРѓРЎвЂћР С•РЎР‚Р Т‘Р’В». Р ВР В РЎРѓР В°Р С Р С•Р С—РЎР‚Р ВµР Т‘Р ВµР В»Р С‘РЎвЂљ РЎвЂљР С•Р Р†Р В°РЎР‚ Р С—Р С• РЎвЂћР С•РЎвЂљР С• РІР‚вЂќ Р В·Р Т‘Р ВµРЎРѓРЎРЉ Р СР С•Р В¶Р Р…Р С• РЎС“РЎвЂљР С•РЎвЂЎР Р…Р С‘РЎвЂљРЎРЉ Р Т‘Р ВµРЎвЂљР В°Р В»Р С‘, РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ РЎвЂљР ВµР С”РЎРѓРЎвЂљРЎвЂ№ Р Р…Р В° Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р Вµ Р В±РЎвЂ№Р В»Р С‘ РЎвЂљР С•РЎвЂЎР Р…Р ВµР Вµ."
                    value={userProductInfo}
                    onChange={e => setUserProductInfo(e.target.value)}
                    style={{width:'100%', resize:'vertical'}}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* РІвЂўС’РІвЂўС’РІвЂўС’ PHOTO MODE: Р СР С•Р Т‘Р ВµР В»РЎРЉ-РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С” РІвЂўС’РІвЂўС’РІвЂўС’ */}
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
                    <span className="quick-toggle-text">СЂСџвЂВ¤ Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ-РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С”Р В°</span>
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
                        <button className={`tab-btn ${productModelTab==='presets'?'active':''}`} onClick={()=>{setProductModelTab('presets');setProductSavedModelId(null);}}>СЂСџР‹В­ Р СџРЎР‚Р ВµРЎРѓР ВµРЎвЂљРЎвЂ№</button>
                        <button className={`tab-btn ${productModelTab==='my_models'?'active':''}`} onClick={()=>setProductModelTab('my_models')}>РІВ­С’ Р СљР С•Р С‘ Р СљР С•Р Т‘Р ВµР В»Р С‘{myModels.length>0?` (${myModels.length})`:''}</button>
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
                            <input className="custom-variant-input" type="text" placeholder="Р С›Р С—Р С‘РЎРѓР В°РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ: Р’В«РЎР‚РЎвЂ№Р В¶Р В°РЎРЏ Р Т‘Р ВµР Р†РЎС“РЎв‚¬Р С”Р В° 25 Р В»Р ВµРЎвЂљ РЎРѓ Р Р†Р ВµРЎРѓР Р…РЎС“РЎв‚¬Р С”Р В°Р СР С‘Р’В»"
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
                                  <button className="zoom-btn" onClick={e => { e.stopPropagation(); setLightboxSrc(m.imageBase64?.[0] || m.fullbodyBase64 || m.fullbodyUrl || m.imageUrls?.[0] || ''); }}>СЂСџвЂќРЊ</button>
                                  <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteModel(m.id); }}>РІСљвЂў</button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="section-hint" style={{textAlign:'center',padding:'20px 0'}}>Р Р€ Р Р†Р В°РЎРѓ Р С—Р С•Р С”Р В° Р Р…Р ВµРЎвЂљ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎвЂР Р…Р Р…РЎвЂ№РЎвЂ¦ Р СР С•Р Т‘Р ВµР В»Р ВµР в„–.</p>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* РІвЂўС’РІвЂўС’РІвЂўС’ MODEL MODE: Р С‘Р Р…РЎвЂћР С•-Р В±Р В°Р Р…Р Р…Р ВµРЎР‚ РІвЂўС’РІвЂўС’РІвЂўС’ */}
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
                    СЂСџвЂВ¤ <strong>Р ВР В Р С—Р С•Р СР ВµРЎРѓРЎвЂљР С‘РЎвЂљ РЎвЂљР С•Р Р†Р В°РЎР‚ Р Р† РЎР‚РЎС“Р С”Р С‘ Р СР С•Р Т‘Р ВµР В»Р С‘</strong> РІР‚вЂќ РЎРѓР В°Р С Р С•Р С—РЎР‚Р ВµР Т‘Р ВµР В»Р С‘РЎвЂљ, Р С”Р В°Р С” РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С” Р В±РЎС“Р Т‘Р ВµРЎвЂљ Р Т‘Р ВµРЎР‚Р В¶Р В°РЎвЂљРЎРЉ, Р Р…Р С•РЎРѓР С‘РЎвЂљРЎРЉ Р С‘Р В»Р С‘ Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљРЎРЉ Р Р†Р В°РЎв‚¬ РЎвЂљР С•Р Р†Р В°РЎР‚.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* РІвЂўС’РІвЂўС’РІвЂўС’ UGC MODE: Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘ РЎвЂћР С•РЎвЂљР С• Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»Р ВµР в„– РІвЂўС’РІвЂўС’РІвЂўС’ */}
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
                    СЂСџвЂњВ± <strong>Р ВР В РЎРѓР С•Р В·Р Т‘Р В°РЎРѓРЎвЂљ РЎР‚Р ВµР В°Р В»Р С‘РЎРѓРЎвЂљР С‘РЎвЂЎР Р…РЎвЂ№Р Вµ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°</strong>, Р С—Р С•РЎвЂ¦Р С•Р В¶Р С‘Р Вµ Р Р…Р В° РЎРѓР Р…Р С‘Р СР С”Р С‘ РЎР‚Р ВµР В°Р В»РЎРЉР Р…РЎвЂ№РЎвЂ¦ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»Р ВµР в„– РІР‚вЂќ РЎРѓ Р Т‘Р С•Р СР В°РЎв‚¬Р Р…Р С‘Р С РЎвЂћР С•Р Р…Р С•Р С, Р ВµРЎРѓРЎвЂљР ВµРЎРѓРЎвЂљР Р†Р ВµР Р…Р Р…РЎвЂ№Р С РЎРѓР Р†Р ВµРЎвЂљР С•Р С Р С‘ Р В»РЎвЂР С–Р С”Р С‘Р С РЎв‚¬РЎС“Р СР С•Р С РЎРѓР СР В°РЎР‚РЎвЂљРЎвЂћР С•Р Р…Р В°.
                    Р РЋРЎвЂљР С•Р С‘Р СР С•РЎРѓРЎвЂљРЎРЉ: <strong style={{color:'#22c55e'}}>1 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљ</strong> Р В·Р В° РЎвЂћР С•РЎвЂљР С•.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Examples button */}
          <button className="card-examples-btn" onClick={() => setShowCardExamples(true)}>
            СЂСџвЂРѓ Р СџР С•РЎРѓР СР С•РЎвЂљРЎР‚Р ВµРЎвЂљРЎРЉ Р С—РЎР‚Р С‘Р СР ВµРЎР‚РЎвЂ№ Р Т‘Р С•/Р С—Р С•РЎРѓР В»Р Вµ
          </button>

          {/* Generate button */}
          <div className="quick-generate-row">
            <button
              className="generate-btn quick-generate-btn"
              onClick={handleQuickGenerate}
              disabled={isProcessing || !garmentUrls.length}
            >
              {isProcessing ? 'РІРЏС– Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С...' : (quickMode === 'card' ? 'СЂСџвЂњвЂ№ Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“' : quickMode === 'ugc' ? 'СЂСџвЂњВ± Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С• Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»РЎРЏ' : quickMode === 'model' ? 'СЂСџвЂВ¤ Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ РЎРѓ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹' : 'СЂСџР‹РЃ Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С•')}
            </button>
            <span className="quick-credits-hint">{quickMode === 'card' ? '2 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР В°' : '1 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљ'}</span>
          </div>
        </motion.div>
      )}


      {/* 1. Р СљР Р€Р вЂєР В¬Р СћР ВР вЂ”Р С’Р вЂњР В Р Р€Р вЂ”Р С™Р С’ */}
      {appMode !== 'quick' && <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.15,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title">
          <span className="icon">{appMode === 'product' ? 'СЂСџвЂњВ¦' : 'СЂСџвЂњС‘'}</span> 
          {appMode === 'product' ? ' Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р†' : ' Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р Р†Р ВµРЎвЂ°Р ВµР в„–'}
        </div>
        {previewUrls.length > 0 ? (
          <div className="multi-preview-grid">
            {previewUrls.map((url, i) => (
              <div key={i} className="multi-preview-item">
                <img src={url} alt={`Р С›Р В±РЎР‰Р ВµР С”РЎвЂљ ${i+1}`} style={{cursor:'zoom-in'}} onClick={() => setLightboxSrc(url)} />
                <button className="remove-btn" onClick={() => removeFile(i)}>РІСљвЂў</button>
              </div>
            ))}
            <div className="add-more-btn" onClick={() => fileInputRef.current?.click()}>
              <span className="plus">+</span><span>Р вЂўРЎвЂ°РЎвЂ</span>
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
            <div className="upload-icon">{appMode === 'product' ? 'СЂСџВ§Т‘' : 'СЂСџвЂ˜вЂў'}</div>
            <p className="upload-text">
              {appMode === 'product' ? 'Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљР Вµ РЎвЂћР С•РЎвЂљР С• Р Р†Р В°РЎв‚¬Р ВµР С–Р С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В° РІР‚вЂќ РЎвЂћР В»Р В°Р С”Р С•Р Р…, Р В±Р В°Р Р…Р С•РЎвЂЎР С”РЎС“, Р В°Р С”РЎРѓР ВµРЎРѓРЎРѓРЎС“Р В°РЎР‚' : 'Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљР Вµ РЎвЂћР С•РЎвЂљР С• Р С•Р Т‘Р ВµР В¶Р Т‘РЎвЂ№ РІР‚вЂќ РЎР‚Р В°РЎРѓР С”Р В»Р В°Р Т‘Р С”Р С‘ Р С‘Р В»Р С‘ РЎвЂћР С•РЎвЂљР С• Р Р…Р В° Р С˜Р С•Р Т‘Р ВµР В»Р С‘'}
            </p>
            <p className="upload-hint">
              {appMode === 'product' ? 'JPG, PNG РІР‚Сћ Р СџР ВµРЎР‚Р ВµРЎвЂљР В°РЎвЂ°Р С‘РЎвЂљР Вµ РЎРѓРЎР‹Р Т‘Р В° Р С‘Р В»Р С‘ Р Р…Р В°Р В¶Р С˜Р С‘РЎвЂљР Вµ РІР‚Сћ Р СџР С•РЎРѓРЎвЂљР В°РЎР‚Р В°Р в„–РЎвЂљР ВµРЎРѓРЎвЂљР Вµ РЎРѓР Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С• Р С—РЎР‚Р С‘ РЎвЂ¦Р С•РЎР‚Р С•РЎв‚¬Р ВµР С˜ РЎРѓР Р†Р ВµРЎвЂљР Вµ' : 'JPG, PNG РІР‚Сћ Р СџР ВµРЎР‚Р ВµРЎвЂљР В°РЎвЂ°Р С‘РЎвЂљР Вµ РЎРѓРЎР‹Р Т‘Р В° Р С‘Р В»Р С‘ Р Р…Р В°Р В¶Р С˜Р С‘РЎвЂљР Вµ РІР‚Сћ Р СљР С•Р В¶Р Р…Р С• Р Р…Р ВµРЎРѓР С”Р С•Р В»РЎРЉР С”Р С•: РЎвЂћРЎС“РЎвЂљР В±Р С•Р В»Р С”Р В° + Р В±РЎР‚РЎС‹Р С”Р С‘ + РЎРѓР ВµРЎР‚РЎРЉР С–Р С‘ = Р Р†РЎРѓРЎвЂ˜ Р Р…Р В° Р С˜Р С•Р Т‘Р ВµР В»Р С‘'}
            </p>
          </div>
        )}
      </motion.div>}

      {/* 2. Р СњР С’Р РЋР СћР В Р С›Р в„ўР С™Р С’ Р С›Р вЂР Р„Р вЂўР С™Р СћР С’ / Р С™Р С’Р РЋР СћР ВР СњР вЂњ-Р В Р Р€Р Сљ */}
      {appMode !== 'quick' && (appMode === 'product' ? (
        <>
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.3,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">СЂСџВ§Т‘</span> Р С™Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘РЎРЏ РЎвЂљР С•Р Р†Р В°РЎР‚Р В°</div>
          <div className="preset-grid">
            {PRODUCT_CATEGORIES.map(cat => (
              <div key={cat.id} className={`preset-card ${selectedProductCategory.id===cat.id&&!customProductPrompt?'active':''}`}
                onClick={() => { setSelectedProductCategory(cat); setCustomProductPrompt(''); }}>
                <span className="emoji">{cat.emoji}</span><span className="label">{cat.label}</span>
              </div>
            ))}
            <div className={`preset-card ${selectedProductCategory.id==='other'&&!customProductPrompt?'active':''}`}
              onClick={() => { setSelectedProductCategory({ id: 'other', label: 'Р вЂќРЎР‚РЎС“Р С–Р С•Р Вµ', emoji: 'СЂСџвЂњвЂ№', defaultPrompt: 'product item, commercial product photography' }); setCustomProductPrompt(''); }}>
              <span className="emoji">СЂСџвЂњвЂ№</span><span className="label">Р вЂќРЎР‚РЎС“Р С–Р С•Р Вµ</span>
            </div>
          </div>
          {selectedProductCategory.id === 'other' && !customProductPrompt && (
            <p className="section-hint" style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:6,textAlign:'center'}}>РІВСњРїС‘РЏ Р С›Р С—Р С‘РЎв‚¬Р С‘РЎвЂљР Вµ Р Р†Р В°РЎв‚¬ РЎвЂљР С•Р Р†Р В°РЎР‚ Р Р† Р С—Р С•Р В»Р Вµ Р Р…Р С‘Р В¶Р Вµ РІР‚вЂќ РЎРЊРЎвЂљР С• РЎС“Р В»РЎС“РЎвЂЎРЎв‚¬Р С‘РЎвЂљ Р С”Р В°РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С• Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘</p>
          )}
          <div className="custom-variant-row">
            <input className="custom-variant-input" type="text" placeholder={selectedProductCategory.id === 'other' ? 'Р С›Р С—Р С‘РЎв‚¬Р С‘РЎвЂљР Вµ Р Р†Р В°РЎв‚¬ РЎвЂљР С•Р Р†Р В°РЎР‚: Р’В«Р Р…Р В°Р В±Р С•РЎР‚ Р С”Р С‘РЎРѓРЎвЂљР ВµР в„– Р Т‘Р В»РЎРЏ Р СР В°Р С”Р С‘РЎРЏР В¶Р В° Р Р† РЎвЂЎР ВµРЎвЂ¦Р В»Р ВµР’В»' : 'Р С›Р С—Р С‘РЎРѓР В°РЎвЂљРЎРЉ РЎвЂљР С•Р Р†Р В°РЎР‚ РЎРѓ Р Р…РЎС“Р В»РЎРЏ: Р’В«Р С”РЎР‚РЎС“Р С–Р В»Р В°РЎРЏ Р В±Р В°Р Р…Р С•РЎвЂЎР С”Р В° Р С”РЎР‚Р ВµР СР В° РЎРѓ Р В·Р С•Р В»Р С•РЎвЂљР С•Р в„– Р С”РЎР‚РЎвЂ№РЎв‚¬Р С”Р С•Р в„–Р’В»'}
              value={customProductPrompt} 
              onChange={e => setCustomProductPrompt(e.target.value)} />
          </div>
        </motion.div>

        {/* РІвЂўС’РІвЂўС’РІвЂўС’ Р СљР С›Р вЂќР вЂўР вЂєР В¬-Р В§Р вЂўР вЂєР С›Р вЂ™Р вЂўР С™ Р вЂ™ Р СџР В Р вЂўР вЂќР СљР вЂўР СћР СњР С›Р в„ў Р РЋР Р„Р РѓР СљР С™Р вЂў РІвЂўС’РІвЂўС’РІвЂўС’ */}
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.35,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <span><span className="icon">СЂСџвЂВ¤</span> Р СљР С•Р Т‘Р ВµР В»РЎРЉ-РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С”</span>
            {productWithModel && (
              <motion.button 
                initial={{opacity:0, scale:0.9}}
                animate={{opacity:1, scale:1}}
                className="remove-model-btn" 
                onClick={() => setProductWithModel(false)}
              >
                РІСљвЂў Р ВРЎРѓР С”Р В»РЎР‹РЎвЂЎР С‘РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ
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
                  <div className="add-model-icon">СЂСџвЂВ¤РІСљРЃ</div>
                  <div className="add-model-info">
                    <div className="add-model-title">Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ-РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С”Р В°</div>
                    <div className="add-model-desc">
                      Р РЋР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р В¶Р С‘Р Р†РЎС“РЎР‹ Р СР С•Р Т‘Р ВµР В»РЎРЉ, Р С”Р С•РЎвЂљР С•РЎР‚Р В°РЎРЏ Р Т‘Р ВµРЎР‚Р В¶Р С‘РЎвЂљ Р С‘Р В»Р С‘ Р Т‘Р ВµР СР С•Р Р…РЎРѓРЎвЂљРЎР‚Р С‘РЎР‚РЎС“Р ВµРЎвЂљ Р Р†Р В°РЎв‚¬ РЎвЂљР С•Р Р†Р В°РЎР‚ Р Р† Р С”Р В°Р Т‘РЎР‚Р Вµ
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
                  <button className={`tab-btn ${productModelTab==='presets'?'active':''}`} onClick={()=>{setProductModelTab('presets');setProductSavedModelId(null);}}>СЂСџР‹В­ Р СџРЎР‚Р ВµРЎРѓР ВµРЎвЂљРЎвЂ№</button>
                  <button className={`tab-btn ${productModelTab==='my_models'?'active':''}`} onClick={()=>setProductModelTab('my_models')}>РІВ­С’ Р СљР С•Р С‘ Р СљР С•Р Т‘Р ВµР В»Р С‘{myModels.length>0?` (${myModels.length})`:''}</button>
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
                      <input className="custom-variant-input" type="text" placeholder="Р С›Р С—Р С‘РЎРѓР В°РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ: Р’В«РЎР‚РЎвЂ№Р В¶Р В°РЎРЏ Р Т‘Р ВµР Р†РЎС“РЎв‚¬Р С”Р В° 25 Р В»Р ВµРЎвЂљ РЎРѓ Р Р†Р ВµРЎРѓР Р…РЎС“РЎв‚¬Р С”Р В°Р СР С‘ Р Т‘Р ВµРЎР‚Р В¶Р С‘РЎвЂљ РЎвЂљР С•Р Р†Р В°РЎР‚Р’В»"
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
                            <button className="zoom-btn" onClick={e => { e.stopPropagation(); setLightboxSrc(m.imageBase64?.[0] || m.fullbodyBase64 || m.fullbodyUrl || m.imageUrls?.[0] || ''); }}>СЂСџвЂќРЊ</button>
                            <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteModel(m.id); }}>РІСљвЂў</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {myModels.length === 0 && (
                      <p className="section-hint" style={{textAlign:'center',padding:'20px 0'}}>Р Р€ Р Р†Р В°РЎРѓ Р С—Р С•Р С”Р В° Р Р…Р ВµРЎвЂљ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎвЂР Р…Р Р…РЎвЂ№РЎвЂ¦ Р СР С•Р Т‘Р ВµР В»Р ВµР в„–</p>
                    )}
                    <div className="add-location-card" style={{marginTop: myModels.length ? 12 : 0, background:'rgba(168,85,247,0.08)', borderColor:'rgba(168,85,247,0.2)'}} onClick={() => setShowPersonaWizard(true)}>
                      <span className="plus-icon" style={{color:'#a855f7'}}>СЂСџВ§вЂ</span>
                      <span style={{color:'#a855f7'}}>Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С—Р ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В¶Р В°</span>
                    </div>
                    <div className="add-location-card" style={{marginTop: 8}} onClick={() => setShowLoraModal(true)}>
                      <span className="plus-icon">+</span>
                      <span>Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ РЎРѓР Р†Р С•РЎР‹ Р СР С•Р Т‘Р ВµР В»РЎРЉ</span>
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
          <div className="section-title"><span className="icon">СЂСџвЂВ¤</span> Р С™Р В°РЎРѓРЎвЂљР С‘Р Р…Р С–-Р В РЎС“Р С РІР‚вЂќ Р Р†РЎвЂ№Р В±Р С•РЎР‚ Р СР С•Р Т‘Р ВµР В»Р С‘</div>
          <div className="tabs-row">
            <button className={`tab-btn ${modelTab==='presets'?'active':''}`} onClick={()=>{setModelTab('presets');setSelectedSavedModelId(null);}}>СЂСџР‹В­ Р СџРЎР‚Р ВµРЎРѓР ВµРЎвЂљРЎвЂ№</button>
            <button className={`tab-btn ${modelTab==='my_models'?'active':''}`} onClick={()=>setModelTab('my_models')}>РІВ­С’ Р СљР С•Р С‘ Р СљР С•Р Т‘Р ВµР В»Р С‘{myModels.length>0?` (${myModels.length})`:''}</button>
          </div>
          {modelTab === 'presets' ? (
            <>
              <GenderToggle gender={gender} setGender={setGender} />
              {/* Multi-select info popover */}
              {!customModelPrompt && !selectedSavedModelId && (selectedModels.length + customModelChips.length) > 1 && (
                <div className="multi-select-info">
                  <span className="info-icon">РІвЂћв„–РїС‘РЏ</span>
                  Р вЂ™РЎвЂ№Р В±РЎР‚Р В°Р Р…Р С• {selectedModels.length + customModelChips.length} РЎвЂљР С‘Р С—Р С•Р Р† Р СР С•Р Т‘Р ВµР В»Р ВµР в„– РІР‚вЂќ Р С”Р В°Р В¶Р Т‘РЎвЂ№Р в„– РЎвЂљР С‘Р С— = Р С•РЎвЂљР Т‘Р ВµР В»РЎРЉР Р…Р В°РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ. Р ВРЎвЂљР С•Р С–Р С•: Р“вЂ”{selectedModels.length + customModelChips.length} Р С” Р С”Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†РЎС“ Р С”Р В°Р Т‘РЎР‚Р С•Р Р†. Р СљР В°Р С”РЎРѓР С‘Р СРЎС“Р С 20 Р В·Р В° РЎР‚Р В°Р В·.
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
                              // Р СџР С•Р Р†РЎвЂљР С•РЎР‚Р Р…РЎвЂ№Р в„– Р С”Р В»Р С‘Р С” Р Р…Р В° РЎС“Р В¶Р Вµ Р В°Р С”РЎвЂљР С‘Р Р†Р Р…РЎС“РЎР‹ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ РІР‚вЂќ РЎРѓР С”РЎР‚РЎвЂ№РЎвЂљРЎРЉ/Р С—Р С•Р С”Р В°Р В·Р В°РЎвЂљРЎРЉ Р С—Р В°Р Р…Р ВµР В»РЎРЉ
                              setShowDetails(v => !v);
                            } else {
                              // Р С™Р В»Р С‘Р С” Р Р…Р В° Р Т‘РЎР‚РЎС“Р С–РЎС“РЎР‹ Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р…Р Р…РЎС“РЎР‹ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ РІР‚вЂќ Р С—Р ВµРЎР‚Р ВµР С”Р В»РЎР‹РЎвЂЎР С‘РЎвЂљРЎРЉ РЎвЂћР С•Р С”РЎС“РЎРѓ, Р СњР вЂў РЎРѓР Р…Р С‘Р СР В°РЎвЂљРЎРЉ Р Р†РЎвЂ№Р Т‘Р ВµР В»Р ВµР Р…Р С‘Р Вµ
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
                          title="Р РЋР Р…РЎРЏРЎвЂљРЎРЉ Р Р†РЎвЂ№Р В±Р С•РЎР‚"
                        >РІСљвЂў</button>
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
                        <button className="chip-action-btn edit-btn" onClick={e => { e.stopPropagation(); openEditChipModal('model', chip); }}>РІСљРЏРїС‘РЏ</button>
                        <button className="chip-action-btn delete-btn" onClick={e => { e.stopPropagation(); removeCustomChip('model', chip.id); }}>РІСљвЂў</button>
                      </div>
                    </div>
                  );
                })}
                {/* Add custom variant button */}
                {!customModelPrompt && !selectedSavedModelId && (
                  <div className="preset-card add-custom-card" onClick={() => { setCustomChipModalSection('model'); setNewChipText(''); }}>
                    <span className="emoji">РІС›вЂў</span><span className="label">Р РЋР Р†Р С•Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ</span>
                  </div>
                )}
              </div>
              <DetailPanel modelDetails={modelDetails} setModelDetails={setModelDetails} visible={showDetails && !customModelPrompt && !selectedSavedModelId} gender={gender} extraPrompt={extraModelPrompt} setExtraPrompt={setExtraModelPrompt} title={getActiveModelLabel()} onClose={() => setShowDetails(false)} />
              {(customModelChips.some(c => /РЎвЂљР В°РЎвЂљРЎС“|tattoo/i.test(c.prompt)) || /РЎвЂљР В°РЎвЂљРЎС“|tattoo/i.test(customModelPrompt)) && (
                <div className="tattoo-warning">РІС™В РїС‘РЏ Р СћР В°РЎвЂљРЎС“Р С‘РЎР‚Р С•Р Р†Р С”Р В° Р С•РЎвЂљР В»Р С‘РЎвЂЎР Р…Р С• Р С—Р С•Р В»РЎС“РЎвЂЎР С‘РЎвЂљРЎРѓРЎРЏ Р Р…Р В° Р С•Р Т‘Р С‘Р Р…Р С•РЎвЂЎР Р…Р С•Р С РЎвЂћР С•РЎвЂљР С•, Р Р…Р С• Р Р† РЎРѓР ВµРЎР‚Р С‘Р С‘ (РЎвЂћР С•РЎвЂљР С•РЎРѓР ВµРЎРѓРЎРѓР С‘РЎРЏ) Р СР С•Р В¶Р ВµРЎвЂљ Р С‘РЎРѓР С”Р В°Р В¶Р В°РЎвЂљРЎРЉРЎРѓРЎРЏ. Р вЂќР В»РЎРЏ РЎРѓРЎвЂљР В°Р В±Р С‘Р В»РЎРЉР Р…Р С•Р в„– Р СР С•Р Т‘Р ВµР В»Р С‘ РЎРѓРЎвЂљР В°РЎР‚Р В°Р в„–РЎвЂљР ВµРЎРѓРЎРЉ Р Р…Р Вµ Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљРЎРЉ РЎвЂљР В°РЎвЂљРЎС“.</div>
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
                        <button className="zoom-btn" onClick={e => { e.stopPropagation(); setLightboxSrc(m.imageBase64?.[0] || m.fullbodyBase64 || m.fullbodyUrl || m.imageUrls?.[0] || ''); }}>СЂСџвЂќРЊ</button>
                        <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteModel(m.id); }}>РІСљвЂў</button>
                      </div>
                    ))}
                  </div>
                  {selectedSavedModelId && <div className="selected-model-indicator">РІВ­С’ Р вЂ™Р В°РЎв‚¬Р В° Р СР С•Р Т‘Р ВµР В»РЎРЉ Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р…Р В°</div>}
                  {selectedSavedModelId && (
                    <div className="modifier-block">
                      <button className="modifier-toggle" onClick={() => { setShowModelModifier(!showModelModifier); setModelPreviewSrc(null); }}>
                        {showModelModifier ? 'РІСљвЂ“ Р РЋР С”РЎР‚РЎвЂ№РЎвЂљРЎРЉ' : 'РІСљРЏРїС‘РЏ Р ВР В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ'}
                      </button>
                      {showModelModifier && (
                        <div className="modifier-content">
                          <textarea className="modifier-input" rows={2} placeholder="Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: Р Т‘Р С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ РЎвЂљР В°РЎвЂљРЎС“Р С‘РЎР‚Р С•Р Р†Р С”РЎС“ Р Р…Р В° Р В»Р ВµР Р†РЎС“РЎР‹ РЎР‚РЎС“Р С”РЎС“, РЎРѓР Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ Р Р†Р С•Р В»Р С•РЎРѓРЎвЂ№ РЎР‚РЎвЂ№Р В¶Р С‘Р СР С‘, РЎР‚Р С•РЎРѓРЎвЂљ Р Р†РЎвЂ№РЎв‚¬Р Вµ"
                            value={modelModifier} onChange={e => setModelModifier(e.target.value)} />
                          {/* Tattoo warning (text input) */}
                          {/РЎвЂљР В°РЎвЂљРЎС“/i.test(modelModifier) && (
                            <div className="tattoo-warning">РІС™В РїС‘РЏ Р СћР В°РЎвЂљРЎС“Р С‘РЎР‚Р С•Р Р†Р С”Р В° Р С•РЎвЂљР В»Р С‘РЎвЂЎР Р…Р С• Р С—Р С•Р В»РЎС“РЎвЂЎР С‘РЎвЂљРЎРѓРЎРЏ Р Р…Р В° Р С•Р Т‘Р С‘Р Р…Р С•РЎвЂЎР Р…Р С•Р С РЎвЂћР С•РЎвЂљР С•, Р Р…Р С• Р Р† РЎРѓР ВµРЎР‚Р С‘Р С‘ (РЎвЂћР С•РЎвЂљР С•РЎРѓР ВµРЎРѓРЎРѓР С‘РЎРЏ) Р СР С•Р В¶Р ВµРЎвЂљ Р С‘РЎРѓР С”Р В°Р В¶Р В°РЎвЂљРЎРЉРЎРѓРЎРЏ. Р вЂќР В»РЎРЏ РЎРѓРЎвЂљР В°Р В±Р С‘Р В»РЎРЉР Р…Р С•Р в„– Р СР С•Р Т‘Р ВµР В»Р С‘ РЎРѓРЎвЂљР В°РЎР‚Р В°Р в„–РЎвЂљР ВµРЎРѓРЎРЉ Р Р…Р Вµ Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљРЎРЉ РЎвЂљР В°РЎвЂљРЎС“.</div>
                          )}
                          <button className="modifier-save-btn" onClick={handlePreviewModel} disabled={!modelModifier.trim() || isPreviewingModel}>
                            {isPreviewingModel ? 'РІРЏС– Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµР С Р С—РЎР‚Р ВµР Р†РЎРЉРЎР‹...' : 'СЂСџвЂРѓРїС‘РЏ Р СџРЎР‚Р ВµР Т‘Р С—РЎР‚Р С•РЎРѓР СР С•РЎвЂљРЎР‚'}
                          </button>
                          {modelPreviewSrc && (
                            <div className="model-preview-block">
                              <img src={modelPreviewSrc} alt="Р СџРЎР‚Р ВµР Р†РЎРЉРЎР‹ Р СР С•Р Т‘Р ВµР В»Р С‘" className="model-preview-img" onClick={() => setLightboxSrc(modelPreviewSrc)} />
                              <input className="custom-variant-input" type="text" placeholder="Р СњР В°Р В·Р С•Р Р†Р С‘РЎвЂљР Вµ Р Р…Р С•Р Р†РЎС“РЎР‹ Р СР С•Р Т‘Р ВµР В»РЎРЉ" value={modelPreviewName} onChange={e => setModelPreviewName(e.target.value)} />
                              <button className="modifier-save-btn" onClick={saveModelAsNew} disabled={!modelPreviewName.trim() || isSaving}>
                                {isSaving ? 'РІРЏС– Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С...' : 'СЂСџвЂ™С• Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ Р С”Р В°Р С” Р Р…Р С•Р Р†РЎС“РЎР‹ Р СР С•Р Т‘Р ВµР В»РЎРЉ'}
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
                <span className="plus-icon" style={{color:'#a855f7'}}>СЂСџВ§вЂ</span>
                <span style={{color:'#a855f7'}}>Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С—Р ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В¶Р В°</span>
              </div>
              <div className="add-location-card" style={{marginTop: 8}} onClick={() => setShowLoraModal(true)}>
                <span className="plus-icon">+</span>
                <span>Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ РЎРѓР Р†Р С•РЎР‹ Р СР С•Р Т‘Р ВµР В»РЎРЉ</span>
              </div>
            </>
          )}
        </motion.div>
      ))}

      {/* 3. Р СџР С›Р вЂ”Р С’ Р ВР вЂєР В Р С™Р С›Р СљР СџР С›Р вЂ”Р ВР В¦Р ВР Р‡ */}
      {appMode !== 'quick' && (appMode === 'product' ? (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.45,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">СЂСџвЂњС’</span> Р С™Р С•Р СР С—Р С•Р В·Р С‘РЎвЂ Р С‘РЎРЏ Р С”Р В°Р Т‘РЎР‚Р В°</div>
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
            <input className="custom-variant-input" type="text" placeholder="Р ВР В»Р С‘ Р С•Р С—Р С‘РЎв‚¬Р С‘РЎвЂљР Вµ РЎРѓР Р†Р С•РЎР‹ Р С”Р С•Р СР С—Р С•Р В·Р С‘РЎвЂ Р С‘РЎР‹: Р’В«Р СћР С•Р Р†Р В°РЎР‚ Р В»Р ВµР В¶Р С‘РЎвЂљ Р Р…Р В° Р В·Р ВµРЎР‚Р С”Р В°Р В»РЎРЉР Р…Р С•Р в„– Р С—Р С•Р Р†Р ВµРЎР‚РЎвЂ¦Р Р…Р С•РЎРѓРЎвЂљР С‘ Р С—Р С•Р Т‘ РЎС“Р С–Р В»Р С•Р СР’В»"
              value={customPoseText} onChange={e => setCustomPoseText(e.target.value)} />
          </div>
        </motion.div>
      ) : (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.45,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">СЂСџВ§РЊ</span> Р СџР С•Р В·Р В° Р СР С•Р Т‘Р ВµР В»Р С‘</div>
          {/* Multi-select info */}
          {!customPoseText && (selectedPoses.length + customPoseChips.length) > 1 && (
            <div className="multi-select-info">
              <span className="info-icon">РІвЂћв„–РїС‘РЏ</span>
              Р вЂ™РЎвЂ№Р В±РЎР‚Р В°Р Р…Р С• {selectedPoses.length + customPoseChips.length} Р С—Р С•Р В· РІР‚вЂќ Р С”Р В°Р В¶Р Т‘Р В°РЎРЏ Р С—Р С•Р В·Р В° = Р С•РЎвЂљР Т‘Р ВµР В»РЎРЉР Р…Р В°РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ. Р ВРЎвЂљР С•Р С–Р С•: Р“вЂ”{selectedPoses.length + customPoseChips.length} Р С” Р С”Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†РЎС“ Р С”Р В°Р Т‘РЎР‚Р С•Р Р†.
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
            {/* Р ВР СР С—РЎР‚Р С•Р Р†Р С‘Р В·Р В°РЎвЂ Р С‘РЎРЏ РІР‚вЂќ always visible */}
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
                  <button className="chip-action-btn edit-btn" onClick={e => { e.stopPropagation(); openEditChipModal('pose', chip); }}>РІСљРЏРїС‘РЏ</button>
                  <button className="chip-action-btn delete-btn" onClick={e => { e.stopPropagation(); removeCustomChip('pose', chip.id); }}>РІСљвЂў</button>
                </div>
              </div>
            ))}
            {/* Add custom variant */}
            {!customPoseText && (
              <div className="preset-card add-custom-card" onClick={() => { setCustomChipModalSection('pose'); setNewChipText(''); }}>
                <span className="emoji">РІС›вЂў</span><span className="label">Р РЋР Р†Р С•Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ</span>
              </div>
            )}
          </div>
        </motion.div>
      ))}

      {/* 4. Р В Р С’Р С™Р Р€Р В Р РЋ Р С™Р С’Р СљР вЂўР В Р В« (Р СћР С•Р В»РЎРЉР С”Р С• Р Р† РЎР‚Р ВµР В¶Р С‘Р СР Вµ Р С•Р Т‘Р ВµР В¶Р Т‘РЎвЂ№) */}
      {appMode === 'fashion' && (
        <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.6,duration:0.5,ease:[0.16,1,0.3,1]}}>
          <div className="section-title"><span className="icon">СЂСџвЂњВ·</span> Р В Р В°Р С”РЎС“РЎР‚РЎРѓ Р С”Р В°Р СР ВµРЎР‚РЎвЂ№</div>
          {selectedCameras.length > 1 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
              РІСљвЂ¦ {selectedCameras.length} РЎР‚Р В°Р С”РЎС“РЎР‚РЎРѓР В° Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р…Р С•
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

      {/* 5. Р В¤Р С›Р Сњ / Р вЂєР С›Р С™Р С’Р В¦Р ВР Р‡ */}
      {appMode !== 'quick' && <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.75,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title"><span className="icon">СЂСџР‹РЃ</span> {appMode === 'product' ? 'Р РЋРЎвЂ Р ВµР Р…Р В° / Р С›Р С”РЎР‚РЎС“Р В¶Р ВµР Р…Р С‘Р Вµ' : 'Р В¤Р С•Р Р… / Р вЂєР С•Р С”Р В°РЎвЂ Р С‘РЎРЏ'}</div>
        <div className="tabs-row">
          <button className={`tab-btn ${bgTab==='presets'?'active':''}`} onClick={()=>{setBgTab('presets');setSelectedLocId(null);}}>СЂСџР‹РЃ Р СџРЎР‚Р ВµРЎРѓР ВµРЎвЂљРЎвЂ№</button>
          <button className={`tab-btn ${bgTab==='my_locations'?'active':''}`} onClick={()=>setBgTab('my_locations')}>СЂСџвЂњРЊ Р СљР С•Р С‘ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘{myLocations.length>0?` (${myLocations.length})`:''}</button>
        </div>
        {bgTab === 'presets' ? (
          <>
            {appMode === 'product' ? (
              <>
                {!customProductBg && !selectedLocId && selectedProductBgs.length > 1 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
                    РІСљвЂ¦ {selectedProductBgs.length} РЎРѓРЎвЂ Р ВµР Р…РЎвЂ№ Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р…Р С• РІР‚вЂќ РЎРѓР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµРЎвЂљРЎРѓРЎРЏ {selectedProductBgs.length * selectedProductCompositions.length} {selectedProductBgs.length * selectedProductCompositions.length === 1 ? 'Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ' : 'Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР В°'}
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
                  <input className="custom-variant-input" placeholder="Р вЂєР С•Р С”Р В°РЎвЂ Р С‘РЎРЏ РЎРѓ Р Р…РЎС“Р В»РЎРЏ: Р’В«Р Т‘Р ВµРЎР‚Р ВµР Р†РЎРЏР Р…Р Р…РЎвЂ№Р в„– РЎРѓРЎвЂљР С•Р В» Р Р† РЎРѓР С”Р В°Р Р…Р Т‘Р С‘Р Р…Р В°Р Р†РЎРѓР С”Р С•Р С РЎРѓРЎвЂљР С‘Р В»Р Вµ, Р Р…Р В° РЎвЂћР С•Р Р…Р Вµ РЎР‚Р В°Р В·Р СРЎвЂ№РЎвЂљР С•Р Вµ Р С•Р С”Р Р…Р С•Р’В»"
                    value={customProductBg} onChange={e => { setCustomProductBg(e.target.value); setSelectedLocId(null); }} />
                </div>
                <div className="section-subtitle-small" style={{marginTop: 18, marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <span>РІСљРЃ</span> Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ РЎРѓР С—Р ВµРЎвЂ РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљ
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
                      placeholder="Р С›Р С—Р С‘РЎв‚¬Р С‘РЎвЂљР Вµ Р Р†Р В°РЎв‚¬ РЎРѓР С—Р ВµРЎвЂ РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљ: Р’В«Р Р†Р В·РЎР‚РЎвЂ№Р Р† Р С”Р С•Р Р…РЎвЂћР ВµРЎвЂљРЎвЂљР С‘, РЎРѓР Р…Р ВµР В¶Р С‘Р Р…Р С”Р С‘, Р Т‘РЎвЂ№Р СР’В»"
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
                    <span className="info-icon">РІвЂћв„–РїС‘РЏ</span>
                    Р вЂ™РЎвЂ№Р В±РЎР‚Р В°Р Р…Р С• {selectedBgs.length + customBgChips.length} РЎвЂћР С•Р Р…Р С•Р Р† РІР‚вЂќ Р С”Р В°Р В¶Р Т‘РЎвЂ№Р в„– РЎвЂћР С•Р Р… = Р С•РЎвЂљР Т‘Р ВµР В»РЎРЉР Р…Р В°РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ. Р ВРЎвЂљР С•Р С–Р С•: Р“вЂ”{selectedBgs.length + customBgChips.length} Р С” Р С”Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†РЎС“ Р С”Р В°Р Т‘РЎР‚Р С•Р Р†.
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
                        <button className="chip-action-btn edit-btn" onClick={e => { e.stopPropagation(); openEditChipModal('bg', chip); }}>РІСљРЏРїС‘РЏ</button>
                        <button className="chip-action-btn delete-btn" onClick={e => { e.stopPropagation(); removeCustomChip('bg', chip.id); }}>РІСљвЂў</button>
                      </div>
                    </div>
                  ))}
                  {/* Add custom variant */}
                  {!customBgText && !selectedLocId && (
                    <div className="preset-card add-custom-card" onClick={() => { setCustomChipModalSection('bg'); setNewChipText(''); }}>
                      <span className="emoji">РІС›вЂў</span><span className="label">Р РЋР Р†Р С•Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ</span>
                    </div>
                  )}
                </div>
                <div className="modifier-block" style={{marginTop:10}}>
                  <textarea className="modifier-input" rows={1} placeholder="Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р С” Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘: Р’В«Р В·Р В°Р С”Р В°РЎвЂљ, Р СР С•Р С”РЎР‚РЎвЂ№Р в„– Р В°РЎРѓРЎвЂћР В°Р В»РЎРЉРЎвЂљ, Р Р…Р ВµР С•Р Р…Р С•Р Р†РЎвЂ№Р Вµ Р С•Р С–Р Р…Р С‘Р’В»"
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
                        <span style={{fontSize:'20px'}}>РІС™В РїС‘РЏ</span>
                        <label
                          style={{marginTop:'2px', padding:'3px 8px', fontSize:'10px', background:'rgba(255,160,0,0.2)', border:'1px solid rgba(255,160,0,0.5)', borderRadius:'4px', color:'#ffb300', cursor:'pointer', display:'inline-block'}}
                          onClick={e => e.stopPropagation()}
                        >
                          Загрузить фото
                          <input type="file" accept="image/*" multiple style={{display:'none'}}
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              if (!files.length) return;
                              const b64 = await Promise.all(files.slice(0, 5).map(f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(f); })));
                              const valid = b64.filter(Boolean);
                              if (!valid.length) return;
                              await patchLocation(user.uid, loc.id, { imageBase64: valid });
                              setMyLocations(prev => prev.map(l => l.id === loc.id ? { ...l, imageBase64: valid } : l));
                              setLocBase64Cache(prev => ({ ...prev, [loc.id]: valid }));
                            }}
                          />
                        </label>
                      </div>
                    )}
                    <div className="loc-name">{loc.title || loc.name || 'Р вЂР ВµР В· Р Р…Р В°Р В·Р Р†Р В°Р Р…Р С‘РЎРЏ'}</div>
                    <button className="delete-btn" onClick={e => { e.stopPropagation(); deleteLoc(loc.id); }}>РІСљвЂў</button>
                  </div>
                );
              })}
              <div className="add-location-card" onClick={() => setShowLocModal(true)}>
                <span className="plus-icon">+</span><span>Р С›РЎвЂ Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹</span>
              </div>
            </div>
            {/* Р С™Р Р…Р С•Р С—Р С”Р В° Р Р†Р С•РЎРѓРЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р В»Р ВµР Р…Р С‘РЎРЏ РЎС“Р Т‘Р В°Р В»РЎвЂР Р…Р Р…РЎвЂ№РЎвЂ¦ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р в„– Р С‘Р В· Storage */}
            <div style={{marginTop: '8px', textAlign: 'center'}}>
              <button
                style={{background: 'none', border: 'none', color: 'rgba(255,180,0,0.6)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', padding: '4px'}}
                onClick={async () => {
                  try {
                    const idToken = await user.getIdToken();
                    const locName = prompt('Р СњР В°Р В·Р Р†Р В°Р Р…Р С‘Р Вµ Р Т‘Р В»РЎРЏ Р Р†Р С•РЎРѓРЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р В»Р ВµР Р…Р Р…Р С•Р в„– Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘:', 'Р ТђР В°РЎвЂљР В° Р С”РЎРѓР С•Р Р…Р В°') || 'Р вЂ™Р С•РЎРѓРЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р В»Р ВµР Р…Р Р…Р В°РЎРЏ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎРЏ';
                    const resp = await fetch('/api/admin/recover-locations', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                      body: JSON.stringify({ title: locName }),
                    });
                    const data = await resp.json();
                    if (data.ok) {
                      alert(`РІСљвЂ¦ Р вЂ™Р С•РЎРѓРЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р В»Р ВµР Р…Р С• ${data.count} РЎвЂћР С•РЎвЂљР С•! Р СџР ВµРЎР‚Р ВµР В·Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С...`);
                      const locs = await getLocations(user.uid);
                      setMyLocations(locs || []);
                      const cache = {};
                      (locs || []).forEach(l => { if (l.imageBase64?.length) cache[l.id] = l.imageBase64; });
                      setLocBase64Cache(prev => ({ ...prev, ...cache }));
                    } else {
                      alert(`РІС™В РїС‘РЏ Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р Р†Р С•РЎРѓРЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р С‘РЎвЂљРЎРЉ: ${data.error}\n\nР СџР С•Р Т‘РЎРѓР С”Р В°Р В·Р С”Р В°: ${data.hint || 'Р В¤Р В°Р в„–Р В»РЎвЂ№ Р СР С•Р С–РЎС“РЎвЂљ Р В±РЎвЂ№РЎвЂљРЎРЉ РЎС“Р Т‘Р В°Р В»Р ВµР Р…РЎвЂ№ Р С‘Р В· Storage. Р СџРЎР‚Р С‘Р Т‘РЎвЂРЎвЂљРЎРѓРЎРЏ Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљРЎРЉ Р В·Р В°Р Р…Р С•Р Р†Р С•.'}`);
                    }
                  } catch (e) {
                    alert('Р С›РЎв‚¬Р С‘Р В±Р С”Р В°: ' + e.message);
                  }
                }}
              >СЂСџвЂќвЂћ Р вЂ™Р С•РЎРѓРЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р С‘РЎвЂљРЎРЉ РЎС“Р Т‘Р В°Р В»РЎвЂР Р…Р Р…РЎвЂ№Р Вµ Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘ Р С‘Р В· Storage</button>
            </div>
            {selectedLocId && (
              <div className="modifier-block">
                <button className="modifier-toggle" onClick={() => setShowLocModifier(!showLocModifier)}>
                  {showLocModifier ? 'РІСљвЂ“ Р РЋР С”РЎР‚РЎвЂ№РЎвЂљРЎРЉ' : 'РІСљРЏРїС‘РЏ Р ВР В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹'}
                </button>
                {showLocModifier && (
                  <div className="modifier-content">
                    <textarea className="modifier-input" rows={2} placeholder="Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: Р Т‘Р С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р В·Р В°Р С”Р В°РЎвЂљ, РЎРѓР Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ РЎРѓРЎвЂљР ВµР Р…РЎвЂ№ Р С”Р С‘РЎР‚Р С—Р С‘РЎвЂЎР Р…РЎвЂ№Р СР С‘, Р Р…Р ВµР С•Р Р…Р С•Р Р†Р В°РЎРЏ Р Р†РЎвЂ№Р Р†Р ВµРЎРѓР С”Р В°"
                      value={locModifier} onChange={e => setLocModifier(e.target.value)} />
                    <button className="modifier-save-btn" onClick={saveLocMod} disabled={!locModifier.trim()}>СЂСџвЂ™С• Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ Р Р† Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹</button>
                  </div>
                )}
              </div>
            )}
            {appMode === 'product' && (
              <>
                <div className="section-subtitle-small" style={{marginTop: 18, marginBottom: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px'}}>
                  <span>РІСљРЃ</span> Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ РЎРѓР С—Р ВµРЎвЂ РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљ
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
                      placeholder="Р С›Р С—Р С‘РЎв‚¬Р С‘РЎвЂљР Вµ Р Р†Р В°РЎв‚¬ РЎРѓР С—Р ВµРЎвЂ РЎРЊРЎвЂћРЎвЂћР ВµР С”РЎвЂљ: Р’В«Р Р†Р В·РЎР‚РЎвЂ№Р Р† Р С”Р С•Р Р…РЎвЂћР ВµРЎвЂљРЎвЂљР С‘, РЎРѓР Р…Р ВµР В¶Р С‘Р Р…Р С”Р С‘, Р Т‘РЎвЂ№Р СР’В»"
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

      {/* 6. Р В¤Р С›Р В Р СљР С’Р Сћ */}
      {appMode !== 'quick' && <motion.div className="section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:0.9,duration:0.5,ease:[0.16,1,0.3,1]}}>
        <div className="section-title"><span className="icon">СЂСџвЂњС’</span> Р В¤Р С•РЎР‚Р СР В°РЎвЂљ Р С‘Р В·Р С•Р В±РЎР‚Р В°Р В¶Р ВµР Р…Р С‘РЎРЏ</div>
        {selectedRatios.length > 1 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--gold)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
            РІСљвЂ¦ {selectedRatios.length} РЎвЂћР С•РЎР‚Р СР В°РЎвЂљР В° Р Р†РЎвЂ№Р В±РЎР‚Р В°Р Р…Р С• РІР‚вЂќ Р В±РЎС“Р Т‘Р ВµРЎвЂљ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С• Р Р…Р ВµРЎРѓР С”Р С•Р В»РЎРЉР С”Р С• Р С”Р С•Р С—Р С‘Р в„– Р Т‘Р В»РЎРЏ Р С”Р В°Р В¶Р Т‘Р С•Р С–Р С• РЎвЂћР С•РЎР‚Р СР В°РЎвЂљР В°
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

      {/* 7. Р вЂњР вЂўР СњР вЂўР В Р С’Р В¦Р ВР Р‡ */}
      {appMode !== 'quick' && <motion.div className="generate-section" initial={{opacity:0,y:30,scale:0.98}} animate={{opacity:1,y:0,scale:1}} transition={{delay:1.05,duration:0.5,ease:[0.16,1,0.3,1]}}>
        {/* Beauty toggle РІР‚вЂќ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р С”Р С•Р С–Р Т‘Р В° Р ВµРЎРѓРЎвЂљРЎРЉ Р В¶Р С‘Р Р†Р В°РЎРЏ Р СР С•Р Т‘Р ВµР В»РЎРЉ-РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С” */}
        {(appMode === 'fashion' || (appMode === 'product' && productWithModel)) && (
          <div className="beauty-toggle">
            <label className={`beauty-switch ${isBeautyMode ? 'active' : ''}`}>
              <input type="checkbox" checked={isBeautyMode} onChange={e => setIsBeautyMode(e.target.checked)} />
              <span className="beauty-label">{isBeautyMode ? 'РІСљРЃ Beauty-РЎР‚Р ВµРЎвЂљРЎС“РЎв‚¬РЎРЉ' : 'СЂСџвЂњВ· Р В Р ВµР В°Р В»Р С‘Р В·Р С'}</span>
            </label>
            <span className="beauty-hint">
              {isBeautyMode
                ? 'Р вЂ™РЎвЂ№Р В±РЎР‚Р В°Р Р… Р В¶РЎС“РЎР‚Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р С–Р В»РЎРЏР Р…Р ВµРЎвЂ  Р’В«Р ВР Т‘Р ВµР В°Р В»РЎРЉР Р…Р В°РЎРЏ Р С”Р С•Р В¶Р В°Р’В». Р СњР В°Р В¶Р СР С‘РЎвЂљР Вµ, РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р Р†Р ВµРЎР‚Р Р…РЎС“РЎвЂљРЎРЉ РЎР‚Р ВµР В°Р В»Р С‘Р В·Р С'
                : 'Р вЂ™РЎвЂ№Р В±РЎР‚Р В°Р Р… РЎР‚Р ВµР В°Р В»Р С‘Р В·Р С: Р Р…Р В°РЎвЂљРЎС“РЎР‚Р В°Р В»РЎРЉР Р…Р В°РЎРЏ Р С”Р С•Р В¶Р В° РЎРѓ РЎвЂљР ВµР С”РЎРѓРЎвЂљРЎС“РЎР‚Р С•Р в„–. Р СњР В°Р В¶Р СР С‘РЎвЂљР Вµ, РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р Р†Р С”Р В»РЎР‹РЎвЂЎР С‘РЎвЂљРЎРЉ Р В¶РЎС“РЎР‚Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р С–Р В»РЎРЏР Р…Р ВµРЎвЂ  Р’В«Р ВР Т‘Р ВµР В°Р В»РЎРЉР Р…Р В°РЎРЏ Р С”Р С•Р В¶Р В°Р’В»'}
            </span>
          </div>
        )}

        {/* Р РЋР ВµР В»Р ВµР С”РЎвЂљР С•РЎР‚ Р С”Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р В° Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р† */}
        {(() => {
          return (
            <div className="variant-count-section">
              <div className="variant-count-title">СЂСџР‹Р‡ Р С™Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С• Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р† Р Р…Р В° Р С•Р Т‘Р Р…РЎС“ Р С”Р С•Р СР В±Р С‘Р Р…Р В°РЎвЂ Р С‘РЎР‹</div>
              {totalShots > variantCount && (
                <div style={{fontSize:'0.75rem',color:'var(--gold)',textAlign:'center',marginBottom:8,opacity:0.8}}>
                  Р С™Р С•Р СР В±Р С‘Р Р…Р В°РЎвЂ Р С‘Р в„– Р С—Р В°РЎР‚Р В°Р СР ВµРЎвЂљРЎР‚Р С•Р Р† Р“вЂ” {variantCount} Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ{variantCount === 1 ? '' : (variantCount < 5 ? 'Р В°' : 'Р С•Р Р†')} = <strong>{totalShots} Р С”Р В°Р Т‘РЎР‚{totalShots === 1 ? '' : (totalShots < 5 ? 'Р В°' : 'Р С•Р Р†')}</strong>
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
                      <span className="variant-count-label">{n === 1 ? 'Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ' : (n < 5 ? 'Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР В°' : 'Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р†')}</span>
                      <span className="variant-count-credits">{total} {total === 1 ? 'Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљ' : (total < 5 ? 'Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР В°' : 'Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљР С•Р Р†')}</span>
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
                ? 'РІВРѓРїС‘РЏ Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р Р† Р С•Р В±Р В»Р В°Р С”Р С•...' 
                : `РІСљРЃ Р РЋР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ ${totalShots > 1 ? totalShots + ' Р С”Р В°Р Т‘РЎР‚' + (totalShots < 5 ? 'Р В°' : 'Р С•Р Р†') : 'РЎРѓРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…РЎвЂ№Р в„– Р С”Р В°Р Т‘РЎР‚'}`}
            </button>
            <button
              className="auto-catalog-mini-btn"
              onClick={handleAutoCatalog}
              disabled={!garmentUrls.length||isProcessing||isUploading}
              title="Р С›РЎвЂљР С—РЎР‚Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р Р† Auto-Catalog (Batch)"
            >СЂСџРЏВ­</button>
          </div>
          {totalShots > 20 && (
            <div style={{color:'var(--gold)',fontSize:'0.75rem',textAlign:'center',fontWeight:500}}>
              РІС™В РїС‘РЏ Р вЂ™РЎвЂ№Р В±РЎР‚Р В°Р Р…Р С• {totalShots} Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘Р в„–. Р вЂєР С‘Р СР С‘РЎвЂљ РІР‚вЂќ 20 Р В·Р В° Р С•Р Т‘Р С‘Р Р… РЎР‚Р В°Р В·. Р СџР С•Р В¶Р В°Р В»РЎС“Р в„–РЎРѓРЎвЂљР В°, РЎРѓР Р…Р С‘Р СР С‘РЎвЂљР Вµ Р Р†РЎвЂ№Р Т‘Р ВµР В»Р ВµР Р…Р С‘Р Вµ РЎРѓ Р Р…Р ВµР С”Р С•РЎвЂљР С•РЎР‚РЎвЂ№РЎвЂ¦ Р С—Р В°РЎР‚Р В°Р СР ВµРЎвЂљРЎР‚Р С•Р Р†.
            </div>
          )}
        </div>

        <div className="status-bar">{statusText && <p className={`status-text ${statusType}`}>{statusText}</p>}</div>
      </motion.div>}

      {/* РІвЂўС’РІвЂўС’РІвЂўС’ STATUS BAR for quick mode РІвЂўС’РІвЂўС’РІвЂўС’ */}
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
              РІСљвЂў Р С›РЎвЂљР СР ВµР Р…Р С‘РЎвЂљРЎРЉ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎР‹
            </button>
          )}
        </div>
      )}

      {/* 8Р В°. QUICK MODE RESULT РІР‚вЂќ Photo or Card */}
      {generatedImage && appMode === 'quick' && !quickCardImage && (
        <motion.div className="section result-section quick-hero-result" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{duration:0.5}}>
          <h3>{quickMode === 'ugc' ? 'СЂСџвЂњВ± Р В¤Р С•РЎвЂљР С• Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»РЎРЏ' : 'СЂСџвЂњС‘ Р вЂ™Р В°РЎв‚¬Р Вµ РЎРѓРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…Р С•Р Вµ РЎвЂћР С•РЎвЂљР С•'}</h3>
          <div className="result-image-wrap" style={{position:'relative'}}>
            <img src={generatedImage} alt={quickMode === 'ugc' ? "Р В¤Р С•РЎвЂљР С• Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»РЎРЏ" : "Р РЋРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…Р С•Р Вµ РЎвЂћР С•РЎвЂљР С•"} onClick={() => setLightboxSrc(generatedImage)} style={{cursor:'pointer'}} />
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
            }}>РІВ¬вЂЎРїС‘РЏ Р РЋР С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С•</button>
          </div>
          {/* Nav between cached results */}
          {Object.keys(quickResults).length > 0 && (
            <div style={{display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap'}}>
              {quickResults.card && (
                <button onClick={() => { setQuickMode('card'); setQuickCardImage(quickResults.card.image); setGeneratedImage(quickResults.card.image); setCardEditHistory(quickResults.card.editHistory || []); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.08)', color: '#ffd700', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>СЂСџвЂњвЂ№ Р С™Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В°</button>
              )}
              {quickResults.ugc && quickMode !== 'ugc' && (
                <button onClick={() => { setQuickMode('ugc'); setQuickCardImage(null); setGeneratedImage(quickResults.ugc.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>СЂСџвЂњВ± UGC</button>
              )}
              {quickResults.photo && quickMode !== 'photo' && (
                <button onClick={() => { setQuickMode('photo'); setQuickCardImage(null); setGeneratedImage(quickResults.photo.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>СЂСџвЂњС‘ Р РЋРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…Р С•Р Вµ</button>
              )}
              {quickResults.model && quickMode !== 'model' && (
                <button onClick={() => { setQuickMode('model'); setQuickCardImage(quickResults.model.image); setGeneratedImage(quickResults.model.image); setCardEditHistory(quickResults.model.editHistory || []); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: '#d8b4fe', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>СЂСџвЂВ¤ Р РЋ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹</button>
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
          }}>{quickResults.card && quickMode !== 'card' ? 'РІвЂ С’ Р СњР В°Р В·Р В°Р Т‘ Р С” Р С•Р В±Р В»Р С•Р В¶Р С”Р Вµ' : 'РІвЂ С’ Р СњР С•Р Р†Р В°РЎРЏ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ'}</button>
        </motion.div>
      )}

      {/* 8Р В°-2. QUICK MODE CARD RESULT РІР‚вЂќ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° + РЎвЂљР ВµР С”РЎРѓРЎвЂљР С•Р Р†Р С•Р Вµ РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ */}
      {quickCardImage && appMode === 'quick' && (
        <motion.div className="section result-section" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{duration:0.5}} style={{maxWidth: 900, margin: '0 auto', padding: '10px 20px'}}>
                    {/* Nav between cached results */}
          {Object.keys(quickResults).filter(k => k !== quickMode && quickResults[k]).length > 0 && (
            <div style={{display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16, flexWrap: 'wrap'}}>
              {quickResults.ugc && quickMode !== 'ugc' && (
                <button onClick={() => { setQuickMode('ugc'); setQuickCardImage(null); setGeneratedImage(quickResults.ugc.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>СЂСџвЂњВ± UGC</button>
              )}
              {quickResults.photo && quickMode !== 'photo' && (
                <button onClick={() => { setQuickMode('photo'); setQuickCardImage(null); setGeneratedImage(quickResults.photo.image); setCardEditHistory([]); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>СЂСџвЂњС‘ Р РЋРЎвЂљРЎС“Р Т‘Р С‘Р в„–Р Р…Р С•Р Вµ</button>
              )}
              {quickResults.model && quickMode !== 'model' && (
                <button onClick={() => { setQuickMode('model'); setQuickCardImage(quickResults.model.image); setGeneratedImage(quickResults.model.image); setCardEditHistory(quickResults.model.editHistory || []); }}
                  style={{padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: '#d8b4fe', fontSize: 12, fontWeight: 600, cursor: 'pointer'}}>СЂСџвЂВ¤ Р РЋ Р СР С•Р Т‘Р ВµР В»РЎРЉРЎР‹</button>
              )}
            </div>
          )}

          <div style={{textAlign: 'center', marginBottom: 30}}>
            <h3 style={{fontSize: 28, margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 1}}>СЂСџвЂќТђ Р С›Р В±Р В»Р С•Р В¶Р С”Р В° Р С–Р С•РЎвЂљР С•Р Р†Р В°!</h3>
            <p style={{color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 15}}>Р С™Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• РЎРѓР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р В°. Р В§РЎвЂљР С• Р Т‘Р ВµР В»Р В°Р ВµР С Р Т‘Р В°Р В»РЎРЉРЎв‚¬Р Вµ?</p>
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
                    РІСљРЏРїС‘РЏ Р СџРЎР‚Р С‘Р СР ВµР Р…РЎРЏР ВµР С Р С‘Р В·Р СР ВµР Р…Р ВµР Р…Р С‘РЎРЏ...
                  </div>
                  <div style={{color: 'rgba(255,255,255,0.5)', fontSize: 13}}>
                    Р ВР В Р С—Р ВµРЎР‚Р ВµРЎР‚Р С‘РЎРѓР С•Р Р†РЎвЂ№Р Р†Р В°Р ВµРЎвЂљ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ Р С—Р С• Р Р†Р В°РЎв‚¬Р ВµР СРЎС“ Р С•Р С—Р С‘РЎРѓР В°Р Р…Р С‘РЎР‹
                  </div>
                </div>
              ) : (
                <img src={quickCardImage} alt="Р С™Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° РЎвЂљР С•Р Р†Р В°РЎР‚Р В°" onClick={() => setLightboxSrc(quickCardImage)} style={{cursor:'pointer', width: '100%', height: '100%', objectFit: 'contain', display: 'block'}} />
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
                СЂСџвЂњТђ Р РЋР С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ HD
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
                СЂСџР„вЂћ Р СћР С•РЎвЂЎР ВµРЎвЂЎР Р…Р В°РЎРЏ Р С—РЎР‚Р В°Р Р†Р С”Р В° (1 Р С”РЎР‚.)
              </button>
            </div>
          </div>

          <div style={{display: 'flex', alignItems: 'center', margin: '0 0 30px 0'}}>
            <div style={{flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1))'}}></div>
            <div style={{padding: '0 20px', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2}}>Р СџРЎР‚Р С•Р С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”РЎС“ Р Т‘Р В»РЎРЏ Р СћР С›Р СџР В°</div>
            <div style={{flex: 1, height: 1, background: 'linear-gradient(-90deg, transparent, rgba(255,255,255,0.1))'}}></div>
          </div>

          {/* UPSELL DASHBOARD */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 40}}>
            
            {/* Widget 1: Funnel */}
            <div style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 28, marginBottom: 12}}>СЂСџвЂњС‘</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>Р РЋР С•Р В±РЎР‚Р В°РЎвЂљРЎРЉ Р С–Р В°Р В»Р ВµРЎР‚Р ВµРЎР‹ (4 РЎРѓР В»Р В°Р в„–Р Т‘Р В°)</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                Р ВР В Р Т‘Р С•РЎРѓРЎвЂљРЎР‚Р С•Р С‘РЎвЂљ Р Р†Р С•РЎР‚Р С•Р Р…Р С”РЎС“: Р С”РЎР‚РЎС“Р С—Р Р…РЎвЂ№Р в„– Р С—Р В»Р В°Р Р…, Р С–Р В°Р В±Р В°РЎР‚Р С‘РЎвЂљРЎвЂ№, Р С‘Р Р…РЎвЂљР ВµРЎР‚РЎРЉР ВµРЎР‚. 100% Р ВµР Т‘Р С‘Р Р…РЎвЂ№Р в„– РЎРѓРЎвЂљР С‘Р В»РЎРЉ.
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
                          alt={`Р РЋР В»Р В°Р в„–Р Т‘ ${idx+1}`} 
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
                          title="Р РЋР С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ"
                        >
                          СЂСџвЂњТђ
                        </button>
                        <span style={{position: 'relative', zIndex: 1, color: '#fff', fontSize: 9, fontWeight: 600, padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%'}}>
                          {idx === 0 ? 'Р С›Р В±Р В»Р С•Р В¶Р С”Р В°' : idx === 1 ? 'Р вЂќР ВµРЎвЂљР В°Р В»Р С‘' : idx === 2 ? 'Р В Р В°Р В·Р СР ВµРЎР‚РЎвЂ№' : 'Lifestyle'}
                        </span>
                        {isActive && (
                          <div style={{position: 'absolute', top: 4, left: 4, background: '#ffd700', color: '#000', fontSize: 7, fontWeight: 900, padding: '1px 3px', borderRadius: 3, textTransform: 'uppercase', zIndex: 10}}>Р С’Р С”РЎвЂљР С‘Р Р†Р ВµР Р…</div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  [
                    { title: 'Р С›Р В±Р В»Р С•Р В¶Р С”Р В°', src: '/examples/gallery/slide1_cover.png' },
                    { title: 'Р вЂќР ВµРЎвЂљР В°Р В»Р С‘', src: '/examples/gallery/slide2_detail.png' },
                    { title: 'Р В Р В°Р В·Р СР ВµРЎР‚РЎвЂ№', src: '/examples/gallery/slide3_size.png' },
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
                    СЂСџвЂРѓРїС‘РЏ Р СџРЎР‚Р С•РЎРѓР СР С•РЎвЂљРЎР‚
                  </button>
                  <button 
                    onClick={() => triggerConfirm('gallery', 5, handleGenerateGallery)}
                    style={{background: 'rgba(255,215,0,0.08)', color: '#ffd700', border: '1px solid rgba(255,215,0,0.3)', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.18)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,215,0,0.08)'}}
                    title="Р СџР ВµРЎР‚Р ВµРЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С–Р В°Р В»Р ВµРЎР‚Р ВµРЎР‹"
                  >
                    СЂСџвЂќвЂћ
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
                  {isGalleryGenerating ? 'РІРЏС– Р РЋР С•Р В·Р Т‘Р В°РЎвЂР С...' : <>Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р В·Р В° 5 Р С”РЎР‚. <span style={{textDecoration: 'line-through', opacity: 0.5, fontSize: 11, marginLeft: 6, fontWeight: 400}}>8 Р С”РЎР‚.</span></>}
                </button>
              )}
            </div>

            {/* Widget 3: A/B Test */}
            <div style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 28, marginBottom: 12}}>РІС™вЂ“РїС‘РЏ</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>Р СњР В°Р в„–РЎвЂљР С‘ Р В»РЎС“РЎвЂЎРЎв‚¬Р С‘Р в„– CTR (A/B Р СћР ВµРЎРѓРЎвЂљ)</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                Р СњР Вµ Р С–Р В°Р Т‘Р В°Р в„–РЎвЂљР Вµ. Р ВР В РЎРѓР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚РЎС“Р ВµРЎвЂљ 2 Р В°Р В»РЎРЉРЎвЂљР ВµРЎР‚Р Р…Р В°РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р Вµ Р С•Р В±Р В»Р С•Р В¶Р С”Р С‘ РЎРѓ Р Т‘РЎР‚РЎС“Р С–Р С‘Р СР С‘ РЎвЂ¦РЎС“Р С”Р В°Р СР С‘ Р С‘ Р С”Р С•Р СР С—Р С•Р В·Р С‘РЎвЂ Р С‘Р ВµР в„–.
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
                          alt={`Р вЂ™Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ ${idx === 0 ? 'A' : 'B'}`} 
                          style={{width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer'}} 
                          onClick={() => {
                            setQuickCardImage(img);
                            setGeneratedImage(img);
                            setQuickMode('card');
                            setQuickResults(prev => ({
                              ...prev, 
                              card: { image: img, editHistory: [{ image: img, editText: `Р вЂ™РЎвЂ№Р В±РЎР‚Р В°Р Р… Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ ${idx === 0 ? 'A' : 'B'}` }] }
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
                          title="Р РЋР С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ"
                        >
                          СЂСџвЂњТђ
                        </button>
                        {isActive && (
                          <div style={{position: 'absolute', bottom: 4, left: 4, right: 4, background: '#ffd700', color: '#000', fontSize: 7, fontWeight: 900, padding: '1px 0', borderRadius: 3, textTransform: 'uppercase', textAlign: 'center', zIndex: 10}}>Р С’Р С”РЎвЂљР С‘Р Р†Р ВµР Р…</div>
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
                    РІС™вЂ“РїС‘РЏ Р РЋРЎР‚Р В°Р Р†Р Р…Р С‘РЎвЂљРЎРЉ
                  </button>
                  <button 
                    onClick={() => triggerConfirm('ab', 2, handleGenerateABTest)}
                    style={{background: 'rgba(255,255,255,0.03)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}}
                    title="Р СџР ВµРЎР‚Р ВµРЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ A/B Р СћР ВµРЎРѓРЎвЂљ"
                  >
                    СЂСџвЂќвЂћ
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
                  {isAbGenerating ? 'РІРЏС– Р РЋР С•Р В·Р Т‘Р В°РЎвЂР С...' : 'Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р В·Р В° 2 Р С”РЎР‚.'}
                </button>
              )}
            </div>

            {/* Widget 2: Video */}
            <div style={{background: 'linear-gradient(145deg, rgba(167, 139, 250, 0.08) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(167, 139, 250, 0.2)', borderRadius: 20, padding: 24, position: 'relative', display: 'flex', flexDirection: 'column'}}>
              <div style={{position: 'absolute', top: 20, right: 20, background: 'rgba(167, 139, 250, 0.2)', color: '#d8b4fe', fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 6, textTransform: 'uppercase', border: '1px solid rgba(167, 139, 250, 0.3)'}}>Р СћРЎР‚Р ВµР Р…Р Т‘ 2026</div>
              <div style={{fontSize: 28, marginBottom: 12}}>СЂСџР‹В¬</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>Р С›Р В¶Р С‘Р Р†Р С‘РЎвЂљРЎРЉ Р Р† Р вЂ™Р С‘Р Т‘Р ВµР С•Р С•Р В±Р В»Р С•Р В¶Р С”РЎС“</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                Р С’Р В»Р С–Р С•РЎР‚Р С‘РЎвЂљР СРЎвЂ№ WB Р С•Р В±Р С•Р В¶Р В°РЎР‹РЎвЂљ Motion. Р вЂќР С•Р В±Р В°Р Р†Р С‘Р С 3D-Р С—Р В°РЎР‚Р В°Р В»Р В»Р В°Р С”РЎРѓ, Р С‘Р С–РЎР‚РЎС“ РЎРѓР Р†Р ВµРЎвЂљР В° Р С‘ Р В°Р Р…Р С‘Р СР В°РЎвЂ Р С‘РЎР‹ Р Р€Р СћР Сџ.
              </p>
              <button 
                onClick={() => triggerConfirm('video', 4, () => { setStatusText('СЂСџР‹В¬ Р вЂ™Р С‘Р Т‘Р ВµР С•Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ РЎРѓР С”Р С•РЎР‚Р С• Р В±РЎС“Р Т‘Р ВµРЎвЂљ Р Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р В°! Р СљРЎвЂ№ РЎС“Р В¶Р Вµ РЎР‚Р В°Р В±Р С•РЎвЂљР В°Р ВµР С Р Р…Р В°Р Т‘ РЎРЊРЎвЂљР С‘Р С.'); setStatusType('processing'); })}
                style={{width: '100%', background: 'rgba(167, 139, 250, 0.15)', color: '#d8b4fe', border: '1px solid rgba(167, 139, 250, 0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto'}}
                onMouseEnter={e => {e.currentTarget.style.background = 'rgba(167, 139, 250, 0.25)'}}
                onMouseLeave={e => {e.currentTarget.style.background = 'rgba(167, 139, 250, 0.15)'}}
              >
                Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р Р†Р С‘Р Т‘Р ВµР С• Р В·Р В° 4 Р С”РЎР‚.
              </button>
            </div>

            {/* Widget 4: UGC Photo */}
            <div style={{background: 'linear-gradient(145deg, rgba(34, 197, 94, 0.08) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column'}}>
              <div style={{fontSize: 28, marginBottom: 12}}>СЂСџвЂњВ±</div>
              <h4 style={{margin: '0 0 8px 0', fontSize: 17, color: '#fff', fontWeight: 700}}>Р В¤Р С•РЎвЂљР С• Р С•РЎвЂљ Р С—Р С•Р С”РЎС“Р С—Р В°РЎвЂљР ВµР В»Р ВµР в„–</h4>
              <p style={{fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px 0', lineHeight: 1.5}}>
                Р В Р ВµР В°Р В»Р С‘РЎРѓРЎвЂљР С‘РЎвЂЎР Р…РЎвЂ№Р Вµ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В° Р Р† Р Т‘Р С•Р СР В°РЎв‚¬Р Р…Р ВµР в„– Р С‘Р В»Р С‘ Р ВµРЎРѓРЎвЂљР ВµРЎРѓРЎвЂљР Р†Р ВµР Р…Р Р…Р С•Р в„– Р С•Р В±РЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р С”Р Вµ РІР‚вЂќ Р С”Р В°Р С” Р С‘Р В· Р С•РЎвЂљР В·РЎвЂ№Р Р†Р С•Р Р†.
              </p>
              {quickResults.ugc ? (
                <div style={{display: 'flex', gap: 8, marginTop: 'auto'}}>
                  <button 
                    onClick={() => { setQuickMode('ugc'); setQuickCardImage(null); setGeneratedImage(quickResults.ugc.image); setCardEditHistory([]); }}
                    style={{flex: 1, background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.35)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'}}
                  >
                    СЂСџвЂњВ± Р СџР С•Р С”Р В°Р В·Р В°РЎвЂљРЎРЉ
                  </button>
                  <button 
                    onClick={() => triggerConfirm('ugc', 1, () => handleQuickGenerate('ugc'))}
                    style={{background: 'rgba(34, 197, 94, 0.08)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'}}
                    onMouseEnter={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)'}}
                    onMouseLeave={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.08)'}}
                    title="Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р Р…Р С•Р Р†Р С•Р Вµ UGC-РЎвЂћР С•РЎвЂљР С•"
                  >
                    СЂСџвЂќвЂћ
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => triggerConfirm('ugc', 1, () => handleQuickGenerate('ugc'))}
                  style={{width: '100%', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.4)', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', marginTop: 'auto'}}
                  onMouseEnter={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.25)'}}
                  onMouseLeave={e => {e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)'}}
                >
                  Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р В·Р В° 1 Р С”РЎР‚.
                </button>
              )}
            </div>

          </div>

          {/* EDIT PANEL (Hidden by default, shown via button) */}
          <div id="edit-panel" style={{display: 'none', background: 'rgba(255,255,255,0.02)', borderRadius: 24, padding: '24px', border: '1px dashed rgba(255,255,255,0.1)', marginBottom: 40}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
              <div style={{fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.95)'}}>
                СЂСџР„вЂћ Р СћР С•РЎвЂЎР ВµРЎвЂЎР Р…Р В°РЎРЏ Р С—РЎР‚Р В°Р Р†Р С”Р В°
              </div>
              <button 
                onClick={() => document.getElementById('edit-panel').style.display = 'none'}
                style={{background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 24, padding: '0 10px'}}
              >Р“вЂ”</button>
            </div>
            <p style={{fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px 0', lineHeight: '1.5'}}>
              Р С›Р С—Р С‘РЎв‚¬Р С‘РЎвЂљР Вµ РЎвЂљР ВµР С”РЎРѓРЎвЂљР С•Р С, РЎвЂЎРЎвЂљР С• Р Р…РЎС“Р В¶Р Р…Р С• Р С‘Р В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ. Р С™Р В°Р В¶Р Т‘Р В°РЎРЏ Р С—РЎР‚Р В°Р Р†Р С”Р В° РЎРѓРЎвЂљР С•Р С‘РЎвЂљ <strong style={{color:'#ffd700'}}>1 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљ</strong>.
            </p>
            <div style={{display:'flex', flexDirection: 'column', gap: 16}}>
              <textarea
                className="modifier-input"
                rows={3}
                placeholder="Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: Р’В«Р Р€Р В±Р ВµРЎР‚Р С‘ РЎвЂљР ВµР С”РЎРѓРЎвЂљ РЎРѓР С—РЎР‚Р В°Р Р†Р В° Р Р†Р Р†Р ВµРЎР‚РЎвЂ¦РЎС“Р’В» Р С‘Р В»Р С‘ Р’В«Р РЋР Т‘Р ВµР В»Р В°Р в„– РЎвЂћР С•Р Р… РЎвЂљР ВµР СР Р…Р ВµР ВµР’В»"
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
                  {isCardEditing ? 'РІРЏС– Р СџРЎР‚Р С‘Р СР ВµР Р…РЎРЏР ВµР С...' : 'СЂСџвЂќвЂћ Р СџРЎР‚Р С‘Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ РІР‚вЂќ 1 Р С”РЎР‚.'}
                </button>
              </div>
            </div>

            {/* Edit history */}
            {cardEditHistory.length > 1 && (
              <div style={{marginTop: 24}}>
                <div style={{fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12}}>Р ВРЎРѓРЎвЂљР С•РЎР‚Р С‘РЎРЏ Р С—РЎР‚Р В°Р Р†Р С•Р С”</div>
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
                      {idx === 0 ? 'СЂСџР‹РЃ Р С›РЎР‚Р С‘Р С–Р С‘Р Р…Р В°Р В»' : `v${idx + 1}: ${entry.editText.substring(0, 25)}${entry.editText.length > 25 ? '...' : ''}`}
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
              Р РЋР В±РЎР‚Р С•РЎРѓР С‘РЎвЂљРЎРЉ Р С‘ Р Р…Р В°РЎвЂЎР В°РЎвЂљРЎРЉ Р В·Р В°Р Р…Р С•Р Р†Р С• РЎРѓ Р Т‘РЎР‚РЎС“Р С–Р С‘Р С РЎвЂћР С•РЎвЂљР С•
            </button>
          </div>

        </motion.div>
      )}

      {/* 8Р В±. Р В Р вЂўР вЂ”Р Р€Р вЂєР В¬Р СћР С’Р Сћ РІР‚вЂќ РЎР‚Р ВµР В¶Р С‘Р СРЎвЂ№ Р С›Р Т‘Р ВµР В¶Р Т‘Р В° / Р СџРЎР‚Р ВµР Т‘Р СР ВµРЎвЂљР С”Р В° */}
      <AnimatePresence>
        {generatedImage && appMode !== 'quick' && (
          <motion.div key="result-section" className="section result-section" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:0.5}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
              <h3 style={{margin:0}}>Р В¤Р С‘Р Р…Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р В Р ВµР Р…Р Т‘Р ВµРЎР‚</h3>
              <button
                onClick={() => {
                  setGeneratedImage(null);
                  setImageHistory([]);
                  setHistoryIndex(0);
                  localStorage.removeItem('vton_generatedImage');
                }}
                title="Р вЂ”Р В°Р С”РЎР‚РЎвЂ№РЎвЂљРЎРЉ РЎР‚Р ВµР Р…Р Т‘Р ВµРЎР‚"
                style={{background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', fontSize:'16px', color:'rgba(255,255,255,0.6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.2s'}}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,80,80,0.25)'; e.currentTarget.style.color='#ff6060'; e.currentTarget.style.borderColor='rgba(255,80,80,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; }}
              >РІСљвЂў</button>
            </div>
            <div className="result-image-wrap" style={{position:'relative'}}>
              {/* РІвЂ С’ Previous render */}
              {imageHistory.length > 1 && historyIndex > 0 && (
                <button
                  className="history-nav-btn history-prev"
                  onClick={(e) => { e.stopPropagation(); const ni = historyIndex - 1; setHistoryIndex(ni); setGeneratedImage(imageHistory[ni].image); }}
                  title="Р СџРЎР‚Р ВµР Т‘РЎвЂ№Р Т‘РЎС“РЎвЂ°Р С‘Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ"
                >РІР‚в„–</button>
              )}
              <img src={generatedImage} alt="VTON" onClick={() => setLightboxSrc(generatedImage)} style={{cursor:'pointer'}} />
              {/* РІвЂ вЂ™ Next render */}
              {imageHistory.length > 1 && historyIndex < imageHistory.length - 1 && (
                <button
                  className="history-nav-btn history-next"
                  onClick={(e) => { e.stopPropagation(); const ni = historyIndex + 1; setHistoryIndex(ni); setGeneratedImage(imageHistory[ni].image); }}
                  title="Р РЋР В»Р ВµР Т‘РЎС“РЎР‹РЎвЂ°Р С‘Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ"
                >РІР‚С”</button>
              )}
            </div>
            {imageHistory.length > 1 && (
              <div className="history-info">
                <p className="history-counter">{historyIndex + 1} / {imageHistory.length}</p>
                {imageHistory[historyIndex]?.label && (
                  <p className="history-label">РІСљРЏРїС‘РЏ {imageHistory[historyIndex].label}</p>
                )}
              </div>
            )}
            <p className="touch-zoom-hint">СЂСџвЂвЂ  Р СњР В°Р В¶Р СР С‘РЎвЂљР Вµ Р Р…Р В° РЎвЂћР С•РЎвЂљР С• Р Т‘Р В»РЎРЏ РЎС“Р Р†Р ВµР В»Р С‘РЎвЂЎР ВµР Р…Р С‘РЎРЏ</p>
            <div className="result-actions">
              <button className="download-btn" onClick={handleDownload}>РІВ¬вЂЎРїС‘РЏ Р РЋР С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ</button>
              {/* Р С™Р В°Р В»Р С‘Р В±РЎР‚Р С•Р Р†Р С”Р В° Р С‘ Р’В«Р СџР ВµРЎР‚Р ВµР С•Р Т‘Р ВµРЎвЂљРЎРЉР’В» РІР‚вЂќ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р С”Р С•Р С–Р Т‘Р В° Р ВµРЎРѓРЎвЂљРЎРЉ РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С”-Р СР С•Р Т‘Р ВµР В»РЎРЉ */}
              {(appMode === 'fashion' || (appMode === 'product' && productWithModel)) && (
                <button className="save-model-btn" onClick={() => openCalibration('save')}>СЂСџР‹Р‡ Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ (Р С”Р В°Р В»Р С‘Р В±РЎР‚Р С•Р Р†Р С”Р В°)</button>
              )}
              {appMode === 'fashion' ? (
                <button
                  className="redress-btn has-tooltip"
                  onClick={handleGenerate}
                  disabled={isProcessing}
                  data-tooltip="Р вЂ™Р ВµРЎР‚Р Р…РЎС“РЎвЂљРЎРЉ Р С•Р Т‘Р ВµР В¶Р Т‘РЎС“ Р Р† Р С‘РЎРѓРЎвЂ¦Р С•Р Т‘Р Р…РЎвЂ№Р в„– Р Р†Р С‘Р Т‘"
                >СЂСџвЂвЂ” Р СџР ВµРЎР‚Р ВµР С•Р Т‘Р ВµРЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ</button>
              ) : (
                <button
                  className="redress-btn has-tooltip"
                  onClick={handleGenerate}
                  disabled={isProcessing}
                  data-tooltip="Р СџР ВµРЎР‚Р ВµР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ РЎРѓ РЎвЂљР ВµР С”РЎС“РЎвЂ°Р С‘Р СР С‘ Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р В°Р СР С‘"
                >СЂСџвЂќвЂћ Р СњР С•Р Р†РЎвЂ№Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ</button>
              )}
            </div>

            {/* CARD DESIGNER CTA РІР‚вЂќ removed from results, lives in "Р вЂ™ Р Т‘Р Р†Р В° Р С”Р В»Р С‘Р С”Р В°" mode only */}

            {/* Iterative editing */}
            <div className="shot-modifier-block">
              <div className="shot-modifier-label">
                {appMode === 'product' ? 'РІСљРЏРїС‘РЏ Р ТђР С•РЎвЂљР С‘РЎвЂљР Вµ РЎвЂЎРЎвЂљР С•-РЎвЂљР С• Р С‘Р В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ Р Р† Р С”Р В°Р Т‘РЎР‚Р Вµ?' : 'РІСљРЏРїС‘РЏ Р ТђР С•РЎвЂљР С‘РЎвЂљР Вµ РЎвЂЎРЎвЂљР С•-РЎвЂљР С• Р С‘Р В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ Р Р† Р С”Р В°Р Т‘РЎР‚Р Вµ?'}
              </div>
              <textarea className="modifier-input" rows={2} placeholder={
                appMode === 'product'
                  ? 'Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: РЎРѓР Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ РЎвЂћР С•Р Р… РЎвЂљР ВµР СР Р…Р ВµР Вµ, Р Т‘Р С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р В±Р В»Р С‘Р С”Р С‘, РЎС“Р В±РЎР‚Р В°РЎвЂљРЎРЉ РЎвЂљР ВµР Р…Р С‘, Р С—Р С•Р Р†Р ВµРЎР‚Р Р…РЎС“РЎвЂљРЎРЉ РЎвЂљР С•Р Р†Р В°РЎР‚'
                  : 'Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: РЎРѓР Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ Р Р†РЎвЂ№РЎв‚¬Р Вµ, Р С‘Р В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ РЎвЂ Р Р†Р ВµРЎвЂљ Р Р†Р С•Р В»Р С•РЎРѓ, Р Т‘Р С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р С•РЎвЂЎР С”Р С‘, РЎС“Р В±РЎР‚Р В°РЎвЂљРЎРЉ РЎвЂљР ВµР Р…Р С‘'
              }
                value={shotModifier} onChange={e => setShotModifier(e.target.value)} />
              <button className="modifier-regen-btn" onClick={handleRegenerate} disabled={!shotModifier.trim() || isProcessing}>
                СЂСџвЂќвЂћ Р вЂ™Р Р…Р ВµРЎРѓРЎвЂљР С‘ Р С‘Р В·Р СР ВµР Р…Р ВµР Р…Р С‘РЎРЏ
              </button>
            </div>

            {/* Photoshoot */}
            <div className="photoshoot-block">
              <div className="photoshoot-label">{appMode === 'product' ? 'СЂСџвЂњС‘ Р РЋР Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ РЎР‚Р В°РЎРѓР С”Р В°Р Т‘РЎР‚Р С•Р Р†Р С”РЎС“' : 'СЂСџвЂњС‘ Р РЋР Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ РЎвЂћР С•РЎвЂљР С•РЎРѓР ВµРЎРѓРЎРѓР С‘РЎР‹'}</div>
              <p className="photoshoot-hint">
                {appMode === 'product'
                  ? 'Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р Р…Р ВµРЎРѓР С”Р С•Р В»РЎРЉР С”Р С‘РЎвЂ¦ РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В° РЎРѓ РЎР‚Р В°Р В·Р Р…РЎвЂ№РЎвЂ¦ РЎР‚Р В°Р С”РЎС“РЎР‚РЎРѓР С•Р Р† Р С‘ Р С”Р С•Р СР С—Р С•Р В·Р С‘РЎвЂ Р С‘Р в„–'
                  : 'Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р Р…Р ВµРЎРѓР С”Р С•Р В»РЎРЉР С”Р С‘РЎвЂ¦ РЎвЂћР С•РЎвЂљР С• РЎРѓ РЎР‚Р В°Р В·Р Р…РЎвЂ№РЎвЂ¦ РЎР‚Р В°Р С”РЎС“РЎР‚РЎРѓР С•Р Р†'}
              </p>
              <p className="photoshoot-hint" style={{fontSize:'0.72rem', opacity:0.6, marginTop:2}}>
                {appMode === 'product'
                  ? 'СЂСџвЂњВ¦ Р В¤Р С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В° Р В±Р ВµРЎР‚РЎвЂРЎвЂљРЎРѓРЎРЏ Р С‘Р В· Р В·Р В°Р С–РЎР‚РЎС“Р В¶Р ВµР Р…Р Р…РЎвЂ№РЎвЂ¦ Р Р†Р В°Р СР С‘ РЎвЂћР С•РЎвЂљР С•, Р Р…Р Вµ Р С‘Р В· РЎРѓР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р С•Р С–Р С• Р С”Р В°Р Т‘РЎР‚Р В°'
                  : 'СЂСџвЂвЂў Р С›Р Т‘Р ВµР В¶Р Т‘Р В° Р В±Р ВµРЎР‚РЎвЂРЎвЂљРЎРѓРЎРЏ Р С‘Р В· Р В·Р В°Р С–РЎР‚РЎС“Р В¶Р ВµР Р…Р Р…РЎвЂ№РЎвЂ¦ Р Р†Р В°Р СР С‘ РЎвЂћР С•РЎвЂљР С•, Р Р…Р Вµ Р С‘Р В· РЎРѓР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р С•Р С–Р С• Р С”Р В°Р Т‘РЎР‚Р В°'}
              </p>

              {/* Calibration prompt РІР‚вЂќ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ РЎвЂЎР ВµР В»Р С•Р Р†Р ВµР С”-Р СР С•Р Т‘Р ВµР В»РЎРЉ */}
              {(appMode === 'fashion' || (appMode === 'product' && productWithModel)) && !selectedSavedModelId && !(appMode === 'product' && !productWithModel) && (
                <div className="calibration-prompt">
                  <p className="calibration-prompt-text">СЂСџвЂ™РЋ Р вЂќР В»РЎРЏ Р СР В°Р С”РЎРѓР С‘Р СР В°Р В»РЎРЉР Р…Р С•Р в„– Р С”Р С•Р Р…РЎРѓР С‘РЎРѓРЎвЂљР ВµР Р…РЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р В»Р С‘РЎвЂ Р В° РЎР‚Р ВµР С”Р С•Р СР ВµР Р…Р Т‘РЎС“Р ВµР С РЎРѓР Р…Р В°РЎвЂЎР В°Р В»Р В° <strong>Р С•РЎвЂљР С”Р В°Р В»Р С‘Р В±РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ</strong></p>
                  <button className="calib-prompt-btn" onClick={() => openCalibration('photoshoot')}>
                    СЂСџР‹Р‡ Р С›РЎвЂљР С”Р В°Р В»Р С‘Р В±РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р СР С•Р Т‘Р ВµР В»РЎРЉ
                  </button>
                </div>
              )}

              <div className="photoshoot-choice">
                <button className="photoshoot-btn photoshoot-btn--3" onClick={() => handlePhotoshoot(3)} disabled={isPhotoshooting || isProcessing}>
                  {isPhotoshooting ? 'РІРЏС– Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ...' : photoshootImages.filter(Boolean).length > 0 ? `СЂСџвЂњВ· Р ВµРЎвЂ°РЎвЂ +3` : 'СЂСџвЂњВ· 3 РЎвЂћР С•РЎвЂљР С•'}
                </button>
                <button className="photoshoot-btn photoshoot-btn--5" onClick={() => handlePhotoshoot(5)} disabled={isPhotoshooting || isProcessing}>
                  {isPhotoshooting ? 'РІРЏС– Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ...' : photoshootImages.filter(Boolean).length > 0 ? `СЂСџвЂњС‘ Р ВµРЎвЂ°РЎвЂ +5` : 'СЂСџвЂњС‘ 5 РЎвЂћР С•РЎвЂљР С•'}
                </button>
              </div>
            </div>

            {/* Photoshoot gallery */}
            {photoshootImages.length > 0 && (
              <div className="photoshoot-gallery">
                <h4>СЂСџвЂњВ· Р вЂњР В°Р В»Р ВµРЎР‚Р ВµРЎРЏ РЎвЂћР С•РЎвЂљР С•РЎРѓР ВµРЎРѓРЎРѓР С‘Р С‘</h4>
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
                          <img src={displayImg} alt={`Р С™Р В°Р Т‘РЎР‚ ${i+1}`} onClick={() => {
                            const gallery = hasEdits ? versions : photoshootImages;
                            openLightboxGallery(gallery, hasEdits ? viewIdx : i);
                          }} style={{cursor:'pointer'}} />
                          {isEditing && (
                            <div className="photo-editing-overlay">
                              <div className="processing-spinner" style={{width:28,height:28}} />
                              <span>Р В Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚РЎС“Р ВµРЎвЂљРЎРѓРЎРЏ...</span>
                            </div>
                          )}
                          {hasEdits && (
                            <>
                              <span className="photo-edited-badge">РІСљРЃ Р ВР В·Р СР ВµР Р…Р ВµР Р…Р С• ({versions.length - 1})</span>
                              <div className="photo-history-nav">
                                <button className="photo-history-btn" disabled={viewIdx <= 0} onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoViewIdx(prev => ({ ...prev, [i]: viewIdx - 1 }));
                                }}>РІР‚в„–</button>
                                <span className="photo-history-counter">{viewIdx + 1}/{versions.length}</span>
                                <button className="photo-history-btn" disabled={viewIdx >= versions.length - 1} onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoViewIdx(prev => ({ ...prev, [i]: viewIdx + 1 }));
                                }}>РІР‚С”</button>
                              </div>
                            </>
                          )}
                          <button className="edit-mini-btn" title="Р В Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ РЎРЊРЎвЂљР С•РЎвЂљ Р С”Р В°Р Т‘РЎР‚" onClick={(e) => {
                            e.stopPropagation();
                            setEditingPhotoIdx(i);
                            setPhotoEditText('');
                          }}>РІСљРЏРїС‘РЏ</button>
                          <div className="download-mini-wrapper">
                            <button className="download-mini-btn" onClick={(e) => {
                              e.stopPropagation();
                              if (hasEdits) {
                                setDownloadMenuIdx(downloadMenuIdx === i ? null : i);
                              } else {
                                const a = document.createElement('a'); a.href = displayImg; a.download = `SellerStudio_${i+1}_${Date.now()}.jpg`; a.click();
                              }
                            }}>РІВ¬вЂЎРїС‘РЏ</button>
                            {downloadMenuIdx === i && hasEdits && (
                              <div className="download-menu">
                                <button onClick={(e) => {
                                  e.stopPropagation();
                                  const a = document.createElement('a'); a.href = versions[versions.length - 1]; a.download = `SellerStudio_${i+1}_latest_${Date.now()}.jpg`; a.click();
                                  setDownloadMenuIdx(null);
                                }}>СЂСџвЂњС‘ Р СџР С•РЎРѓР В»Р ВµР Т‘Р Р…РЎР‹РЎР‹ Р Р†Р ВµРЎР‚РЎРѓР С‘РЎР‹</button>
                                <button onClick={(e) => {
                                  e.stopPropagation();
                                  versions.forEach((v, vi) => {
                                    setTimeout(() => {
                                      const a = document.createElement('a'); a.href = v; a.download = `SellerStudio_${i+1}_v${vi+1}_${Date.now()}.jpg`; a.click();
                                    }, vi * 300);
                                  });
                                  setDownloadMenuIdx(null);
                                }}>СЂСџвЂњВ¦ Р вЂ™РЎРѓР Вµ Р Р†Р ВµРЎР‚РЎРѓР С‘Р С‘ ({versions.length})</button>
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
        <a href="/offer" target="_blank" rel="noreferrer">Р СџРЎС“Р В±Р В»Р С‘РЎвЂЎР Р…Р В°РЎРЏ Р С•РЎвЂћР ВµРЎР‚РЎвЂљР В°</a>
      </footer>

      {/* OVERLAYS */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div className="processing-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <button className="processing-close-btn" onClick={() => setIsProcessing(false)} title="Р РЋР С”РЎР‚РЎвЂ№РЎвЂљРЎРЉ">РІСљвЂў</button>
            <div style={{width:'90%', maxWidth:480}}>
              <TerminalOfMagic isActive={isProcessing} customMessage={processingMsg} />
              <p className="processing-hint" style={{textAlign:'center', marginTop:12}}>Р С›Р В±РЎвЂ№РЎвЂЎР Р…Р С• 30РЎРѓ РІР‚вЂќ 2 Р СР С‘Р Р…</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Р СљР С›Р вЂќР С’Р вЂєР С™Р С’: Р вЂєР С•Р С”Р В°РЎвЂ Р С‘РЎРЏ */}
      <AnimatePresence>
        {showLocModal && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowLocModal(false)}>
            <motion.div className="modal-content" initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} onClick={e=>e.stopPropagation()}>
              <div className="modal-title">СЂСџвЂњРЊ Р С›РЎвЂ Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р В»Р С•Р С”Р В°РЎвЂ Р С‘РЎР‹</div>
              <input className="modal-input" placeholder="Р СњР В°Р В·Р Р†Р В°Р Р…Р С‘Р Вµ (Р Р…Р В°Р С—РЎР‚. Р РЋРЎвЂљРЎС“Р Т‘Р С‘РЎРЏ Р вЂ™Р ВµР В»Р ВµРЎРѓ)" value={locName} onChange={e=>setLocName(e.target.value)} />
              <div className="drop-zone" onClick={()=>locFileRef.current?.click()}
                onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add('dragging');}}
                onDragLeave={e=>e.currentTarget.classList.remove('dragging')}
                onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');handleLocFiles(e.dataTransfer.files);}}>
                <input type="file" accept="image/*" multiple ref={locFileRef} style={{display:'none'}} onChange={e=>handleLocFiles(e.target.files)} />
                <p className="drop-zone-text">СЂСџвЂњС‘ Р СџР ВµРЎР‚Р ВµРЎвЂљР В°РЎвЂ°Р С‘РЎвЂљР Вµ Р С‘Р В»Р С‘ Р Р…Р В°Р В¶Р СР С‘РЎвЂљР Вµ</p>
                <p className="drop-zone-hint">2-5 РЎвЂћР С•РЎвЂљР С•Р С–РЎР‚Р В°РЎвЂћР С‘Р в„– Р В»Р С•Р С”Р В°РЎвЂ Р С‘Р С‘ РЎРѓ РЎР‚Р В°Р В·Р Р…РЎвЂ№РЎвЂ¦ РЎР‚Р В°Р С”РЎС“РЎР‚РЎРѓР С•Р Р†</p>
                {locPreviews.length>0 && <div className="drop-zone-previews">{locPreviews.map((p,i)=><img key={i} src={p} alt="" style={{cursor:'zoom-in'}} onClick={(e) => { e.stopPropagation(); setLightboxSrc(p); }} />)}</div>}
              </div>
              <div className="modal-actions">
                <button className="modal-btn-cancel" onClick={()=>{setShowLocModal(false);setLocName('');setLocPreviews([]);}}>Р С›РЎвЂљР СР ВµР Р…Р В°</button>
                <button className="modal-btn-primary" onClick={saveLoc} disabled={!locName.trim()||locPreviews.length<2}>Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Р вЂ™Р ВР вЂ”Р С’Р В Р вЂќ: Р РЋР С•Р В·Р Т‘Р В°Р Р…Р С‘Р Вµ Р С—Р ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В¶Р В° */}
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

      {/* Р СљР С›Р вЂќР С’Р вЂєР С™Р С’: LoRA Р СР С•Р Т‘Р ВµР В»РЎРЉ */}
      <AnimatePresence>
        <LoraModal show={showLoraModal} onClose={()=>{setShowLoraModal(false);setLoraName('');setLoraPhotos({front:null,left34:null,right34:null,fullbody:null});}}
          onSave={saveLoraModel} loraName={loraName} setLoraName={setLoraName} loraPhotos={loraPhotos} setLoraPhotos={setLoraPhotos}
          authHeaders={(() => { const t = user?.accessToken; return t ? { Authorization: 'Bearer ' + t } : {}; })()} />
      </AnimatePresence>

      {/* Р СљР С›Р вЂќР С’Р вЂєР С™Р С’: Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ РЎРѓР С–Р ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р Р…РЎС“РЎР‹ Р СР С•Р Т‘Р ВµР В»РЎРЉ */}
      <AnimatePresence>
        {showSaveModelModal && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowSaveModelModal(false)}>
            <motion.div className="modal-content" initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} onClick={e=>e.stopPropagation()}>
              <div className="modal-title">РІВ­С’ Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ Р ВР В-Р СР С•Р Т‘Р ВµР В»РЎРЉ</div>
              <p className="modal-hint">Р вЂќР В°Р в„–РЎвЂљР Вµ Р С‘Р СРЎРЏ РЎРЊРЎвЂљР С•Р в„– Р СР С•Р Т‘Р ВµР В»Р С‘ Р Т‘Р В»РЎРЏ Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ Р Р† Р В±РЎС“Р Т‘РЎС“РЎвЂ°Р С‘РЎвЂ¦ Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏРЎвЂ¦</p>
              <input className="modal-input" placeholder="Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: Р С’Р В»Р С‘Р Р…Р В°, РЎР‚РЎвЂ№Р В¶Р В°РЎРЏ" value={saveModelName} onChange={e=>setSaveModelName(e.target.value)} />
              <div className="modal-actions">
                <button className="modal-btn-cancel" onClick={()=>{setShowSaveModelModal(false);setSaveModelName('');}}>Р С›РЎвЂљР СР ВµР Р…Р В°</button>
                <button className="modal-btn-primary" onClick={saveGenModel} disabled={!saveModelName.trim()}>Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIGHTBOX with gallery navigation */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div className="lightbox-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
            <button className="lightbox-close" onClick={() => { setLightboxSrc(null); setLightboxGallery([]); }}>РІСљвЂў</button>
            {lightboxGallery.length > 1 && (
              <button className="lightbox-nav lightbox-nav--prev" onClick={e => {
                e.stopPropagation();
                const newIdx = (lightboxIdx - 1 + lightboxGallery.length) % lightboxGallery.length;
                setLightboxIdx(newIdx); setLightboxSrc(lightboxGallery[newIdx]);
              }}>РІР‚в„–</button>
            )}
            <img src={lightboxSrc} alt="Р СџРЎР‚Р С•РЎРѓР СР С•РЎвЂљРЎР‚" className="lightbox-img" onClick={e => e.stopPropagation()} />
            {lightboxGallery.length > 1 && (
              <button className="lightbox-nav lightbox-nav--next" onClick={e => {
                e.stopPropagation();
                const newIdx = (lightboxIdx + 1) % lightboxGallery.length;
                setLightboxIdx(newIdx); setLightboxSrc(lightboxGallery[newIdx]);
              }}>РІР‚С”</button>
            )}
            <div className="lightbox-footer">
              {lightboxGallery.length > 1 && <span className="lightbox-counter">{lightboxIdx + 1} / {lightboxGallery.length}</span>}
              <button className="lightbox-download" onClick={e => { e.stopPropagation(); const a = document.createElement('a'); a.href = lightboxSrc; a.download = `SellerStudio_${Date.now()}.jpg`; a.click(); }}>РІВ¬вЂЎРїС‘РЏ Р РЋР С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PHOTO EDITOR MODAL */}
      <AnimatePresence>
        {editingPhotoIdx !== null && photoshootImages[editingPhotoIdx] && (
          <motion.div className="photo-editor-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => { setEditingPhotoIdx(null); setPhotoEditText(''); }}>
            <motion.div className="photo-editor-modal" initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.9, opacity:0}} onClick={e => e.stopPropagation()}>
              <button className="photo-editor-close" onClick={() => { setEditingPhotoIdx(null); setPhotoEditText(''); }}>РІСљвЂў</button>
              <div className="photo-editor-preview">
                <img src={photoshootImages[editingPhotoIdx]} alt="Р В Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚РЎС“Р ВµР СРЎвЂ№Р в„– Р С”Р В°Р Т‘РЎР‚" />
                <span className="photo-editor-badge">Р С™Р В°Р Т‘РЎР‚ {editingPhotoIdx + 1}</span>
              </div>
              <div className="photo-editor-controls">
                <p className="photo-editor-hint">Р С›Р С—Р С‘РЎв‚¬Р С‘РЎвЂљР Вµ, РЎвЂЎРЎвЂљР С• Р С‘Р В·Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ Р Р† РЎРЊРЎвЂљР С•Р С Р С”Р В°Р Т‘РЎР‚Р Вµ:</p>
                <textarea
                  className="photo-editor-input"
                  placeholder={appMode === 'product'
                    ? 'Р РЋР Т‘Р ВµР В»Р В°Р в„– РЎвЂћР С•Р Р… РЎвЂљР ВµР СР Р…Р ВµР Вµ, Р Т‘Р С•Р В±Р В°Р Р†РЎРЉ Р В±Р В»Р С‘Р С”Р С‘, РЎС“Р В±Р ВµРЎР‚Р С‘ РЎвЂљР ВµР Р…Р С‘, Р С—Р С•Р Р†Р ВµРЎР‚Р Р…Р С‘ РЎвЂљР С•Р Р†Р В°РЎР‚...'
                    : 'Р Р€Р В±Р ВµРЎР‚Р С‘ РЎвЂљР В°РЎвЂљРЎС“Р С‘РЎР‚Р С•Р Р†Р С”РЎС“, Р Т‘Р С•Р В±Р В°Р Р†РЎРЉ Р С•РЎвЂЎР С”Р С‘, РЎРѓР СР ВµР Р…Р С‘ РЎвЂ Р Р†Р ВµРЎвЂљ Р Р†Р С•Р В»Р С•РЎРѓ...'}
                  value={photoEditText}
                  onChange={e => setPhotoEditText(e.target.value)}
                  rows={3}
                />
                <div className="photo-editor-quick-tags">
                  {(appMode === 'product'
                    ? ['Р Р€Р В±РЎР‚Р В°РЎвЂљРЎРЉ РЎвЂљР ВµР Р…Р С‘', 'Р Р‡РЎР‚РЎвЂЎР Вµ РЎРѓР Р†Р ВµРЎвЂљ', 'Р СћР ВµР СР Р…Р ВµР Вµ РЎвЂћР С•Р Р…', 'Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р В±Р В»Р С‘Р С”Р С‘', 'Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ РЎвЂљР ВµР С”РЎРѓРЎвЂљРЎС“РЎР‚РЎС“', 'Р вЂќРЎР‚РЎС“Р С–Р С•Р в„– РЎР‚Р В°Р С”РЎС“РЎР‚РЎРѓ']
                    : ['Р Р€Р В±РЎР‚Р В°РЎвЂљРЎРЉ РЎвЂљР В°РЎвЂљРЎС“Р С‘РЎР‚Р С•Р Р†Р С”РЎС“', 'Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ Р С•РЎвЂЎР С”Р С‘', 'Р РЋР СР ВµР Р…Р С‘РЎвЂљРЎРЉ РЎвЂћР С•Р Р…', 'Р Р€Р В±РЎР‚Р В°РЎвЂљРЎРЉ Р С—Р С‘РЎР‚РЎРѓР С‘Р Р…Р С–', 'Р вЂќРЎР‚РЎС“Р С–Р В°РЎРЏ Р С—РЎР‚Р С‘РЎвЂЎРЎвЂРЎРѓР С”Р В°', 'Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ РЎС“Р В»РЎвЂ№Р В±Р С”РЎС“']
                  ).map(tag => (
                    <button key={tag} className="photo-editor-tag" onClick={() => setPhotoEditText(prev => prev ? `${prev}, ${tag.toLowerCase()}` : tag.toLowerCase())}>{tag}</button>
                  ))}
                </div>
                <button className="photo-editor-submit" onClick={handlePhotoEdit} disabled={!photoEditText.trim()}>
                  РІСљРЃ Р СџРЎР‚Р С‘Р СР ВµР Р…Р С‘РЎвЂљРЎРЉ Р С‘Р В·Р СР ВµР Р…Р ВµР Р…Р С‘РЎРЏ
                </button>
                <p className="photo-editor-hint" style={{fontSize:'0.7rem', opacity:0.5, textAlign:'center', marginTop:4}}>Р СљР С•Р Т‘Р В°Р В» Р В·Р В°Р С”РЎР‚Р С•Р ВµРЎвЂљРЎРѓРЎРЏ, РЎР‚Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ Р С—Р С•Р в„–Р Т‘РЎвЂРЎвЂљ Р Р† РЎвЂћР С•Р Р…Р Вµ</p>
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
                throw new Error('Р вЂќР В»РЎРЏ РЎРѓР С•Р В·Р Т‘Р В°Р Р…Р С‘РЎРЏ Р СР С•Р Т‘Р ВµР В»Р С‘ Р Р…Р ВµР С•Р В±РЎвЂ¦Р С•Р Т‘Р С‘Р СР С• Р В°Р Р†РЎвЂљР С•РЎР‚Р С‘Р В·Р С•Р Р†Р В°РЎвЂљРЎРЉРЎРѓРЎРЏ');
              }
              // Р С™Р В°Р В»Р С‘Р В±РЎР‚Р С•Р Р†Р С”Р В° Р СР С•Р Т‘Р ВµР В»Р С‘ РЎвЂљР ВµР С—Р ВµРЎР‚РЎРЉ Р В±Р ВµРЎРѓР С—Р В»Р В°РЎвЂљР Р…Р В°, Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљРЎвЂ№ Р Р…Р Вµ РЎРѓР С—Р С‘РЎРѓРЎвЂ№Р Р†Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ.
            }}
            modelPrompt={getCurrentModelPrompt()}
            modelRefImages={getCurrentModelRefs()}
            userId={user?.uid}
            getAuthToken={async () => user?.getIdToken?.()}
          />
        )}
      </AnimatePresence>

      {/* РІвЂўС’РІвЂўС’РІвЂўС’ CARD COUNT SELECTION MODAL РІвЂўС’РІвЂўС’РІвЂўС’ */}
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
              <h3 className="card-count-title">СЂСџР‹Р‡ Р РЋР С”Р С•Р В»РЎРЉР С”Р С• Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР ВµР С” РЎРѓР Т‘Р ВµР В»Р В°РЎвЂљРЎРЉ?</h3>
              <p className="card-count-subtitle">Р С™Р В°Р В¶Р Т‘Р В°РЎРЏ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В° = 1 Р С”РЎР‚Р ВµР Т‘Р С‘РЎвЂљ</p>
              <div className="card-count-grid">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    className="card-count-btn"
                    onClick={() => { setCardVariantCount(n); startCardGeneration(n); }}
                  >
                    <span className="card-count-number">{n}</span>
                    <span className="card-count-label">{n === 1 ? 'Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р В°' : (n < 5 ? 'Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР С”Р С‘' : 'Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР ВµР С”')}</span>
                  </button>
                ))}
              </div>
              <div className="card-count-custom">
                <input
                  type="number"
                  min="1"
                  max="20"
                  placeholder="Р РЋР Р†Р С•РЎвЂ Р С”Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С•"
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
                  Р РЋР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ РІвЂ вЂ™
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* РІвЂўС’РІвЂўС’РІвЂўС’ CARD EXAMPLES MODAL РІвЂўС’РІвЂўС’РІвЂўС’ */}
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
                <h3>Р СџРЎР‚Р С‘Р СР ВµРЎР‚РЎвЂ№ Р С”Р В°РЎР‚РЎвЂљР С•РЎвЂЎР ВµР С” Р Т‘Р С• / Р С—Р С•РЎРѓР В»Р Вµ</h3>
                <button className="card-examples-close" onClick={() => setShowCardExamples(false)}>РІСљвЂў</button>
              </div>

              <div className="card-examples-tabs">
                <button
                  className={`card-examples-tab ${cardDesignStyle === 'natural' ? 'active' : ''}`}
                  onClick={() => setCardDesignStyle('natural')}
                >СЂСџРЉС— Р вЂўРЎРѓРЎвЂљР ВµРЎРѓРЎвЂљР Р†Р ВµР Р…Р Р…Р В°РЎРЏ</button>
                <button
                  className={`card-examples-tab ${cardDesignStyle === 'epic' ? 'active' : ''}`}
                  onClick={() => setCardDesignStyle('epic')}
                >СЂСџвЂќТђ Р В­Р С—Р С‘РЎвЂЎР Р…Р В°РЎРЏ</button>
              </div>

              <div className="card-examples-grid">
                {/* Glass example */}
                <div className="card-example-pair">
                  <div className="card-example-item">
                    <div className="card-example-label">Р вЂќР С•</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-glass-before.jpg' : '/examples/cards/epic-glass-before.jpg'} alt="Р РЋРЎвЂљР В°Р С”Р В°Р Р… Р Т‘Р С•" />
                  </div>
                  <div className="card-example-arrow">РІвЂ вЂ™</div>
                  <div className="card-example-item">
                    <div className="card-example-label">Р СџР С•РЎРѓР В»Р Вµ</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-glass-after.png' : '/examples/cards/epic-glass-after.png'} alt="Р РЋРЎвЂљР В°Р С”Р В°Р Р… Р С—Р С•РЎРѓР В»Р Вµ" />
                  </div>
                </div>

                {/* Pajama example */}
                <div className="card-example-pair">
                  <div className="card-example-item">
                    <div className="card-example-label">Р вЂќР С•</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-pajama-before.png' : '/examples/cards/epic-pajama-before.jpg'} alt="Р СџР С‘Р В¶Р В°Р СР В° Р Т‘Р С•" />
                  </div>
                  <div className="card-example-arrow">РІвЂ вЂ™</div>
                  <div className="card-example-item">
                    <div className="card-example-label">Р СџР С•РЎРѓР В»Р Вµ</div>
                    <img src={cardDesignStyle === 'natural' ? '/examples/cards/natural-pajama-after.png' : '/examples/cards/epic-pajama-after.png'} alt="Р СџР С‘Р В¶Р В°Р СР В° Р С—Р С•РЎРѓР В»Р Вµ" />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Р СљР С›Р вЂќР С’Р вЂєР С™Р С’: Р вЂќР С•Р В±Р В°Р Р†Р В»Р ВµР Р…Р С‘Р Вµ/Р В Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ Р С”Р В°РЎРѓРЎвЂљР С•Р СР Р…Р С•Р С–Р С• РЎвЂЎР С‘Р С—Р В° */}
      <AnimatePresence>
        {(customChipModalSection || editingChip) && (
          <motion.div className="modal-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} 
            onClick={() => { setCustomChipModalSection(null); setEditingChip(null); setNewChipText(''); }}>
            <motion.div className="modal-content" initial={{scale:0.9}} animate={{scale:1}} exit={{scale:0.9}} onClick={e=>e.stopPropagation()}>
              <div className="modal-title">
                {editingChip ? 'РІСљРЏРїС‘РЏ Р В Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ' : (
                  customChipModalSection === 'model' ? 'РІС›вЂў Р РЋР Р†Р С•Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ Р СР С•Р Т‘Р ВµР В»Р С‘' :
                  customChipModalSection === 'pose' ? 'РІС›вЂў Р РЋР Р†Р С•Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ Р С—Р С•Р В·РЎвЂ№' :
                  'РІС›вЂў Р РЋР Р†Р С•Р в„– Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ РЎвЂћР С•Р Р…Р В°'
                )}
              </div>
              <input 
                className="modal-input" 
                autoFocus 
                placeholder={
                  (editingChip?.section || customChipModalSection) === 'model' ? "Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: РЎР‚РЎвЂ№Р В¶Р В°РЎРЏ Р Т‘Р ВµР Р†РЎС“РЎв‚¬Р С”Р В° Р Р† Р С•РЎвЂЎР С”Р В°РЎвЂ¦..." :
                  (editingChip?.section || customChipModalSection) === 'pose' ? "Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: Р СР С•Р Т‘Р ВµР В»РЎРЉ РЎРѓР С‘Р Т‘Р С‘РЎвЂљ Р Р…Р В° РЎРѓРЎвЂљРЎС“Р В»Р Вµ..." :
                  "Р СњР В°Р С—РЎР‚Р С‘Р СР ВµРЎР‚: Р С”Р С‘РЎР‚Р С—Р С‘РЎвЂЎР Р…Р В°РЎРЏ РЎРѓРЎвЂљР ВµР Р…Р В°, Р Р…Р ВµР С•Р Р…Р С•Р Р†РЎвЂ№Р в„– РЎРѓР Р†Р ВµРЎвЂљ..."
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
                <button className="modal-btn-cancel" onClick={()=>{ setCustomChipModalSection(null); setEditingChip(null); setNewChipText(''); }}>Р С›РЎвЂљР СР ВµР Р…Р В°</button>
                <button className="modal-btn-primary" onClick={() => {
                  if (editingChip) saveEditCustomChip();
                  else {
                    addCustomChip(customChipModalSection);
                    setCustomChipModalSection(null);
                  }
                }} disabled={!newChipText.trim()}>
                  {editingChip ? 'Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРЉ' : 'Р вЂќР С•Р В±Р В°Р Р†Р С‘РЎвЂљРЎРЉ'}
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
