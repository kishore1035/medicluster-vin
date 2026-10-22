import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import useBendingReel from "./useBendingReel";
import "./platform-reel.css";

const VIDEO_ID = "4LrQ8V6offk";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

export default function PlatformReel({ paused = false }: { paused?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const clipId = `medical-reel-${useId().replace(/:/g, "")}`;
  useBendingReel(stage, path, paused || playing);

  useEffect(() => { if (paused) setPlaying(false); }, [paused]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setPlaying(false);
    });
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  const close = () => {
    setPlaying(false);
    requestAnimationFrame(() => playButton.current?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    if (!playing) return;
    const screen = stage.current?.getBoundingClientRect();
    if (screen) {
      const headerBottom = document.querySelector(".download-header")?.getBoundingClientRect().bottom ?? 88;
      const top = headerBottom + Math.max(16, (innerHeight - headerBottom - screen.height) / 2);
      window.scrollTo({ top: scrollY + screen.top - top, behavior: "instant" });
    }
    closeButton.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    addEventListener("keydown", escape);
    return () => removeEventListener("keydown", escape);
  }, [playing]);

  return <section className="mc-platform-reel" id="care-story" aria-labelledby="care-story-title" data-playing={playing}>
    <div className="mc-container mc-platform-layout">
      <div className="mc-platform-heading" data-reveal data-depth="4"><p className="mc-section-label">A more connected way to care</p><h2 id="care-story-title">Different roles.<br />One shared <em>direction.</em></h2></div>
      <div className="mc-platform-intro" data-reveal data-depth="4">
        <p>We connect clinicians, patients, dispatchers and ambulance crews. From everyday health to the next emergency call, give every part of care a clear place to begin.</p>
        <a className="download-pill" href="#workspace-showcase-title">Explore the workspaces<ArrowUpRight size={18} aria-hidden="true" /></a>
      </div>
      <div className="mc-platform-film" role="group" aria-label="MediCluster platform preview" ref={stage} data-playing={playing}>
        <svg className="mc-reel-clip" aria-hidden="true" focusable="false" width="0" height="0"><defs><clipPath id={clipId} clipPathUnits="objectBoundingBox"><path ref={path} d="M.022 .018 H.978 Q1 .018 1 .04 V.96 Q1 .982 .978 .982 H.022 Q0 .982 0 .96 V.04 Q0 .018 .022 .018Z" /></clipPath></defs></svg>
        <div className="mc-platform-screen" style={{ clipPath: `url(#${clipId})` }}>
          {playing ? <iframe title="Cleveland Clinic Main Campus Tour" src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&rel=0&playsinline=1`} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            : <button ref={playButton} className="mc-platform-play" type="button" aria-label="Play medical reel" onClick={() => setPlaying(true)}>
              <img src="/images/medical-reel-poster.jpg" alt="Aerial view of Cleveland Clinic's main campus" loading="lazy" width="1280" height="720" />
              <span className="mc-platform-film-tint" aria-hidden="true" />
              <span className="mc-platform-play-label" aria-hidden="true"><span>PLAY</span><span>REEL</span></span>
              <span className="mc-platform-watch" aria-hidden="true">A closer look at care <ArrowUpRight size={18} /></span>
            </button>}
        </div>
        {playing && <button ref={closeButton} className="mc-platform-close" type="button" onClick={close} aria-label="Close medical reel"><X size={18} />Close film</button>}
      </div>
      <div className="mc-platform-credit"><span>Care in motion</span><a href={VIDEO_URL} target="_blank" rel="noreferrer">Cleveland Clinic · Main Campus Tour<ArrowUpRight size={13} aria-hidden="true" /></a></div>
    </div>
  </section>;
}
