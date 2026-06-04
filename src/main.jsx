import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import AdminApp from './admin/AdminApp'
import './index.css'
import App from './App.jsx'

// Роутинг: если URL содержит ?mode=admin или #/admin — рендерим админку
const isAdmin = new URLSearchParams(window.location.search).get('mode') === 'admin'
  || window.location.hash === '#/admin'
  || window.location.hash.startsWith('#/admin/');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdmin ? (
      <AdminApp />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
