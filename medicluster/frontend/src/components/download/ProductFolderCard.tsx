import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import GlassFolder, {
  type ArtPreset,
  type FolderFile,
} from "@/components/ui/glass-folder-cards";
import { createPatientDownloader } from "@/patient-app/patientDownload";
import type { ProductApp, PatientRelease } from "./appTypes";
export type { ProductApp, PatientRelease } from "./appTypes";
const ART: Record<
  string,
  { art: ArtPreset; tone: "light" | "dark"; seed: number }
> = {
  medicluster: { art: "aurora", tone: "light", seed: 3 },
  patient: { art: "glacier", tone: "light", seed: 7 },
  dispatch: { art: "ember", tone: "dark", seed: 11 },
  crew: { art: "verdant", tone: "light", seed: 19 },
};

export function productFolderFiles(
  app: ProductApp,
  release: PatientRelease | null,
): FolderFile[] {
  const files: FolderFile[] = [];
  if (app.webHref)
    files.push({
      name: "Open web app",
      meta: app.android ? "Patient portal" : "Web app",
      art: ART[app.id]?.art ?? "aurora",
      href: app.webHref,
    });
  if (app.android && release)
    files.push({
      name: "Download Android",
      meta: `v${release.versionName}`,
      art: "aurora",
    });
  if (app.webHref)
    files.push({
      name: "How to install",
      meta: "Getting started",
      href: "#install",
    });
  if (!app.webHref)
    files.push({
      name: "Coming soon",
      meta: "Not available yet",
      disabled: true,
    });
  return files;
}

export default function ProductFolderCard({
  app,
  release,
  paused,
  open,
  onOpenChange,
  onInstall,
  index,
}: {
  app: ProductApp;
  release: PatientRelease | null;
  paused: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: () => void;
  index: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const downloader = useRef<ReturnType<typeof createPatientDownloader> | null>(
    null,
  );
  if (!downloader.current) downloader.current = createPatientDownloader();
  const [width, setWidth] = useState(340);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resize = () =>
      setWidth(Math.max(1, Math.min(340, container.clientWidth)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
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
  const artwork = ART[app.id] ?? ART.medicluster;
  return (
    <article
      className="download-product"
      id={app.id}
      aria-labelledby={`${app.id}-title`}
    >
      <h3 className="sr-only" id={`${app.id}-title`}>
        {app.name}
      </h3>
      <div ref={containerRef} className="download-folder-object">
        <GlassFolder
          key={app.android ? (release?.sha256 ?? "unpublished") : app.id}
          label={app.name}
          meta={
            app.android
              ? "Android + web"
              : app.webHref
                ? "Web app"
                : "Coming soon"
          }
          {...artwork}
          files={productFolderFiles(app, release)}
          action="more"
          menu={[{ label: "How to install", onSelect: onInstall }]}
          onFileSelect={(file) => {
            if (file.name === "Download Android") void download();
            if (file.href === "#install") onInstall();
          }}
          width={width}
          open={open}
          onOpenChange={onOpenChange}
          paused={paused}
          appearDelay={index * 100}
        />
      </div>
      <div className="download-product-details">
        <p>{app.description}</p>
        <div className="download-product-links">
          {app.webHref ? (
            <a href={app.webHref} aria-label={`Open ${app.name} web app`}>
              Open web app <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          ) : (
            <span className="download-product-unavailable">Coming soon</span>
          )}
          {app.android &&
            (release ? (
              <button
                type="button"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void download()}
                aria-label="Download Patient app for Android"
              >
                {busy ? "Preparing download…" : "Download Android"}
              </button>
            ) : (
              <span className="download-product-unavailable">
                Android download unavailable
              </span>
            ))}
        </div>
        {busy && (
          <span className="download-product-status" role="status">
            Preparing download…
          </span>
        )}
        {error && (
          <span className="download-product-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </article>
  );
}
