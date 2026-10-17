import { useEffect, useRef, useState } from "react";
import {
  Ambulance,
  ArrowUpRight,
  Check,
  Download,
  HeartPulse,
  RadioTower,
  Stethoscope,
} from "lucide-react";
import { createPatientDownloader } from "@/patient-app/patientDownload";
import type { PatientRelease, ProductApp } from "./appTypes";

const ICONS = {
  medicluster: Stethoscope,
  patient: HeartPulse,
  dispatch: RadioTower,
  crew: Ambulance,
};

export default function ApplicationSelector({
  apps,
  release,
  onInstall,
}: {
  apps: ProductApp[];
  release: PatientRelease | null;
  onInstall: () => void;
}) {
  const [selected, setSelected] = useState(apps[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const downloader = useRef<ReturnType<typeof createPatientDownloader> | null>(
    null,
  );
  if (!downloader.current) downloader.current = createPatientDownloader();
  const current = apps.find((app) => app.id === selected) ?? apps[0];

  useEffect(() => {
    const selectAnchor = (hash: string) => {
      const id = hash.slice(1);
      if (apps.some((app) => app.id === id)) {
        setSelected(id);
        setError("");
      }
    };
    const onHash = () => selectAnchor(location.hash);
    const onLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href^="#"]');
      if (anchor) selectAnchor(anchor.getAttribute("href") ?? "");
    };
    onHash();
    addEventListener("hashchange", onHash);
    document.addEventListener("click", onLink);
    return () => {
      removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onLink);
    };
  }, [apps]);

  if (!current) return null;
  const select = (id: string, focus = false) => {
    setSelected(id);
    setError("");
    if (focus) document.getElementById(id)?.focus();
  };
  const download = async () => {
    if (!release || busy) return;
    setBusy(true);
    setError("");
    try {
      await downloader.current!(release);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.startsWith("Download ")
          ? cause.message
          : "Download failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mc-application-selector">
      <div
        className="mc-application-tabs"
        role="tablist"
        aria-label="MediCluster applications"
        onKeyDown={(event) => {
          const index = apps.findIndex((app) => app.id === current.id);
          const next =
            event.key === "ArrowRight"
              ? (index + 1) % apps.length
              : event.key === "ArrowLeft"
                ? (index + apps.length - 1) % apps.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? apps.length - 1
                    : null;
          if (next !== null) {
            event.preventDefault();
            select(apps[next].id, true);
          }
        }}
      >
        {apps.map((app) => {
          const Icon =
            selected === app.id
              ? Check
              : (ICONS[app.id as keyof typeof ICONS] ?? Stethoscope);
          return (
            <button
              key={app.id}
              id={app.id}
              type="button"
              role="tab"
              aria-selected={current.id === app.id}
              aria-controls={`application-panel-${app.id}`}
              tabIndex={current.id === app.id ? 0 : -1}
              onClick={() => select(app.id)}
            >
              <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
              {app.name}
            </button>
          );
        })}
      </div>
      {apps.map((app) => (
        <div
          key={app.id}
          id={`application-panel-${app.id}`}
          role="tabpanel"
          aria-labelledby={app.id}
          hidden={app.id !== current.id}
        >
          <div className="mc-application-action">
            <p>{app.description}</p>
            {app.webHref ? (
              <a
                className="download-pill download-pill-dark"
                href={app.webHref}
                aria-label={`Open ${app.name} web app`}
              >
                Open web app <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ) : (
              <span className="mc-application-unavailable">Coming soon</span>
            )}
          </div>
          <div className="mc-application-options">
            {app.android ? (
              <>
                {release ? (
                  <button
                    type="button"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => void download()}
                    aria-label="Download Patient app for Android"
                  >
                    <Download size={14} aria-hidden="true" />
                    {busy ? "Preparing download…" : "Download Android"}
                  </button>
                ) : (
                  <span>Android download unavailable</span>
                )}
                <span aria-hidden="true">·</span>
                <button type="button" onClick={onInstall}>
                  Installation guide
                </button>
              </>
            ) : (
              <span>
                {app.webHref
                  ? "Web app · Opens in your browser"
                  : "This workspace isn’t available yet."}
              </span>
            )}
          </div>
          {app.android && busy && (
            <p className="mc-application-feedback" role="status">
              Preparing your verified download…
            </p>
          )}
          {app.android && error && (
            <p
              className="mc-application-feedback mc-application-error"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
