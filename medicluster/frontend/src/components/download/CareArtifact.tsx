import { useEffect, useRef } from "react";

/** Independent layers let the island float, follow the pointer and scroll. */
export default function CareArtifact({ paused }: { paused: boolean }) {
  const sceneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let x = 0;
    let y = 0;
    let inView = true;
    const paint = () => {
      frame = 0;
      scene.style.setProperty("--artifact-x", `${x * 18}px`);
      scene.style.setProperty("--artifact-y", `${y * 12}px`);
      scene.style.setProperty("--artifact-tilt", `${x * 2}deg`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const reset = () => {
      x = y = 0;
      schedule();
    };
    const move = (event: PointerEvent) => {
      if (paused || reduced.matches || event.pointerType === "touch") return;
      const rect = scene.getBoundingClientRect();
      x = (event.clientX - rect.left) / rect.width - 0.5;
      y = (event.clientY - rect.top) / rect.height - 0.5;
      schedule();
    };
    const visibility = () => {
      scene.dataset.sleep = String(!inView || document.hidden);
    };
    const motionChange = () => {
      if (reduced.matches) reset();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      visibility();
    });
    observer.observe(scene);
    scene.addEventListener("pointermove", move, { passive: true });
    scene.addEventListener("pointerleave", reset);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", motionChange);
    reset();
    visibility();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.removeEventListener("pointermove", move);
      scene.removeEventListener("pointerleave", reset);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", motionChange);
    };
  }, [paused]);

  return (
    <figure ref={sceneRef} className="mc-hero-artifact" data-paused={paused}>
      <div className="mc-artifact-stage">
        <svg
          className="mc-artifact-orbit"
          viewBox="0 0 700 700"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="350" cy="350" r="289" />
          <circle cx="350" cy="350" r="303" strokeDasharray="1 14" />
        </svg>
        <div className="mc-artifact-shadow" aria-hidden="true" />
        <div className="mc-artifact-scroll" data-hero-artifact-scroll>
          <div className="mc-artifact-pointer">
            <div className="mc-artifact-float">
              <img
                src="/images/care-island.webp"
                alt="A floating miniature clinic and olive courtyard, connected by delicate arcs — an illustration of connected care"
                width="1536"
                height="1024"
                loading="eager"
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>
      <figcaption>Care, connected.</figcaption>
    </figure>
  );
}
