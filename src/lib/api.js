// src/lib/api.js
// Р—Р°РјРµРЅР° Auth SDK вЂ” РІСЃРµ РѕРїРµСЂР°С†РёРё С‡РµСЂРµР· РЅР°С€ PostgreSQL API
// JWT С‚РѕРєРµРЅ С…СЂР°РЅРёС‚СЃСЏ РІ localStorage, Р°РІС‚РѕСЂРёР·Р°С†РёСЏ С‡РµСЂРµР· Bearer header

const API_BASE = '';

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  TOKEN MANAGEMENT
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

/** РџРѕР»СѓС‡РёС‚СЊ JWT С‚РѕРєРµРЅ РёР· localStorage */
export const getToken = () => localStorage.getItem('vton_token');

/** РЎРѕС…СЂР°РЅРёС‚СЊ JWT С‚РѕРєРµРЅ РІ localStorage */
export const setToken = (token) => localStorage.setItem('vton_token', token);

/** РЈРґР°Р»РёС‚СЊ JWT С‚РѕРєРµРЅ РёР· localStorage */
export const removeToken = () => localStorage.removeItem('vton_token');

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  USER DATA MANAGEMENT
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

/** РџРѕР»СѓС‡РёС‚СЊ СЃРѕС…СЂР°РЅС‘РЅРЅРѕРіРѕ СЋР·РµСЂР° РёР· localStorage */
export const getSavedUser = () => {
  try {
    const raw = localStorage.getItem('vton_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** РЎРѕС…СЂР°РЅРёС‚СЊ РґР°РЅРЅС‹Рµ СЋР·РµСЂР° РІ localStorage */
export const setSavedUser = (user) => localStorage.setItem('vton_user', JSON.stringify(user));

/** РЈРґР°Р»РёС‚СЊ РґР°РЅРЅС‹Рµ СЋР·РµСЂР° РёР· localStorage */
export const removeSavedUser = () => localStorage.removeItem('vton_user');

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  AUTHENTICATED FETCH WRAPPER
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

/**
 * РћР±С‘СЂС‚РєР° РЅР°Рґ fetch() СЃ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРѕР№ Р°РІС‚РѕСЂРёР·Р°С†РёРµР№ С‡РµСЂРµР· JWT.
 * РџСЂРё 401 вЂ” Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРёР№ logout Рё РїРµСЂРµР·Р°РіСЂСѓР·РєР° СЃС‚СЂР°РЅРёС†С‹.
 *
 * @param {string} path вЂ” РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅС‹Р№ РїСѓС‚СЊ API (РЅР°РїСЂРёРјРµСЂ '/api/user-data')
 * @param {RequestInit} options вЂ” СЃС‚Р°РЅРґР°СЂС‚РЅС‹Рµ РѕРїС†РёРё fetch
 * @returns {Promise<Response>}
 */
export const apiFetch = async (path, options = {}) => {
  const token = getToken();

  // РќРµ РїРµСЂРµР·Р°РїРёСЃС‹РІР°РµРј Content-Type РґР»СЏ FormData (Р±СЂР°СѓР·РµСЂ СЃР°Рј СЃС‚Р°РІРёС‚ boundary)
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРёР№ logout РїСЂРё РёСЃС‚С‘РєС€РµРј/РЅРµРІР°Р»РёРґРЅРѕРј С‚РѕРєРµРЅРµ
  if (res.status === 401) {
    removeToken();
    removeSavedUser();
    window.location.reload();
  }

  return res;
};
