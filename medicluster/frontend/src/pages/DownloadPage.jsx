import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  ChevronDown,
  Pause,
  Play,
  Stethoscope,
  Heart,
  Route,
  Ambulance,
} from "lucide-react";
import Logo from "../components/Logo";
import ApplicationSelector from "../components/download/ApplicationSelector";
import CareArtifact from "../components/download/CareArtifact";
import {
  CareStory,
  PatientSpotlight,
  ClinicalSpotlight,
  CareJourney,
  GetStarted,
  LandingFAQ,
  LandingFooter,
} from "../components/download/LandingSections";
import { useSiteMotion } from "../components/download/SiteMotion";
import { DISPATCH_URL } from "../navigation";
import { buildAppCatalog } from "../data/appCatalog";
import {
  PATIENT_RELEASE_PATH,
  readPatientRelease,
} from "../patient-app/patientPlatform";
import { CREW_RELEASE_PATH, readCrewRelease } from "../crew-app/crewPlatform";
import "./download-page.css";

const APPS = buildAppCatalog(DISPATCH_URL, { allowLocal: import.meta.env.DEV });
const ICONS = {
  clinic: Stethoscope,
  heart: Heart,
  route: Route,
  ambulance: Ambulance,
};

export default function DownloadPage() {
  const [motionPaused, setMotionPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [release, setRelease] = useState(null);
  const [crewRelease, setCrewRelease] = useState(null);
  const [installApp, setInstallApp] = useState("patient");
  const selectApp = useCallback((id) => {
    if (id === "patient" || id === "crew") setInstallApp(id);
  }, []);
  const rootRef = useRef(null);
  const headerRef = useRef(null);
  const productsRef = useRef(null);
  useSiteMotion(rootRef, motionPaused);

  useEffect(() => {
    const controller = new AbortController();
    for (const [path, readRelease, publish] of [
      [PATIENT_RELEASE_PATH, readPatientRelease, setRelease],
      [CREW_RELEASE_PATH, readCrewRelease, setCrewRelease],
    ]) {
      fetch(path, { signal: controller.signal, cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!controller.signal.aborted) publish(readRelease(data));
        })
        .catch(() => {});
    }
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const outside = (event) => {
      if (!headerRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        productsRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  const showInstall = (id) => {
    selectApp(id);
    setInstallOpen(true);
    requestAnimationFrame(() =>
      document.getElementById("install")?.scrollIntoView({
        behavior:
          motionPaused || matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        block: "center",
      }),
    );
  };

  return (
    <div
      className="download-portal"
      id="top"
      ref={rootRef}
      data-motion-paused={motionPaused}
    >
      <div className="mc-scroll-progress" aria-hidden="true" />
      <a className="download-skip" href="#apps">
        Skip to apps
      </a>
      <header className="download-header" ref={headerRef}>
        <div className="download-header-inner mc-container">
          <a
            className="download-brand"
            href="/download"
            aria-label="MediCluster apps home"
          >
            <Logo />
            <span>MediCluster</span>
          </a>
          <nav className="download-nav" aria-label="Main navigation">
            <button
              className="download-products-toggle"
              ref={productsRef}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="download-product-menu"
              onClick={() => setMenuOpen((value) => !value)}
            >
              Products{" "}
              <ChevronDown
                size={15}
                className={menuOpen ? "is-open" : ""}
                aria-hidden="true"
              />
            </button>
            <a className="mc-desktop-nav" href="#how-it-works">
              How it works
            </a>
            <a className="mc-desktop-nav" href="#faq">
              FAQ
            </a>
          </nav>
          <a
            className="download-pill download-pill-dark download-header-cta"
            href="#apps"
            aria-label="Get the apps"
          >
            <span>Get the apps</span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </div>
        {menuOpen && (
          <div className="download-menu" id="download-product-menu">
            <div className="download-menu-inner mc-container">
              <div className="download-menu-intro">
                <h2>
                  Your next step.
                  <br />
                  <em>All connected.</em>
                </h2>
                <a href="#apps" onClick={() => setMenuOpen(false)}>
                  Explore the apps <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
              <nav aria-label="Products" className="download-menu-list">
                {APPS.map((app) => {
                  const Icon = ICONS[app.icon];
                  return (
                    <a
                      key={app.id}
                      href={`#${app.id}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      <Icon size={21} aria-hidden="true" />
                      <span>
                        {app.name}
                        <small>{app.description}</small>
                      </span>
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </a>
                  );
                })}
              </nav>
              <div className="download-menu-note">
                <span>Care, connected.</span>
                <p>
                  One connected platform.
                  <br />
                  The right app for every role.
                </p>
                <a href="#faq" onClick={() => setMenuOpen(false)}>
                  A few helpful answers{" "}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        )}
      </header>
      <main>
        <section
          className="download-hero mc-container"
          aria-labelledby="download-title"
        >
          <div className="download-hero-content">
            <h1 id="download-title">
              <span>Better care.</span>
              <span>
                <em>Everywhere</em>
              </span>
              <span>you are.</span>
            </h1>
            <p>
              One connected platform.
              <br />
              The right app for every role.
            </p>
            <div className="mc-hero-actions">
              <a
                className="download-pill download-pill-dark download-explore"
                href="#apps"
              >
                Explore apps <ArrowUpRight size={21} aria-hidden="true" />
              </a>
              <a className="mc-text-link" href="#how-it-works">
                How it works <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
          <CareArtifact paused={motionPaused} />
          <div className="mc-hero-bottom">
            <button
              type="button"
              className="download-motion-toggle"
              onClick={() => setMotionPaused((value) => !value)}
              aria-pressed={motionPaused}
              aria-label={
                motionPaused ? "Resume animations" : "Pause animations"
              }
            >
              {motionPaused ? (
                <Play size={13} aria-hidden="true" />
              ) : (
                <Pause size={13} aria-hidden="true" />
              )}
              <span>{motionPaused ? "Motion paused" : "Pause motion"}</span>
            </button>
            <span>For every part of care.</span>
            <a href="#care-story">
              Scroll to explore <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <nav className="mc-role-strip" aria-label="Find your workspace">
            <a href="#medicluster">Clinicians</a>
            <span aria-hidden="true">/</span>
            <a href="#patient">Patients</a>
            <span aria-hidden="true">/</span>
            <a href="#dispatch">Dispatchers</a>
            <span aria-hidden="true">/</span>
            <a href="#crew">Crews</a>
          </nav>
        </section>
        <CareStory />
        <section
          className="mc-cinematic"
          id="care-in-motion"
          aria-labelledby="cinematic-title"
        >
          <div className="mc-cinematic-stage">
            <div className="mc-cinematic-frame">
              <img
                src="/images/care-corridor.webp"
                alt="A healthcare professional walking through a sunlit clinic"
                loading="lazy"
              />
              <div className="mc-cinematic-shade" />
            </div>
            <div className="mc-cinematic-copy">
              <p>From the clinic to the everyday.</p>
              <h2 id="cinematic-title">
                Care doesn't stop
                <br />
                at the <em>clinic door.</em>
              </h2>
            </div>
            <div className="mc-cinematic-caption">
              <span>Made for the people behind the care.</span>
              <a href="#apps">
                Find your workspace <ArrowDown size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
        <section
          className="download-apps"
          id="apps"
          aria-labelledby="download-apps-title"
        >
          <div className="mc-container">
            <div className="download-section-heading" data-reveal>
              <h2 id="download-apps-title">Find your MediCluster.</h2>
              <p>Choose your role. Get connected.</p>
            </div>
            <ApplicationSelector
              apps={APPS}
              release={release}
              crewRelease={crewRelease}
              onSelect={selectApp}
              onInstall={showInstall}
            />
          </div>
        </section>
        <PatientSpotlight />
        <ClinicalSpotlight />
        <CareJourney />
        <GetStarted paused={motionPaused} />
        <LandingFAQ
          release={release}
          crewRelease={crewRelease}
          installApp={installApp}
          installOpen={installOpen}
          setInstallOpen={setInstallOpen}
        />
      </main>
      <LandingFooter onInstall={() => showInstall()} />
    </div>
  );
}
