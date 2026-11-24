import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './state/AppContext';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Trades from './pages/Trades';
import TradeDetail from './pages/TradeDetail';
import TradeForm from './pages/TradeForm';
import Strategies from './pages/Strategies';
import Reviews from './pages/Reviews';
import Compare from './pages/Compare';
import SettingsPage from './pages/Settings';
import QuickTrade from './pages/QuickTrade';

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="trades" element={<Trades />} />
            <Route path="trades/:id" element={<TradeDetail />} />
            <Route path="add" element={<TradeForm />} />
            <Route path="edit/:id" element={<TradeForm />} />
            <Route path="quick" element={<QuickTrade />} />
            <Route path="strategies" element={<Strategies />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="compare" element={<Compare />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
