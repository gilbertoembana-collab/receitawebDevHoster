import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store';
import { getCustomTheme } from './theme';
import { ThemeProvider, CssBaseline } from '@mui/material';

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

export default function App() {
  const { darkMode, currentUser } = useAppStore();
  const theme = React.useMemo(() => getCustomTheme(darkMode), [darkMode]);

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
