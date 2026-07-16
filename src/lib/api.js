// src/lib/api.js
// Замена Auth SDK — все операции через наш PostgreSQL API
// JWT токен хранится в localStorage, авторизация через Bearer header

const API_BASE = '';

// ═══════════════════════════════════════
//  TOKEN MANAGEMENT
// ═══════════════════════════════════════

/** Получить JWT токен из localStorage */
export const getToken = () => localStorage.getItem('vton_token');

/** Сохранить JWT токен в localStorage */
export const setToken = (token) => localStorage.setItem('vton_token', token);

/** Удалить JWT токен из localStorage */
export const removeToken = () => localStorage.removeItem('vton_token');

// ═══════════════════════════════════════
//  USER DATA MANAGEMENT
// ═══════════════════════════════════════

/** Получить сохранённого юзера из localStorage */
export const getSavedUser = () => {
  try {
    const raw = localStorage.getItem('vton_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Сохранить данные юзера в localStorage */
export const setSavedUser = (user) => localStorage.setItem('vton_user', JSON.stringify(user));

/** Удалить данные юзера из localStorage */
export const removeSavedUser = () => localStorage.removeItem('vton_user');

// ═══════════════════════════════════════
//  AUTHENTICATED FETCH WRAPPER
// ═══════════════════════════════════════

/**
 * Обёртка над fetch() с автоматической авторизацией через JWT.
 * При 401 — автоматический logout и перезагрузка страницы.
 *
 * @param {string} path — относительный путь API (например '/api/user-data')
 * @param {RequestInit} options — стандартные опции fetch
 * @returns {Promise<Response>}
 */
export const apiFetch = async (path, options = {}) => {
  const token = getToken();

  // Не перезаписываем Content-Type для FormData (браузер сам ставит boundary)
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Автоматический logout при истёкшем/невалидном токене
  if (res.status === 401) {
    removeToken();
    removeSavedUser();
    window.location.reload();
  }

  return res;
};
