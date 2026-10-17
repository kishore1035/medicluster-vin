import React from "react";
import { Routes, Route } from "react-router-dom";
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

export default function ClinicalWorkspace() {
  return (
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
  );
}
