function savePatientBlob(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'MediCluster-Patient.apk';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function createPatientDownloader({ fetchImpl = globalThis.fetch, saveBlob = savePatientBlob } = {}) {
  let pending = false;
  return async (release) => {
    if (pending) return false;
    pending = true;
    try {
      const response = await fetchImpl('/api/patient-installer', {
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
      saveBlob(new Blob([bytes], { type: 'application/vnd.android.package-archive' }));
      return true;
    } finally {
      pending = false;
    }
  };
}
