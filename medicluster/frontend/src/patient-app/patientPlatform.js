/** Presentation hint only; server-side patient sessions still enforce data access. */
export function isPatientAndroid(userAgent = globalThis.navigator?.userAgent ?? "") {
  return /(?:^|\s)MediClusterPatient\/\d+(?:\.\d+)*(?:\s|$)/.test(userAgent);
}

export const PATIENT_APK_PATH = "/downloads/medicluster-patient.apk";
export const PATIENT_RELEASE_PATH = "/downloads/patient-app.json";
export const patientApkUrl = (release) => `${PATIENT_APK_PATH}?sha256=${release.sha256}`;

export function readPatientRelease(value) {
  if (!value || typeof value.versionName !== "string" || !/^\d+\.\d+\.\d+$/.test(value.versionName)
    || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes <= 0
    || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) return null;
  return { versionName: value.versionName, sizeBytes: value.sizeBytes, sha256: value.sha256 };
}
