const express = require('express');
const path = require('path');

module.exports = function patientInstallerRoutes(publicDir) {
  const router = express.Router();
  // A cold-start interstitial can keep retrying a navigation after a file saves.
  // Legacy installer links must finish with a normal page instead of a file.
  router.get('/downloads/medicluster-patient.apk', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.redirect(303, '/download');
  });
  // Fetch this only after a deliberate click; never navigate the tab here.
  router.post('/api/patient-installer', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/vnd.android.package-archive');
    res.sendFile(path.join(publicDir, 'downloads/medicluster-patient.apk'), (error) => {
      if (error) next(error);
    });
  });
  return router;
};
