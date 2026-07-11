import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { IS_STATIC } from './api';
import App from './App';
import './index.css';

// GitHub Pages can't rewrite deep links to index.html, so the static build
// uses hash routing; the local app keeps clean URLs.
const Router = IS_STATIC ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
