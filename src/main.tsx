import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource/uncial-antiqua/latin-400.css';
import '@fontsource/spectral/latin-400.css';
import '@fontsource/spectral/latin-600.css';
import '@fontsource/spectral/latin-700.css';
import '@fontsource/instrument-sans/latin-400.css';
import '@fontsource/instrument-sans/latin-500.css';
import '@fontsource/instrument-sans/latin-600.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The web app works offline through a service worker; the desktop app has its files on disk already.
const desktop = 'pianosrsDesktop' in window;
if ('serviceWorker' in navigator && import.meta.env.PROD && !desktop) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
