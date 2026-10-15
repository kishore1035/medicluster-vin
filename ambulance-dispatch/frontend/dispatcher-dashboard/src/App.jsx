import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DriverInterface from './pages/DriverInterface';
import InsightsPage from './pages/InsightsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import MobileFleetPage from './pages/MobileFleetPage';
import CallerVoicePortalPage from './pages/CallerVoicePortalPage';
import { T, SANS } from './theme/tokens';

/* ── MediCluster theme ── */
const theme = createTheme({
  palette: {
    mode: 'light',
    primary:    { main: T.tx },
    secondary:  { main: T.ac },
    success:    { main: T.g },
    warning:    { main: T.y },
    error:      { main: T.r },
    info:       { main: T.ac },
    background: { default: T.bg, paper: T.sf },
    text:       { primary: T.tx, secondary: T.tx2 },
    divider:    T.bd,
  },
  shape: { borderRadius: 3 },
  typography: { fontFamily: SANS },
  components: {
    MuiButton:  { styleOverrides: { root: { textTransform: 'none', borderRadius: 3, fontWeight: 500, boxShadow: 'none' } } },
    MuiPaper:   { styleOverrides: { root: { borderRadius: 3, backgroundImage: 'none' } } },
    MuiDrawer:  { styleOverrides: { paper: { backgroundImage: 'none' } } },
    MuiTab:     { styleOverrides: { root: { textTransform: 'none', minHeight: 36, fontWeight: 500 } } },
    MuiChip:    { styleOverrides: { root: { fontWeight: 500, borderRadius: 2 } } },
  },
});

function DashboardWithAuth() {
  const { user, profile, signOut } = useAuth();
  const currentUser = {
    id: user?.id || 'dispatcher-1',
    name: profile?.full_name || 'CAD Operator',
    role: profile?.role || 'DISPATCHER',
    email: user?.email || 'dispatcher@medicluster.com',
  };

  return <DashboardPage user={currentUser} onLogout={signOut} />;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <HashRouter>
          <Routes>
            {/* Public Auth Route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Driver View */}
            <Route
              path="/driver"
              element={
                <ProtectedRoute allowedRoles={['DRIVER', 'DISPATCHER', 'ADMIN']}>
                  <DriverInterface />
                </ProtectedRoute>
              }
            />

            {/* Public Utility Routes */}
            <Route path="/caller" element={<CallerVoicePortalPage />} />

            {/* Protected Dispatcher & Admin Routes */}
            <Route
              path="/insights"
              element={
                <ProtectedRoute allowedRoles={['DISPATCHER', 'ADMIN']}>
                  <InsightsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute allowedRoles={['DISPATCHER', 'ADMIN']}>
                  <AnalyticsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mobile"
              element={
                <ProtectedRoute allowedRoles={['DISPATCHER', 'ADMIN']}>
                  <MobileFleetPage />
                </ProtectedRoute>
              }
            />

            {/* Default Protected Command Center */}
            <Route
              path="/"
              element={
                <ProtectedRoute allowedRoles={['DISPATCHER', 'ADMIN']}>
                  <DashboardWithAuth />
                </ProtectedRoute>
              }
            />

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
