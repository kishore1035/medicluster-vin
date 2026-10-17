import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import { RequireAuth, useAuth } from "./auth/AuthContext";
import { isPatientAndroid } from "./patient-app/patientPlatform";

const DownloadPage = lazy(() => import("./pages/DownloadPage"));
const PatientApp = lazy(() => import("./patient-app/PatientApp"));
const ClinicalWorkspace = lazy(() => import("./ClinicalWorkspace"));

export default function App() {
  return <Suspense fallback={<div className="min-h-screen bg-[#ffffff]" aria-label="Loading" aria-busy="true" />}><AppContent /></Suspense>;
}

function AppContent() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  if (isPatientAndroid() && pathname !== "/app" && !pathname.startsWith("/app/")) {
    return <Navigate to="/app" replace />;
  }

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return <Routes><Route path="/app/*" element={<PatientApp />} /></Routes>;
  }

  if (pathname === "/download" || (pathname === "/" && user === null)) return <DownloadPage />;
  if (pathname === "/login") return <LoginPage />;
  if (pathname === "/onboarding") {
    return <RequireAuth allowUnonboarded><OnboardingPage /></RequireAuth>;
  }

  return <RequireAuth><ClinicalWorkspace /></RequireAuth>;
}
