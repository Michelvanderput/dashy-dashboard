import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist'; // self-hosted: no request to any font service
import { App } from './App';

// Spotify does not accept "localhost" as a redirect address, only 127.0.0.1: continue there (same port, same page).
if (location.hostname === 'localhost') location.replace(location.href.replace('//localhost', '//127.0.0.1'));

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
