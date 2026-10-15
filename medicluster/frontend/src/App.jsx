import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell";
import HomePage from "./pages/HomePage";
import AlertsPage from "./pages/AlertsPage";
import ReportsPage from "./pages/ReportsPage";
import DashboardPage from "./pages/DashboardPage";
import ResultsPage from "./pages/ResultsPage";
import ImagingPage from "./pages/ImagingPage";
import PredictPage from "./pages/PredictPage";
import PatientPage from "./pages/PatientPage";
import RemindersPage from "./pages/RemindersPage";
import AskAIPage from "./pages/AskAIPage";
import MLToolsPage from "./pages/MLToolsPage";
import NearbyHospitalsPage from "./pages/NearbyHospitalsPage";
import ClinicalAIPage from "./pages/ClinicalAIPage";
import PatientApp from "./patient-app/PatientApp";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import { RequireAuth } from "./auth/AuthContext";

export default function App() {
  const { pathname } = useLocation();

  // The patient app is a self-contained phone UI with its own navigation.
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return (
      <Routes>
        <Route path="/app/*" element={<PatientApp />} />
      </Routes>
    );
  }

  if (pathname === "/login") return <LoginPage />;
  if (pathname === "/onboarding") {
    return <RequireAuth allowUnonboarded><OnboardingPage /></RequireAuth>;
  }

  return (
    <RequireAuth>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/imaging" element={<ImagingPage />} />
          <Route path="/results/:id" element={<ResultsPage />} />
          <Route path="/predict" element={<PredictPage />} />
          <Route path="/patient" element={<PatientPage />} />
          <Route path="/patient/:patientId" element={<PatientPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/reminders/:patientId" element={<RemindersPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/ask-ai" element={<AskAIPage />} />
          <Route path="/ml-tools" element={<MLToolsPage />} />
          <Route path="/hospitals" element={<NearbyHospitalsPage />} />
          <Route path="/clinical-ai" element={<ClinicalAIPage />} />
        </Routes>
      </AppShell>
    </RequireAuth>
  );
}
