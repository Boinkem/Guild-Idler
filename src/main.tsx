import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SettingsProvider } from './ui/useSettings';
import { installAmbientPause } from './ui/ambient';
import './styles/app.css';
import './styles/hero-card.css';

// Patch 0466 -- pause ambient motion while the window is hidden.
installAmbientPause();

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing from index.html.');

createRoot(container).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>,
);
