import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layouts/AppShell.js';
import { MarketingLayout } from './layouts/MarketingLayout.js';
import LandingPage from './pages/LandingPage.js';
import MarketsPage from './pages/MarketsPage.js';
import PortfolioPage from './pages/PortfolioPage.js';
import DocsPage from './pages/DocsPage.js';
import TradePage from './pages/TradePage.js';
import { Toasts } from './components/Toasts.js';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route element={<MarketingLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="markets" element={<MarketsPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="docs" element={<DocsPage />} />
          </Route>
          <Route path="trade" element={<TradePage />} />
          <Route path="trade/:marketId" element={<TradePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </BrowserRouter>
  );
}
