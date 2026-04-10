import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '@kb-labs/studio-ui-kit/dist/index.css';
import { registerIconRenderer } from '@kb-labs/studio-ui-kit';
import { renderIcon } from './components/ui/icons';
import './index.css';

registerIconRenderer(renderIcon);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
