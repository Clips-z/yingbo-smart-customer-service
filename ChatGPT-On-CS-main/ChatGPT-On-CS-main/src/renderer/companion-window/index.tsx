import React from 'react';
import { createRoot } from 'react-dom/client';
import CompanionApp from './App';

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <CompanionApp />
  </React.StrictMode>,
);
