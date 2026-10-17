import React, { useRef, useState } from 'react';
import { createPatientDownloader } from './patientDownload';

export default function PatientDownloadButton({ release, className, children, ...props }) {
  const downloader = useRef(null);
  if (!downloader.current) downloader.current = createPatientDownloader();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await downloader.current(release);
    } catch (cause) {
      setError(cause.message?.startsWith('Download ')
        ? cause.message : 'Download failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return <>
    <button {...props} type="button" className={className} disabled={busy} aria-busy={busy} onClick={download}>
      {busy ? 'Preparing download…' : children}
    </button>
    {error && <span role="alert">{error}</span>}
  </>;
}
