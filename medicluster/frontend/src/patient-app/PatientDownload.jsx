import React, { useEffect, useState } from "react";
import { isPatientAndroid, patientApkUrl, PATIENT_RELEASE_PATH, readPatientRelease } from "./patientPlatform";

/** Installer is available only after CI has published a signed APK and its metadata. */
export default function PatientDownload() {
  const [release, setRelease] = useState(null);
  const native = isPatientAndroid();
  useEffect(() => {
    if (native) return undefined;
    const controller = new AbortController();
    fetch(PATIENT_RELEASE_PATH, { signal: controller.signal, cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (!controller.signal.aborted) setRelease(readPatientRelease(data)); })
      .catch(() => {}); // An unpublished or offline installer never produces a broken download button.
    return () => controller.abort();
  }, [native]);

  if (native || !release) return null;
  const size = release.sizeBytes < 1024 * 1024
    ? `${Math.ceil(release.sizeBytes / 1024)} KB`
    : `${(release.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  return (
    <section aria-label="Patient Android app" className="border border-line rounded p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-base font-medium">MediCluster Patient for Android</h2>
        <p className="text-[13px] text-slate-600 mt-1">Your medicines, readings and CliniQ, in one patient app.</p>
      </div>
      <a href={patientApkUrl(release)} download="MediCluster-Patient.apk"
        className="h-11 rounded border border-ink grid place-items-center text-[14px] font-medium">
        Download Android app
      </a>
      <p className="text-xs text-slate-600">Android 8.0+ · Version {release.versionName} · {size}</p>
      <p className="text-xs text-slate-600">Open the downloaded APK to install. If Android asks, allow installs from this browser. Internet required.</p>
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Verify download</summary>
        <p className="mt-2 break-all font-mono">SHA-256: {release.sha256}</p>
      </details>
    </section>
  );
}
