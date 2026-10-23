import React from 'react';
import ReactDOM from 'react-dom/client';
import 'material/styles/base';
import 'material/styles/typography';
import './theme/theme.css';
import { initializeTheme } from './theme/themeMode';
import App from './App';

initializeTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
