import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/base.css';
import './styles/layout.css';
import './styles/codex.css';
import './styles/conclave.css';
import './styles/effects.css';
import './styles/tools.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
