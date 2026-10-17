import React, { useEffect, useRef } from "react";

export function ProductCard({ app, children, paused = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches || !globalThis.IntersectionObserver) return undefined;
    // Enable the reveal only after observation exists; HTML remains visible without JS.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { node.classList.add("is-revealed"); observer.disconnect(); }
    }, { threshold: .12 });
    node.classList.add("will-reveal"); observer.observe(node);
    const change = () => { if (motion.matches) { node.classList.add("is-revealed"); observer.disconnect(); } };
    motion.addEventListener("change", change);
    return () => { observer.disconnect(); motion.removeEventListener("change", change); };
  }, []);
  const reset = () => { ref.current.style.removeProperty("--tilt-x"); ref.current.style.removeProperty("--tilt-y"); ref.current.classList.remove("is-tilting"); };
  useEffect(() => { if (paused) reset(); }, [paused]);
  const tilt = (event) => {
    if (paused || event.pointerType !== "mouse" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const node = ref.current, box = node.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
    node.style.setProperty("--tilt-x", `${(0.5 - y) * 6}deg`);
    node.style.setProperty("--tilt-y", `${(x - .5) * 6}deg`);
    node.style.setProperty("--shine-x", `${x * 100}%`);
    node.style.setProperty("--shine-y", `${y * 100}%`);
    node.classList.add("is-tilting");
  };
  return <article ref={ref} className={`download-app-card download-card-${app.id}`} id={app.id} aria-labelledby={`${app.id}-title`} onPointerMove={tilt} onPointerLeave={reset} onPointerCancel={reset}>
    <div className="download-card-surface">{children}</div>
  </article>;
}
