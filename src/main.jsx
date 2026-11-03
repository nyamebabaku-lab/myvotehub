import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { toast } from './components/ui';

window.addEventListener('myvotehub-storage-full', () => toast.error('Device storage is full', 'Clear old data in Settings → Demo data'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
