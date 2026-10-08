import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { enforceArabicNumeralsGlobally } from './utils/numberFormat';
import { registerSW } from 'virtual:pwa-register';
import './index.css';

// Register Service Worker for full Offline PWA capability and caching
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('New content available, auto-updating...');
    },
    onOfflineReady() {
      console.log('App ready to work offline.');
    },
  });
}

// تفعيل الحظر الصارم للأرقام الهندية واعتماد الأرقام العربية 0-9 بغض النظر عن الجهاز أو لغة المتصفح
enforceArabicNumeralsGlobally();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="حدث خطأ في واجهة البرنامج">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
