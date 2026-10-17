import React, { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  Home,
  Layers3,
  MessageCircle,
  Network,
  Pill,
  Plus,
  Upload,
} from "lucide-react";
import Logo from "../Logo";
import type { PatientRelease } from "./ProductFolderCard";

export function TextLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={href} className={`mc-text-link ${className}`}>
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </a>
  );
}

export function CareStory() {
  return (
    <section
      className="mc-story mc-container"
      id="care-story"
      aria-labelledby="care-story-title"
    >
      <p className="mc-section-label" data-reveal>
        A more connected way to care
      </p>
      <div className="mc-story-copy" data-reveal>
        <h2 id="care-story-title">
          The right information.
          <br />
          The right people.
          <br />
          <span>One shared direction.</span>
        </h2>
        <p>
          From the clinic to the everyday, make the next step easier to see.
        </p>
      </div>
    </section>
  );
}

const PATIENT_FEATURES = [
  {
    id: "medicines",
    label: "Medicine schedules",
    description: "See scheduled medicines and mark doses as taken.",
  },
  {
    id: "readings",
    label: "Health readings",
    description: "Keep blood pressure and blood sugar readings in one place.",
  },
  {
    id: "cliniq",
    label: "Ask CliniQ",
    description:
      "Find a place for questions about your medicines and everyday care.",
  },
] as const;
type Feature = (typeof PATIENT_FEATURES)[number]["id"];

export function PatientSpotlight() {
  const [feature, setFeature] = useState<Feature>("medicines");
  const [daypart, setDaypart] = useState("Morning");
  return (
    <section
      className="mc-spotlight mc-container"
      id="everyday"
      aria-labelledby="everyday-title"
    >
      <div className="mc-spotlight-copy" data-reveal>
        <p className="mc-section-label">For everyday care</p>
        <h2 id="everyday-title">
          Your day.
          <br />A little <em>clearer.</em>
        </h2>
        <p className="mc-body">
          Medicine schedules, health readings and a place to ask questions.
          Bring the everyday pieces of care together.
        </p>
        <div className="mc-feature-list">
          {PATIENT_FEATURES.map((item, index) => (
            <div
              className="mc-feature"
              data-selected={feature === item.id || undefined}
              key={item.id}
            >
              <button
                type="button"
                aria-label={item.label}
                aria-expanded={feature === item.id}
                aria-controls={`feature-${item.id}`}
                onClick={() => setFeature(item.id)}
              >
                <span className="mc-feature-number">0{index + 1}</span>
                <span>{item.label}</span>
                <ChevronDown size={19} aria-hidden="true" />
              </button>
              <div
                className="mc-feature-description"
                id={`feature-${item.id}`}
                hidden={feature !== item.id}
              >
                <p>{item.description}</p>
                <TextLink href="/app">Open patient app</TextLink>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mc-phone-scene" data-reveal>
        <img
          className="mc-scene-photo"
          src="/images/patient-preview-scene.webp"
          alt=""
          width="1200"
          height="1200"
          loading="lazy"
        />
        <span className="mc-preview-caption">Patient app preview</span>
        <div className="mc-phone">
          <div className="mc-phone-camera" aria-hidden="true" />
          <div className="mc-phone-screen">
            <div className="mc-phone-brand">
              <Logo />
              <span>MediCluster</span>
              <span className="mc-phone-avatar" aria-hidden="true">
                <Heart size={13} />
              </span>
            </div>
            <h3>
              {feature === "medicines"
                ? "Today"
                : feature === "readings"
                  ? "My health"
                  : "Ask CliniQ"}
            </h3>
            {feature === "medicines" && (
              <>
                <div className="mc-dayparts" aria-label="Preview time of day">
                  {["Morning", "Afternoon", "Evening"].map((part) => (
                    <button
                      key={part}
                      type="button"
                      aria-pressed={daypart === part}
                      onClick={() => setDaypart(part)}
                    >
                      {part}
                    </button>
                  ))}
                </div>
                <div className="mc-preview-empty">
                  <span className="mc-preview-symbol">
                    <Pill size={26} aria-hidden="true" />
                  </span>
                  <h4>Your medicine schedule</h4>
                  <p>Scheduled medicines appear here.</p>
                  <span className="mc-daypart-note">{daypart} schedule</span>
                </div>
                <div className="mc-preview-note">
                  <Check size={16} aria-hidden="true" />
                  <span>One day at a time.</span>
                </div>
              </>
            )}
            {feature === "readings" && (
              <div className="mc-reading-preview">
                <p>Keep track of your readings.</p>
                {["Blood pressure", "Blood sugar"].map((label) => (
                  <div key={label}>
                    <span>
                      {label}
                      <small>No readings yet</small>
                    </span>
                    <span>—</span>
                  </div>
                ))}
                <a href="/app/health/log">
                  Log a reading <Plus size={14} aria-hidden="true" />
                </a>
              </div>
            )}
            {feature === "cliniq" && (
              <div className="mc-preview-empty">
                <span className="mc-preview-symbol">
                  <MessageCircle size={26} aria-hidden="true" />
                </span>
                <h4>A place for your questions.</h4>
                <p>Start a conversation about your everyday care.</p>
                <a href="/app/cliniq" className="mc-phone-action">
                  Open CliniQ <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </div>
            )}
            <nav className="mc-phone-nav" aria-label="Patient preview sections">
              {[
                { id: "medicines", icon: Home, label: "Today" },
                { id: "readings", icon: Heart, label: "Health" },
                { id: "cliniq", icon: MessageCircle, label: "CliniQ" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={feature === item.id}
                  onClick={() => setFeature(item.id as Feature)}
                >
                  <item.icon size={17} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </section>
  );
}

const METHODS = [
  {
    id: "kmeans",
    label: "K-Means",
    description: "Group similar records around cluster centers.",
  },
  {
    id: "dbscan",
    label: "DBSCAN",
    description: "Explore dense groups and records outside them.",
  },
  {
    id: "hierarchical",
    label: "Hierarchical",
    description: "Explore how groups relate within a hierarchy.",
  },
  {
    id: "gmm",
    label: "GMM",
    description: "Explore overlapping groups with a mixture model.",
  },
] as const;

function ClusterIllustration({ method }: { method: string }) {
  const palette = ["#8a9e79", "#ce7954", "#a395b5"];
  const dots = Array.from({ length: 150 }, (_, i) => {
    const group = i % 3,
      angle = i * 2.3999632297,
      amount = Math.sqrt(((i * 37) % 101) / 101);
    const shift =
      method === "dbscan"
        ? 10
        : method === "hierarchical"
          ? -8
          : method === "gmm"
            ? 15
            : 0;
    const cx = [125, 355 + shift, 290][group],
      cy = [130, 90, 235 + shift][group];
    return {
      x: cx + Math.cos(angle) * amount * (group === 1 ? 70 : 60),
      y: cy + Math.sin(angle) * amount * 45,
      color: palette[group],
    };
  });
  return (
    <svg
      className="mc-scatter"
      viewBox="0 0 480 330"
      role="img"
      aria-label={`Illustration of groups for ${method}; not patient results`}
    >
      <path d="M35 25V295H455" fill="none" stroke="#c5c8c0" />
      {[85, 155, 225].map((y) => (
        <path
          key={y}
          d={`M35 ${y}H455`}
          stroke="#e5e5dd"
          strokeDasharray="3 6"
        />
      ))}
      {method === "gmm" && (
        <>
          {[
            [125, 130],
            [370, 90],
            [290, 250],
          ].map(([x, y], i) => (
            <ellipse
              key={x}
              cx={x}
              cy={y}
              rx="83"
              ry="60"
              fill={palette[i]}
              fillOpacity=".09"
              stroke={palette[i]}
              strokeOpacity=".25"
            />
          ))}
        </>
      )}
      {dots.map((dot, i) => (
        <circle
          key={i}
          cx={dot.x}
          cy={dot.y}
          r={i % 7 === 0 ? 3 : 2.1}
          fill={dot.color}
          opacity={i % 5 === 0 ? 0.5 : 0.9}
        />
      ))}
      {method === "dbscan" && (
        <>
          {[
            [70, 245],
            [260, 50],
            [420, 210],
            [200, 190],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="2.5" fill="#858c83" />
          ))}
        </>
      )}
      {method === "hierarchical" && (
        <path
          d="M125 68V45H282V28M355 30V45H282"
          stroke="#99a38e"
          fill="none"
        />
      )}
    </svg>
  );
}

export function ClinicalSpotlight() {
  const [method, setMethod] = useState(0);
  const current = METHODS[method];
  const changeMethod = (index: number, focus = false) => {
    setMethod(index);
    if (focus) document.getElementById(`method-${METHODS[index].id}`)?.focus();
  };
  return (
    <section
      className="mc-spotlight mc-clinical mc-container"
      id="clinical"
      aria-labelledby="clinical-title"
    >
      <div className="mc-clinical-visual" data-reveal>
        <div className="mc-workspace-header">
          <span>
            <Logo />
            MediCluster
          </span>
          <span>/</span>
          <span>Population overview</span>
          <Layers3 size={17} aria-hidden="true" />
        </div>
        <p className="mc-illustration-label">Illustrative clusters</p>
        <ClusterIllustration method={current.id} />
        <p className="mc-method-label">Explore a method</p>
        <div
          className="mc-method-tabs"
          role="tablist"
          aria-label="Clustering method preview"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              changeMethod((method + 1) % METHODS.length, true);
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              changeMethod(
                (method + METHODS.length - 1) % METHODS.length,
                true,
              );
            }
            if (event.key === "Home") {
              event.preventDefault();
              changeMethod(0, true);
            }
            if (event.key === "End") {
              event.preventDefault();
              changeMethod(METHODS.length - 1, true);
            }
          }}
        >
          {METHODS.map((item, i) => (
            <button
              key={item.id}
              id={`method-${item.id}`}
              role="tab"
              type="button"
              aria-selected={i === method}
              aria-controls="method-description"
              tabIndex={i === method ? 0 : -1}
              onClick={() => changeMethod(i)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p
          className="mc-method-description"
          id="method-description"
          role="tabpanel"
          aria-labelledby={`method-${current.id}`}
        >
          {current.description}
        </p>
      </div>
      <div className="mc-spotlight-copy" data-reveal>
        <p className="mc-section-label mc-terracotta">For clinical teams</p>
        <h2 id="clinical-title">
          See the patterns.
          <br />
          Consider the <em>person.</em>
        </h2>
        <p className="mc-body">
          Bring patient vitals into focus. Explore clustering methods, review
          risk tiers and decide where to look next.
        </p>
        <TextLink href="/login">Open clinician workspace</TextLink>
        <ul className="mc-clinical-features">
          {[
            { icon: Upload, text: "Upload patient vitals" },
            { icon: Network, text: "Explore four clustering methods" },
            { icon: Layers3, text: "Review patients by risk tier" },
          ].map((item) => (
            <li key={item.text}>
              <span>
                <item.icon size={21} aria-hidden="true" />
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function CareJourney() {
  return (
    <section
      className="mc-journey"
      id="how-it-works"
      aria-labelledby="journey-title"
    >
      <div className="mc-journey-art" aria-hidden="true">
        <img src="/images/liquid-sculpture.webp" alt="" loading="lazy" />
      </div>
      <div className="mc-container">
        <p className="mc-section-label" data-reveal>
          How it works
        </p>
        <div className="mc-journey-heading" data-reveal>
          <h2 id="journey-title">
            From first login
            <br />
            to <em>everyday care.</em>
          </h2>
          <p>
            A clear place to begin.
            <br />A connected way to keep going.
          </p>
        </div>
        <ol className="mc-journey-steps">
          {[
            {
              title: "Find your app",
              body: "Choose the workspace made for your role.",
              link: "Explore the apps",
              href: "#apps",
            },
            {
              title: "Sign in your way",
              body: "Use the sign-in method for your patient or team account.",
              link: "Open patient portal",
              href: "/app",
            },
            {
              title: "Keep care moving",
              body: "Review a schedule, record a reading or open your team workspace.",
              link: "See patient features",
              href: "#everyday",
            },
          ].map((step, i) => (
            <li key={step.title} data-reveal>
              <span className="mc-step-number">0{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <TextLink href={step.href}>{step.link}</TextLink>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function GetStarted() {
  return (
    <section className="mc-get-started" aria-labelledby="get-started-title">
      <img
        className="mc-cta-sculpture"
        src="/images/liquid-sculpture.webp"
        alt=""
        loading="lazy"
      />
      <div className="mc-container mc-get-started-layout" data-reveal>
        <h2 id="get-started-title">
          Your next step.
          <br />
          <em>Closer to care.</em>
        </h2>
        <div>
          <p>Choose your app and get connected, wherever you are.</p>
          <div className="mc-cta-buttons">
            <a className="download-pill download-pill-dark" href="#apps">
              Get the apps <ArrowUpRight size={19} aria-hidden="true" />
            </a>
            <a className="download-pill" href="/app">
              Open patient app <ArrowUpRight size={19} aria-hidden="true" />
            </a>
          </div>
          <span className="mc-platform-note">
            Android 8.0+ · Web apps for every role
          </span>
        </div>
      </div>
    </section>
  );
}

export function LandingFAQ({
  release,
  installOpen,
  setInstallOpen,
}: {
  release: PatientRelease | null;
  installOpen: boolean;
  setInstallOpen: (open: boolean) => void;
}) {
  return (
    <section
      className="mc-faq mc-container"
      id="faq"
      aria-labelledby="faq-title"
    >
      <h2 id="faq-title" data-reveal>
        A few things
        <br />
        you might
        <br />
        want to know.
      </h2>
      <div className="mc-faq-list" data-reveal>
        <details open>
          <summary>
            <span>01</span>Which app is right for me?
            <Plus size={20} aria-hidden="true" />
          </summary>
          <p>
            Clinicians use MediCluster. Patients use the Patient app.
            Dispatchers and ambulance crews have their own workspaces.
          </p>
        </details>
        <details>
          <summary>
            <span>02</span>Can I use MediCluster on my phone?
            <Plus size={20} aria-hidden="true" />
          </summary>
          <p>
            Yes. The Patient app is available for Android 8.0 and later. Web
            apps also work in your browser, including Safari on iPhone. An
            internet connection is required.
          </p>
        </details>
        <details
          id="install"
          open={installOpen}
          onToggle={(event) => setInstallOpen(event.currentTarget.open)}
        >
          <summary>
            <span>03</span>How do I install the Android app?
            <Plus size={20} aria-hidden="true" />
          </summary>
          <div>
            <p>
              Choose Download Android in the Patient app folder. Open the
              downloaded APK on your phone and follow Android’s installation
              steps. If asked, allow installation from your browser.
            </p>
            {release && (
              <p className="mc-release-note">
                Version {release.versionName} ·{" "}
                {Math.ceil(release.sizeBytes / 1024)} KB · Android 8.0+
              </p>
            )}
            <TextLink href="#patient">Find the Android download</TextLink>
          </div>
        </details>
        <details>
          <summary>
            <span>04</span>Do I need an account?
            <Plus size={20} aria-hidden="true" />
          </summary>
          <p>
            Patients sign in with a mobile number and code. Clinicians and
            dispatchers use their account email and password. Ambulance crews
            use an employee ID and PIN.
          </p>
        </details>
      </div>
    </section>
  );
}

export function LandingFooter({ onInstall }: { onInstall: () => void }) {
  return (
    <footer className="mc-footer">
      <div className="mc-container">
        <div className="mc-footer-top">
          <div className="mc-footer-brand">
            <a href="/download" aria-label="MediCluster apps home">
              <Logo />
              <span>MediCluster</span>
            </a>
            <p>Care, connected.</p>
          </div>
          <nav aria-label="Explore">
            <span>Explore</span>
            <a href="#apps">The apps</a>
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <nav aria-label="Your workspace">
            <span>Your workspace</span>
            <a href="/login">Clinician login</a>
            <a href="/app">Patient portal</a>
          </nav>
          <nav aria-label="Get started">
            <span>Get started</span>
            <a href="#install" onClick={onInstall}>
              Install Android
            </a>
            <a href="#apps">Use the web apps</a>
            <a href="#top">
              Back to top <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </nav>
        </div>
        <div className="mc-footer-wordmark" aria-hidden="true">
          <span>MediCluster</span>
          <Logo />
        </div>
        <div className="mc-footer-bottom">
          <span>© {new Date().getFullYear()} MediCluster</span>
          <span>Built around people.</span>
        </div>
      </div>
    </footer>
  );
}
