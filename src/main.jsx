import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import AdminApp from './admin/AdminApp'
import OfferPage from './pages/OfferPage.jsx'
import './index.css'
import App from './App.jsx'

// Роутинг: если URL содержит ?mode=admin или #/admin — рендерим админку
const isAdmin = new URLSearchParams(window.location.search).get('mode') === 'admin'
  || window.location.hash === '#/admin'
  || window.location.hash.startsWith('#/admin/');
const isOffer = window.location.pathname === '/offer' || window.location.pathname === '/offer/';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isOffer ? (
      <OfferPage />
    ) : isAdmin ? (
      <AdminApp />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
