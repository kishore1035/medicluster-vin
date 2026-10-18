import { createAndroidDownloader } from '../patient-app/patientDownload.js';

export function createCrewDownloader(options) {
  return createAndroidDownloader('crew', options);
}
