import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── SERVİS ÇALIŞANI ─────────────────────────────────────────────
// PWA kurulabilirliği için gerekiyor; Play Store'daki TWA kabuğu bunu
// şart koşuyor. Ne yaptığı ve neden bu kadar dar tutulduğu public/sw.js
// başındaki notta.
//
// Yalnızca ÜRETİMDE kaydediliyor: geliştirme sunucusunda servis
// çalışanı, Vite'ın sıcak modül değişimiyle çakışıp "değişikliğim neden
// görünmüyor" türünden saatler yiyen bir soruna dönüşüyor.
//
// Kayıt başarısız olursa sessizce geçiliyor — uygulamanın çalışması
// buna bağlı değil, önbellek bir iyileştirme.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
