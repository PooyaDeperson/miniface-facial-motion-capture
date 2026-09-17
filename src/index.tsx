/*
 * Copyright (c) 2025 Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson
 * Licensed under the MIT License with Attribution.
 * 
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, and distribute this software, provided that the following credit
 * is included in any derivative or distributed version:
 * "Created by Pooya Moradi M. poamrd@gmail.com https://github.com/PooyaDeperson"
 */
// import './css/foundation.css';
import './index.css';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CookiesPage from './pages/CookiesPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import MarketingHome from './pages/MarketingHome';
import { supabase } from './supabaseClient';
import { restoreAuthReturnUrl } from './authRedirect';

// Keep the motion-capture app lazy so the marketing page does not initialize auth or camera code.
const App = lazy(() => import('./App'));

function renderApp() {
  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  );

  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MarketingHome />} />
          <Route path="/animate" element={<Suspense fallback={null}><App /></Suspense>} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
}

// Supabase may return OAuth callbacks to `/` before the saved page is restored.
// Wait for it to consume the callback first, then render the router. This keeps
// the marketing page from painting for a frame during every auth redirect.
if (supabase) {
  supabase.auth.getSession().then(() => {
    restoreAuthReturnUrl();
    renderApp();
  });
} else {
  renderApp();
}
