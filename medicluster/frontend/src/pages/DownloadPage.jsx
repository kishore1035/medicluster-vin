import React, { useEffect, useRef, useState } from "react";
import Logo from "../components/Logo";
import { DISPATCH_URL } from "../navigation";
import { buildAppCatalog } from "../data/appCatalog";
import { PATIENT_RELEASE_PATH, patientApkUrl, readPatientRelease } from "../patient-app/patientPlatform";
import "./download-page.css";

const APPS = buildAppCatalog(DISPATCH_URL, { allowLocal: import.meta.env.DEV });
const PARTICLES = [
  [7, 13, "#7950ff", -34], [21, 25, "#f78322", 35], [93, 9, "#f78322", -35],
  [87, 16, "#5750ff", -34], [7, 55, "#2f95ff", -37], [4, 64, "#f78322", -35],
  [96, 65, "#7950ff", -35], [13, 81, "#7950ff", 35], [84, 80, "#5750ff", 35],
  [94, 87, "#f78322", 35], [26, 93, "#f78322", -35],
];

function Icon({ name, className = "" }) {
  const paths = {
    clinic: <><path d="M4 3v5a5 5 0 0 0 10 0V3M4 3h2M12 3h2M9 13v3a5 5 0 0 0 10 0v-3" /><circle cx="19" cy="11" r="2" /></>,
    heart: <path d="M20.5 5.5a5 5 0 0 0-7.1 0L12 7l-1.4-1.5a5 5 0 0 0-7.1 7.1L12 21l8.5-8.4a5 5 0 0 0 0-7.1Z" />,
    route: <><path d="M6 12c-2-3-4-5-4-7a4 4 0 0 1 8 0c0 2-2 4-4 7ZM18 23c-2-3-4-5-4-7a4 4 0 0 1 8 0c0 2-2 4-4 7ZM6 12c0 5 12-1 12 4" /><circle cx="6" cy="5" r="1" /><circle cx="18" cy="16" r="1" /></>,
    ambulance: <><path d="M3 5h11v14H2V7a2 2 0 0 1 1-2ZM14 9h4l4 5v5h-8M7 8v6M4 11h6M17 10v4h5" /><circle cx="6" cy="19" r="2.3" fill="currentColor" stroke="none" /><circle cx="18" cy="19" r="2.3" fill="currentColor" stroke="none" /></>,
    down: <path d="M12 4v16m-6-6 6 6 6-6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Brand({ footer = false }) {
  return <a className={`download-brand${footer ? " download-brand-footer" : ""}`} href="/download" aria-label="MediCluster apps home"><Logo /><span>MediCluster</span></a>;
}

export default function DownloadPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [release, setRelease] = useState(null);
  const headerRef = useRef(null);
  const productsRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(PATIENT_RELEASE_PATH, { signal: controller.signal, cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (!controller.signal.aborted) setRelease(readPatientRelease(data)); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const outside = (event) => { if (!headerRef.current?.contains(event.target)) setMenuOpen(false); };
    const escape = (event) => {
      if (event.key === "Escape") { setMenuOpen(false); productsRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);

  return (
    <div className="download-portal">
      <a className="download-skip" href="#apps">Skip to apps</a>
      <header className="download-header" ref={headerRef}>
        <div className="download-header-inner">
          <Brand />
          <nav className="download-nav" aria-label="Main navigation">
            <button className="download-products-toggle" ref={productsRef} type="button" aria-expanded={menuOpen} aria-controls="download-product-menu" onClick={() => setMenuOpen((open) => !open)}>
              Products <Icon name="chevron" className={menuOpen ? "is-open" : ""} />
            </button>
            <a className="download-install-nav" href="#install" onClick={() => { setMenuOpen(false); setInstallOpen(true); }}>How to install</a>
          </nav>
          <a className="download-pill download-pill-dark download-header-cta" href="#apps" aria-label="Get the apps"><span>Get the apps</span><Icon name="down" /></a>
        </div>
        {menuOpen && <div className="download-menu" id="download-product-menu">
          <div className="download-menu-inner">
            <div className="download-menu-intro"><h2>Explore our<br />connected apps.</h2><a href="#apps" onClick={() => setMenuOpen(false)}>See all apps</a></div>
            <nav aria-label="Products" className="download-menu-list">
              <p>Products</p>
              {APPS.map((app) => <a key={app.id} href={`#${app.id}`} onClick={() => setMenuOpen(false)}><Icon name={app.icon} /><span>{app.name}</span></a>)}
            </nav>
            <div className="download-menu-note"><span>Care, connected.</span><p>One connected platform.<br />The right app for every role.</p></div>
          </div>
        </div>}
      </header>

      <main>
        <section className="download-hero" aria-labelledby="download-title">
          <div className="download-particles" aria-hidden="true">{PARTICLES.map(([x, y, color, angle], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, color, "--dash-angle": `${angle}deg`, "--dash-delay": `${i * -0.7}s` }} />)}</div>
          <div className="download-hero-content">
            <h1 id="download-title"><span>Better care.</span><span>Everywhere you are.</span></h1>
            <p>One connected platform. The right app for every role.</p>
            <a className="download-pill download-pill-dark download-explore" href="#apps">Explore apps <Icon name="down" /></a>
          </div>
        </section>

        <section className="download-apps download-container" id="apps" aria-labelledby="download-apps-title">
          <div className="download-section-heading"><h2 id="download-apps-title">Find your MediCluster.</h2><p>Choose your role. Get connected.</p></div>
          <div className="download-app-list">{APPS.map((app) => <article className="download-app-row" id={app.id} key={app.id} aria-labelledby={`${app.id}-title`}>
            <Icon name={app.icon} className="download-app-icon" />
            <div className="download-app-description"><h3 id={`${app.id}-title`}>{app.name}</h3><p>{app.description}</p></div>
            <div className="download-app-actions">
              <span className="download-platform">{app.android ? "Android 8.0+" : "Web app"}</span>
              <div className="download-app-buttons">
                {app.android && (release
                  ? <a className="download-pill download-pill-dark" href={patientApkUrl(release)} download="MediCluster-Patient.apk" aria-label="Download Patient app for Android">Download Android</a>
                  : <span className="download-unavailable">Android download unavailable</span>)}
                {app.webHref
                  ? <a className={`download-web-link${app.android ? " download-web-link-text" : " download-pill"}`} href={app.webHref} aria-label={`Open ${app.name} web app`}>Open web app</a>
                  : <span className="download-unavailable">Coming soon</span>}
              </div>
            </div>
          </article>)}</div>

          <details className="download-install" id="install" open={installOpen} onToggle={(event) => setInstallOpen(event.currentTarget.open)}>
            <summary>How to install <Icon name="plus" /></summary>
            <div className="download-install-content">
              <div><h3>Android patient app</h3><p>Select Download Android, open the APK on your phone, and follow Android’s installation steps. If asked, allow installation from your browser. Android 8.0+ and internet required.</p>{release && <p className="download-version">Version {release.versionName} · {Math.ceil(release.sizeBytes / 1024)} KB</p>}</div>
              <div><h3>Use any web app</h3><p>Select Open web app for your role. Clinicians and dispatchers use their account email and password. Patients use a mobile number and code; ambulance crews use an employee ID and PIN.</p><p>On iPhone, open your app in Safari.</p></div>
            </div>
          </details>
        </section>
      </main>
      <footer className="download-footer"><div className="download-container"><Brand footer /><span>Care, connected.</span></div></footer>
    </div>
  );
}
