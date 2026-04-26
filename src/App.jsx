import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODEL_PRESETS, POSE_PRESETS, BACKGROUND_PRESETS, ASPECT_RATIOS, CAMERA_ANGLES, getModelDetails } from './data/presets';
import GenderToggle from './components/GenderToggle';
import DetailPanel from './components/DetailPanel';
import LoraModal from './components/LoraModal';
import ModelCalibrationWizard from './components/ModelCalibrationWizard';
import LoginPage from './components/LoginPage';
import { useAuth } from './contexts/AuthContext';
import { getModels, saveModel, deleteModelDoc, updateModelPrompt, getLocations, saveLocation, deleteLocationDoc, updateLocationPrompt } from './lib/firestoreService';
import { uploadBase64Image, compressImage, uploadImage, deleteImage } from './lib/storageService';
import './App.css';

const MSGS = ['Анализируем текстуру ткани...','Выставляем студийный свет...','Строим 3D-модель фигуры...','Натягиваем одежду с учетом физики...','Рендерим финальный кадр...'];
const initDetails = () => { const d={}; Object.keys(getModelDetails('female')).forEach(k=>{d[k]=null;}); return d; };

function App() {
  const { user, loading, signOut, isEmbedded } = useAuth();

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
  const fileInputRef = useRef(null);

  // Processing
  const [generatedImage, setGeneratedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [statusText, setStatusText] = useState('');
  const [statusType, setStatusType] = useState('');

  // Extra free-text for preset model
  const [extraModelPrompt, setExtraModelPrompt] = useState('');

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

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // Model preview (for editing)
  const [modelPreviewSrc, setModelPreviewSrc] = useState(null);
  const [isPreviewingModel, setIsPreviewingModel] = useState(false);
  const [showModelPreviewSave, setShowModelPreviewSave] = useState(false);
  const [modelPreviewName, setModelPreviewName] = useState('');

  // Load user data from Firestore (skip for guest users in embedded mode)
  useEffect(() => {
    if (!user || user.isGuest || user.isAnonymous) return;
    const loadData = async () => {
      try {
        const [models, locations] = await Promise.all([getModels(user.uid), getLocations(user.uid)]);
        setMyModels(models);
        setMyLocations(locations);
      } catch (err) { console.error('Ошибка загрузки данных:', err); }
    };
    loadData();
  }, [user]);

  // Reset model selection when gender changes
  useEffect(() => {
    const filtered = MODEL_PRESETS.filter(m => m.gender === gender);
    if (filtered.length > 0) { setSelectedModel(filtered[0]); setCustomModelPrompt(''); setSelectedSavedModelId(null); }
  }, [gender]);

  // Multi-file upload
  const handleFilesChange = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newFiles = [...imageFiles, ...files].slice(0, 9);
    setImageFiles(newFiles);
    const urls = newFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(urls);
    setGeneratedImage(null);
    setStatusText(`Загружено ${newFiles.length} вещ${newFiles.length === 1 ? 'ь' : newFiles.length < 5 ? 'и' : 'ей'}. Все будут надеты на модель.`);
    setStatusType('');
  }, [imageFiles]);

  const removeFile = (idx) => {
    const nf = imageFiles.filter((_,i) => i !== idx);
    setImageFiles(nf); setPreviewUrls(nf.map(f => URL.createObjectURL(f)));
    if (!nf.length) setStatusText('');
  };

  const blobToBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

  // Build detail string (supports arrays for multi-select fields like tattoo)
  const buildDetailString = () => {
    const parts = [];
    Object.entries(modelDetails).forEach(([k, v]) => {
      if (!v || v === 'Нет') return;
      if (Array.isArray(v)) { const filtered = v.filter(x => x !== 'Нет'); if (filtered.length) parts.push(filtered.join(' + ')); }
      else parts.push(v);
    });
    // Append extra free-text if any
    if (extraModelPrompt.trim()) parts.push(extraModelPrompt.trim());
    return parts.length ? `, ${parts.join(', ')}` : '';
  };

  const handleGenerate = async () => {
    if (!imageFiles.length) return;
    setIsProcessing(true); setGeneratedImage(null); setStatusText('');
    let msgI = 0;
    const iv = setInterval(() => { setProcessingMsg(msgI < MSGS.length ? MSGS[msgI++] : 'Финальные штрихи...'); }, 8000);
    try {
      setProcessingMsg('Подготавливаем исходники...');
      const garmentImagesBase64 = await Promise.all(imageFiles.map(f => blobToBase64(f)));

      let modelPrompt = customModelPrompt.trim() || (selectedModel.prompt + buildDetailString());
      let modelRefImages = null;
      if (selectedSavedModelId) {
        const sm = myModels.find(m => m.id === selectedSavedModelId);
        if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = sm.imageUrls || []; }
      }
      // Append model modifier if present
      if (modelModifier.trim()) modelPrompt += `. Additionally: ${modelModifier.trim()}`;

      const posePrompt = customPoseText.trim() || selectedPose.prompt;
      let bgPrompt = customBgText.trim() || selectedBg.prompt;
      let locImages = null;
      if (selectedLocId) {
        const loc = myLocations.find(l => l.id === selectedLocId);
        if (loc) {
          locImages = loc.imageUrls;
          bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
        }
      }
      // Append location modifier if present
      if (locModifier.trim()) bgPrompt += `. Additionally: ${locModifier.trim()}`;
      // Append preset bg extra text if present
      if (bgExtraText.trim() && !customBgText.trim()) bgPrompt += `, ${bgExtraText.trim()}`;

      setProcessingMsg('🚀 Отправляем в Nano Banano 2...');
      const resp = await fetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentImagesBase64, modelPreset: modelPrompt, posePreset: posePrompt,
          cameraAngle: selectedCamera.prompt, backgroundPreset: bgPrompt,
          aspectRatio: selectedRatio.id, modelReferenceImages: modelRefImages,
          locationImages: locImages, customPoseText: customPoseText.trim() || undefined,
        }),
      });
      clearInterval(iv);
      const data = await resp.json();
      if (data.success) { setGeneratedImage(`data:image/jpeg;base64,${data.imageBase64}`); setStatusText('Студийный кадр готов!'); setStatusType('success'); }
      else { setStatusText(`Ошибка: ${data.details||data.error}`); setStatusType('error'); }
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
    if (!user) return;
    setIsSaving(true);
    try {
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
    } catch (err) {
      console.error('Ошибка сохранения модели:', err);
      setStatusText('Ошибка сохранения модели');
      setStatusType('error');
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
  const getCurrentModelRefs = () => {
    if (selectedSavedModelId) {
      const sm = myModels.find(m => m.id === selectedSavedModelId);
      if (sm?.imageUrls) return sm.imageUrls;
    }
    return [];
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
      let garments = [];
      if (imageFiles.length > 0) {
        garments = await Promise.all(imageFiles.slice(0, 1).map(f => blobToBase64(f)));
      }
      const resp = await fetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentImagesBase64: garments,
          previewMode: garments.length === 0,
          modelPreset: prompt + '. Generate a fashion model portrait wearing simple casual clothing.',
          posePreset: 'standing straight, facing camera, neutral pose',
          cameraAngle: 'medium shot waist up', backgroundPreset: 'clean white studio',
          aspectRatio: '3:4', modelReferenceImages: refImgs,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setModelPreviewSrc(`data:image/jpeg;base64,${data.imageBase64}`);
        setStatusText('Превью модели готово! Сохранить как новую?'); setStatusType('success');
      } else { setStatusText(`Ошибка: ${data.error}`); setStatusType('error'); }
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
    setIsProcessing(true);
    setGeneratedImage(null);
    setStatusText('');
    let msgI = 0;
    const iv = setInterval(() => { setProcessingMsg(msgI < MSGS.length ? MSGS[msgI++] : 'Финальные штрихи...'); }, 8000);

    try {
      setProcessingMsg('Подготавливаем исходники...');
      const garmentImagesBase64 = await Promise.all(imageFiles.map(f => blobToBase64(f)));

      let modelPrompt = customModelPrompt.trim() || (selectedModel.prompt + buildDetailString());
      let modelRefImages = null;
      if (selectedSavedModelId) {
        const sm = myModels.find(m => m.id === selectedSavedModelId);
        if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = sm.imageUrls || []; }
      }

      // Determine base pose
      let posePrompt = customPoseText.trim() || selectedPose.prompt;

      // Smart modifier injection: detect if modifier describes a pose/action
      const mod = shotModifier.trim();
      const poseKeywords = /(?:поз[аеуы]|сид(?:ит|я|еть)|стоит|лежит|идёт|идет|ходит|бежит|танцу|прыга|lotus|sitting|standing|lying|walking|running|dancing|crouching|leaning|kneeling|jumping|squat)/i;
      if (poseKeywords.test(mod)) {
        // Modifier is about pose — inject into BOTH pose and model prompt
        posePrompt = `${mod}. ${posePrompt}`;
        modelPrompt += `. The model is ${mod}`;
      } else {
        // Modifier is about appearance/environment — append to model
        modelPrompt += `. Additionally, ensure: ${mod}`;
      }

      let bgPrompt = customBgText.trim() || selectedBg.prompt;
      let locImages = null;
      if (selectedLocId) {
        const loc = myLocations.find(l => l.id === selectedLocId);
        if (loc) {
          locImages = loc.imageUrls;
          bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos';
        }
      }
      if (locModifier.trim()) bgPrompt += `. Additionally: ${locModifier.trim()}`;
      if (bgExtraText.trim() && !customBgText.trim()) bgPrompt += `, ${bgExtraText.trim()}`;

      // Check if modifier mentions location/background keywords
      const bgKeywords = /(?:фон|бали|пляж|улиц|город|парк|лес|горы|интерьер|студи|background|beach|street|city|park|forest|mountain|interior|studio)/i;
      if (bgKeywords.test(mod)) {
        bgPrompt += `. ${mod}`;
      }

      setProcessingMsg('🚀 Отправляем в Nano Banano 2...');
      const resp = await fetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentImagesBase64, modelPreset: modelPrompt, posePreset: posePrompt,
          cameraAngle: selectedCamera.prompt, backgroundPreset: bgPrompt,
          aspectRatio: selectedRatio.id, modelReferenceImages: modelRefImages,
          locationImages: locImages,
        }),
      });
      clearInterval(iv);
      const data = await resp.json();
      if (data.success) {
        setGeneratedImage(`data:image/jpeg;base64,${data.imageBase64}`);
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

  // Photoshoot mode: 5 parallel generations
  const PHOTOSHOOT_ANGLES = [
    { pose: 'close-up portrait shot, looking directly at camera, confident expression', camera: 'close-up portrait' },
    { pose: 'full body shot, walking towards camera, dynamic fashion stride', camera: 'full body front' },
    { pose: 'elegant side profile, relaxed posture, one hand on hip', camera: 'side profile medium' },
    { pose: 'low angle power shot, confident stance, dramatic perspective', camera: 'low angle full body' },
    { pose: 'over-the-shoulder glance back at camera, dynamic fabric movement', camera: '3/4 back view' },
  ];

  const handlePhotoshoot = async (count = 5) => {
    if (!imageFiles.length || isPhotoshooting) return;
    setIsPhotoshooting(true);
    const angles = PHOTOSHOOT_ANGLES.slice(0, count);
    setPhotoshootImages(new Array(count).fill(null));
    setStatusText(`📸 Фотосессия запущена! Генерируем ${count} кадров...`); setStatusType('');
    try {
      const garmentImagesBase64 = await Promise.all(imageFiles.map(f => blobToBase64(f)));
      let modelPrompt = customModelPrompt.trim() || (selectedModel.prompt + buildDetailString());
      let modelRefImages = null;
      if (selectedSavedModelId) {
        const sm = myModels.find(m => m.id === selectedSavedModelId);
        if (sm) { modelPrompt = sm.prompt || modelPrompt; modelRefImages = sm.imageUrls || []; }
      }
      let bgPrompt = customBgText.trim() || selectedBg.prompt;
      let locImages = null;
      if (selectedLocId) {
        const loc = myLocations.find(l => l.id === selectedLocId);
        if (loc) { locImages = loc.imageUrls; bgPrompt = (loc.prompt || '') + ' Replicate the exact real location shown in the reference photos'; }
      }

      const promises = angles.map((angle, idx) =>
        fetch('/api/generate-image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            garmentImagesBase64, modelPreset: modelPrompt,
            posePreset: angle.pose, cameraAngle: angle.camera,
            backgroundPreset: bgPrompt, aspectRatio: selectedRatio.id,
            modelReferenceImages: modelRefImages, locationImages: locImages,
          }),
        }).then(r => r.json()).then(data => {
          if (data.success) {
            setPhotoshootImages(prev => { const n = [...prev]; n[idx] = `data:image/jpeg;base64,${data.imageBase64}`; return n; });
          }
        }).catch(() => {})
      );
      await Promise.all(promises);
      setStatusText('🎉 Фотосессия готова!'); setStatusType('success');
    } catch (err) { setStatusText(`Ошибка фотосессии: ${err.message}`); setStatusType('error'); }
    finally { setIsPhotoshooting(false); }
  };

  if (loading) return <div className="app-wrapper" style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}><div className="processing-spinner" /></div>;
  if (!user) return <LoginPage />;

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <motion.h1 className="app-logo" initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}} transition={{duration:0.6}}>Селлер-Студия</motion.h1>
        <p className="app-subtitle">ИИ-фотостудия для маркетплейсов Ozon, WB и других</p>
        <div style={{marginTop:8,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{user.displayName || user.email}</span>
          {!isEmbedded && <button onClick={signOut} style={{fontSize:'0.7rem',color:'var(--text-muted)',background:'none',border:'1px solid var(--border-subtle)',borderRadius:4,padding:'3px 8px',cursor:'pointer',fontFamily:'Inter'}}>Выйти</button>}
        </div>
      </header>

      {/* 1. МУЛЬТИЗАГРУЗКА */}
      <motion.div className="section" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}}>
        <div className="section-title"><span className="icon">📸</span> Загрузка вещей</div>
        {previewUrls.length > 0 ? (
          <div className="multi-preview-grid">
            {previewUrls.map((url, i) => (
              <div key={i} className="multi-preview-item">
                <img src={url} alt={`Вещь ${i+1}`} />
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
            <div className="upload-icon">👕</div>
            <p className="upload-text">Загрузите фото одежды — раскладки или фото на модели</p>
            <p className="upload-hint">JPG, PNG • Перетащите сюда или нажмите • Можно несколько: футболка + брюки + серьги = всё на модели</p>
          </div>
        )}
      </motion.div>

      {/* 2. КАСТИНГ-РУМ */}
      <motion.div className="section" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.15}}>
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

      {/* 3. ПОЗА */}
      <motion.div className="section" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2}}>
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

      {/* 4. РАКУРС КАМЕРЫ */}
      <motion.div className="section" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.25}}>
        <div className="section-title"><span className="icon">📷</span> Ракурс камеры</div>
        <div className="preset-grid">
          {CAMERA_ANGLES.map(c => (
            <div key={c.id} className={`preset-card ${selectedCamera.id===c.id?'active':''}`} onClick={() => setSelectedCamera(c)}>
              <span className="label">{c.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* 5. ФОН */}
      <motion.div className="section" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.3}}>
        <div className="section-title"><span className="icon">🎨</span> Фон / Локация</div>
        <div className="tabs-row">
          <button className={`tab-btn ${bgTab==='presets'?'active':''}`} onClick={()=>{setBgTab('presets');setSelectedLocId(null);}}>🎨 Пресеты</button>
          <button className={`tab-btn ${bgTab==='my_locations'?'active':''}`} onClick={()=>setBgTab('my_locations')}>📍 Мои локации{myLocations.length>0?` (${myLocations.length})`:''}</button>
        </div>
        {bgTab === 'presets' ? (
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
          </>
        )}
      </motion.div>

      {/* 6. ФОРМАТ */}
      <motion.div className="section" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.35}}>
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
      <motion.div className="generate-section" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.4}}>
        <button className="generate-btn" onClick={handleGenerate} disabled={!imageFiles.length||isProcessing}>✨ Сгенерировать студийный кадр</button>
        <div className="status-bar">{statusText && <p className={`status-text ${statusType}`}>{statusText}</p>}</div>
      </motion.div>

      {/* 8. РЕЗУЛЬТАТ */}
      <AnimatePresence>
        {generatedImage && (
          <motion.div className="section result-section" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0}} transition={{duration:0.5}}>
            <h3>Финальный Рендер</h3>
            <div className="result-image-wrap"><img src={generatedImage} alt="VTON" onClick={() => setLightboxSrc(generatedImage)} style={{cursor:'pointer'}} /></div>
            <div className="result-actions">
              <button className="download-btn" onClick={handleDownload}>⬇️ Скачать</button>
              <button className="save-model-btn" onClick={() => openCalibration('save')}>🎯 Сохранить модель (калибровка)</button>
            </div>

            {/* Iterative editing */}
            <div className="shot-modifier-block">
              <div className="shot-modifier-label">✏️ Хотите что-то изменить в кадре?</div>
              <textarea className="modifier-input" rows={2} placeholder="Например: сделать модель выше, изменить цвет волос, добавить очки, убрать тени"
                value={shotModifier} onChange={e => setShotModifier(e.target.value)} />
              <button className="modifier-regen-btn" onClick={handleRegenerate} disabled={!shotModifier.trim() || isProcessing}>
                🔄 Внести изменения
              </button>
            </div>

            {/* Photoshoot */}
            <div className="photoshoot-block">
              <div className="photoshoot-label">📸 Сделать фотосессию</div>
              <p className="photoshoot-hint">Генерация нескольких фото с разных ракурсов</p>

              {/* Calibration prompt */}
              {!selectedSavedModelId && (
                <div className="calibration-prompt">
                  <p className="calibration-prompt-text">💡 Для максимальной консистентности лица рекомендуем сначала <strong>откалибровать модель</strong></p>
                  <button className="calib-prompt-btn" onClick={() => openCalibration('photoshoot')}>
                    🎯 Откалибровать модель
                  </button>
                </div>
              )}

              <div className="photoshoot-choice">
                <button className="photoshoot-btn photoshoot-btn--3" onClick={() => handlePhotoshoot(3)} disabled={isPhotoshooting || isProcessing}>
                  {isPhotoshooting ? '⏳ Генерация...' : '📷 3 фото'}
                </button>
                <button className="photoshoot-btn photoshoot-btn--5" onClick={() => handlePhotoshoot(5)} disabled={isPhotoshooting || isProcessing}>
                  {isPhotoshooting ? '⏳ Генерация...' : '📸 5 фото'}
                </button>
              </div>
            </div>

            {/* Photoshoot gallery */}
            {photoshootImages.length > 0 && (
              <div className="photoshoot-gallery">
                <h4>📷 Галерея фотосессии</h4>
                <div className="photoshoot-grid">
                  {photoshootImages.map((img, i) => (
                    <div key={i} className="photoshoot-item">
                      {img ? (
                        <>
                          <img src={img} alt={`Кадр ${i+1}`} onClick={() => setLightboxSrc(img)} style={{cursor:'pointer'}} />
                          <button className="download-mini-btn" onClick={() => {
                            const a = document.createElement('a'); a.href = img; a.download = `SellerStudio_${i+1}_${Date.now()}.jpg`; a.click();
                          }}>⬇️</button>
                        </>
                      ) : (
                        <div className="photoshoot-placeholder"><div className="processing-spinner" style={{width:24,height:24}} /></div>
                      )}
                    </div>
                  ))}
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
            <div className="processing-spinner" /><p className="processing-status">{processingMsg}</p><p className="processing-hint">Обычно 30с — 2 мин</p>
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

      {/* LIGHTBOX */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div className="lightbox-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setLightboxSrc(null)}>
            <button className="lightbox-close" onClick={() => setLightboxSrc(null)}>✕</button>
            <img src={lightboxSrc} alt="Просмотр" className="lightbox-img" onClick={e => e.stopPropagation()} />
            <button className="lightbox-download" onClick={e => { e.stopPropagation(); const a = document.createElement('a'); a.href = lightboxSrc; a.download = `SellerStudio_${Date.now()}.jpg`; a.click(); }}>⬇️ Скачать</button>
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
