import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist'; // self-hosted: no request to any font service
import { App } from './App';

// Spotify does not accept "localhost" as a redirect address, only 127.0.0.1: continue there (same port, same page).
if (location.hostname === 'localhost') location.replace(location.href.replace('//localhost', '//127.0.0.1'));

// Installable and openable offline (the file is app/public/sw.js). Not in development, and not inside the Mac app.
if ('serviceWorker' in navigator && import.meta.env.PROD && !('__TAURI_INTERNALS__' in window)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* the app works without it */ }); });
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
