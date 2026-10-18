function saveAndroidBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const INSTALLERS = {
  patient: { endpoint: '/api/patient-installer', filename: 'MediCluster-Patient.apk' },
  crew: { endpoint: '/api/crew-installer', filename: 'MediCluster-Crew.apk' },
};

export function createAndroidDownloader(appId, { fetchImpl = globalThis.fetch, saveBlob = saveAndroidBlob } = {}) {
  if (!Object.hasOwn(INSTALLERS, appId)) throw new Error('Unsupported Android app.');
  const installer = INSTALLERS[appId];
  let pending = false;
  return async (release) => {
    if (pending) return false;
    pending = true;
    try {
      const response = await fetchImpl(installer.endpoint, {
        method: 'POST', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/vnd.android.package-archive')) {
        throw new Error('Download not ready. Wait a moment, then try again.');
      }
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (bytes.byteLength !== release.sizeBytes || sha256 !== release.sha256) {
        throw new Error('Download verification failed. Reload this page and try again.');
      }
      saveBlob(new Blob([bytes], { type: 'application/vnd.android.package-archive' }), installer.filename);
      return true;
    } finally {
      pending = false;
    }
  };
}

export function createPatientDownloader(options) {
  return createAndroidDownloader('patient', options);
}
