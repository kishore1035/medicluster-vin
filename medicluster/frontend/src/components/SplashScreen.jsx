import { useCallback, useEffect, useRef, useState } from "react";
import "./splash-screen.css";

// MediCluster intro, same motion language as EtherxWord / EtherX Meet:
// the four squares of the mark trace their outlines, fill in (the risk square last, in orange),
// the mark slides left as the wordmark opens, then each letter pops in. The last frame is the logo.
const WORD = "MediCluster";
const SQUARES = [
  { x: 1, y: 1 }, { x: 11, y: 1 }, { x: 1, y: 11 }, { x: 11, y: 11, accent: true },
];
const HOLD_MS = 900;      // logo stays this long after the tagline lands
const FALLBACK_MS = 6000; // leave even if animations never report (hidden tab, throttled CPU)
const FADE_MS = 500;

/** Keep startup scoped to the document, with the app loading behind the intro. */
export function AppStartup({ children, tagline }) {
  const [showSplash, setShowSplash] = useState(true);
  const finishSplash = useCallback(() => setShowSplash(false), []);
  const setContent = useCallback((node) => {
    if (node) node.inert = showSplash;
  }, [showSplash]);

  return (
    <>
      <div id="app-content" className="mc-startup-content" ref={setContent} aria-hidden={showSplash || undefined}>
        {children}
      </div>
      {showSplash && <SplashScreen onDone={finishSplash} tagline={tagline} />}
    </>
  );
}

export default function SplashScreen({ onDone, tagline = "Patient risk stratification at scale" }) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [landed, setLanded] = useState(reduced);
  const [leaving, setLeaving] = useState(false);
  const skipButton = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    skipButton.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), landed ? HOLD_MS : FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [landed]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);

  useEffect(() => {
    const skip = (e) => {
      if (["Escape", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        setLeaving(true);
      }
      if (e.key === "Tab") {
        e.preventDefault();
        skipButton.current?.focus();
      }
    };
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, []);

  return (
    <div className="mc-splash" data-leaving={leaving} data-reduced={reduced} onClick={() => setLeaving(true)}
      role="dialog" aria-modal="true" aria-label="Starting MediCluster">
      <div className="mc-splash-lockup" role="img" aria-label="MediCluster">
        <svg className="mc-splash-mark" viewBox="0 0 18 18" aria-hidden="true">
          {SQUARES.map((s, i) => (
            <g key={i}>
              <rect className={`mc-splash-fill${s.accent ? " is-accent" : ""}`} x={s.x} y={s.y} width="6" height="6"
                style={{ animationDelay: `${900 + i * 70}ms` }} />
              <rect className="mc-splash-line" x={s.x} y={s.y} width="6" height="6" pathLength="1"
                style={{ animationDelay: `${i * 140}ms, 1250ms` }} />
            </g>
          ))}
        </svg>
        <div className="mc-splash-word" aria-hidden="true">
          <div>
            <span className="mc-splash-letters">
              {[...WORD].map((ch, i) => (
                <span key={i} style={{ animationDelay: `${1750 + i * 45}ms` }}>{ch}</span>
              ))}
            </span>
            <span className="mc-splash-tagline" onAnimationEnd={() => setLanded(true)}>
              {tagline}
            </span>
          </div>
        </div>
      </div>
      <button ref={skipButton} type="button" className="mc-splash-skip" aria-label="Skip intro" onClick={() => setLeaving(true)}>
        Tap or press Esc to skip
      </button>
    </div>
  );
}
