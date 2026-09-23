import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import 'leaflet/dist/leaflet.css';
import App from './App.tsx';
import './index.css';

// Automatically register PWA service worker with auto-update
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('Nová verze Horského Deníku je připravena.');
  },
  onOfflineReady() {
    console.log('Horský Deník je připraven pro offline použití v terénu.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
