const express = require('express');
const path = require('path');

// Only these published apps may be requested; no user input becomes a file path.
const INSTALLERS = [
  { id: 'patient', filename: 'medicluster-patient.apk', portal: '/download' },
  { id: 'crew', filename: 'medicluster-crew.apk', portal: '/download#crew' },
];

module.exports = function patientInstallerRoutes(publicDir) {
  const router = express.Router();
  for (const { id, filename, portal } of INSTALLERS) {
    // A cold-start interstitial can keep retrying a navigation after a file saves.
    // Legacy installer links must finish with a normal page instead of a file.
    router.get(`/downloads/${filename}`, (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.redirect(303, portal);
    });
    // Fetch this only after a deliberate click; never navigate the tab here.
    router.post(`/api/${id}-installer`, (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      res.type('application/vnd.android.package-archive');
      res.sendFile(path.join(publicDir, 'downloads', filename), (error) => {
        if (error) next(error);
      });
    });
  }
  return router;
};
