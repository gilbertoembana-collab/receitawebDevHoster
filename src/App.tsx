import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store';
import { getCustomTheme } from './theme';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';

// Layout
import AdminLayout from './layouts/AdminLayout';

// Pages
import Dashboard from './pages/Dashboard';
import Municipios from './pages/Municipios';
import Mercados from './pages/Mercados';
import Agentes from './pages/Agentes';
import Contribuintes from './pages/Contribuintes';
import CategoriasContribuintes from './pages/CategoriasContribuintes';
import TiposReceita from './pages/TiposReceita';
import Pagamentos from './pages/Pagamentos';
import Financeiro from './pages/Financeiro';
import Relatorios from './pages/Relatorios';
import Auditoria from './pages/Auditoria';
import Configuracoes from './pages/Configuracoes';
import Perfil from './pages/Perfil';
import Usuarios from './pages/Usuarios';
import Login from './pages/Login';

const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVITY_BROADCAST_INTERVAL_MS = 5 * 1000;
const SESSION_CHECK_INTERVAL_MS = 15 * 1000;
const SESSION_CHANNEL_NAME = 'receita360-session';

export default function App() {
  const { darkMode, currentUser, authInitialized, setCurrentUser } = useAppStore();
  const theme = React.useMemo(() => getCustomTheme(darkMode), [darkMode]);

  React.useEffect(() => {
    if (!currentUser) return;

    let lastActivityAt = Date.now();
    let lastActivityBroadcastAt = 0;
    let expired = false;
    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(SESSION_CHANNEL_NAME)
      : null;

    const expireSession = () => {
      if (expired) return;
      expired = true;
      channel?.postMessage({ type: 'logout', reason: 'idle' });
      setCurrentUser(null);
    };

    const handleActivity = () => {
      if (expired) return;
      const now = Date.now();
      lastActivityAt = now;
      if (now - lastActivityBroadcastAt >= ACTIVITY_BROADCAST_INTERVAL_MS) {
        lastActivityBroadcastAt = now;
        channel?.postMessage({ type: 'activity', timestamp: now });
      }
    };

    const handleChannelMessage = (event: MessageEvent<{ type?: string; timestamp?: number }>) => {
      if (event.data?.type === 'logout') {
        expired = true;
        setCurrentUser(null);
        return;
      }
      if (event.data?.type === 'activity' && Number.isFinite(event.data.timestamp)) {
        const timestamp = event.data.timestamp as number;
        if (timestamp <= Date.now() + 1000) lastActivityAt = Math.max(lastActivityAt, timestamp);
      }
    };

    const checkSessionIdle = () => {
      if (Date.now() - lastActivityAt >= SESSION_IDLE_TIMEOUT_MS) expireSession();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'pointerdown',
      'pointermove',
      'keydown',
      'touchstart',
      'wheel',
      'scroll',
    ];

    activityEvents.forEach(eventName => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', checkSessionIdle);
    channel?.addEventListener('message', handleChannelMessage);
    const checkInterval = window.setInterval(checkSessionIdle, SESSION_CHECK_INTERVAL_MS);

    return () => {
      activityEvents.forEach(eventName => {
        window.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener('visibilitychange', checkSessionIdle);
      window.clearInterval(checkInterval);
      channel?.close();
    };
  }, [currentUser?.id, setCurrentUser]);

  if (!authInitialized) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }} aria-label="A verificar sessão">
          <CircularProgress />
        </Box>
      </ThemeProvider>
    );
  }

  if (!currentUser) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </HashRouter>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HashRouter>
        <Routes>
          {/* Main Panel Routes under AdminLayout */}
          <Route 
            path="/" 
            element={
              <AdminLayout>
                <Dashboard />
              </AdminLayout>
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              <AdminLayout>
                <Dashboard />
              </AdminLayout>
            } 
          />
          <Route 
            path="/municipios" 
            element={
              <AdminLayout>
                <Municipios />
              </AdminLayout>
            } 
          />
          <Route 
            path="/mercados" 
            element={
              <AdminLayout>
                <Mercados />
              </AdminLayout>
            } 
          />
          <Route 
            path="/agentes" 
            element={
              <AdminLayout>
                <Agentes />
              </AdminLayout>
            } 
          />
          <Route 
            path="/contribuintes" 
            element={
              <AdminLayout>
                <Contribuintes />
              </AdminLayout>
            } 
          />
          <Route
            path="/categorias-contribuintes"
            element={
              <AdminLayout>
                <CategoriasContribuintes />
              </AdminLayout>
            }
          />
          <Route 
            path="/tipos-receita" 
            element={
              <AdminLayout>
                <TiposReceita />
              </AdminLayout>
            } 
          />
          <Route 
            path="/pagamentos" 
            element={
              <AdminLayout>
                <Pagamentos />
              </AdminLayout>
            } 
          />
          <Route 
            path="/financeiro" 
            element={
              <AdminLayout>
                <Financeiro />
              </AdminLayout>
            } 
          />
          <Route 
            path="/relatorios" 
            element={
              <AdminLayout>
                <Relatorios />
              </AdminLayout>
            } 
          />
          <Route 
            path="/auditoria" 
            element={
              <AdminLayout>
                <Auditoria />
              </AdminLayout>
            } 
          />
          <Route 
            path="/configuracoes" 
            element={
              <AdminLayout>
                <Configuracoes />
              </AdminLayout>
            } 
          />
          <Route 
            path="/usuarios" 
            element={
              <AdminLayout>
                <Usuarios />
              </AdminLayout>
            } 
          />
          <Route 
            path="/perfil" 
            element={
              <AdminLayout>
                <Perfil />
              </AdminLayout>
            } 
          />

          {/* Fallback wildcard Route */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}
