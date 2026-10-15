import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import * as apiClient from "../api/apiClient";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  // undefined = still checking the stored token, null = signed out.
  const [user, setUser] = useState(() => (apiClient.getToken() ? undefined : null));

  useEffect(() => {
    if (user !== undefined) return;
    apiClient.getMe().then(setUser).catch(() => {
      apiClient.setToken(null);
      setUser(null);
    });
  }, [user]);

  useEffect(() => {
    const onSignedOut = () => setUser(null);
    window.addEventListener("medicluster:signed-out", onSignedOut);
    return () => window.removeEventListener("medicluster:signed-out", onSignedOut);
  }, []);

  const startSession = useCallback(({ token, user: u }) => {
    apiClient.setToken(token);
    setUser(u);
    return u;
  }, []);

  const value = useMemo(() => ({
    user,
    login: async (email, password) => startSession(await apiClient.login(email, password)),
    register: async (name, email, password) => startSession(await apiClient.register(name, email, password)),
    updateProfile: async (patch) => {
      const u = await apiClient.updateMe(patch);
      setUser(u);
      return u;
    },
    logout: () => {
      apiClient.setToken(null);
      setUser(null);
    },
  }), [user, startSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Signed-out visitors go to /login; signed-in clinicians who haven't onboarded go to /onboarding.
export function RequireAuth({ children, allowUnonboarded = false }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) {
    return <div className="min-h-screen bg-paper" aria-busy="true" />;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user.onboarded && !allowUnonboarded) return <Navigate to="/onboarding" replace />;
  return children;
}
