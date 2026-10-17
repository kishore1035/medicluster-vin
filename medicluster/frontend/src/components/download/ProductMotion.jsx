import React, { useEffect, useRef } from "react";

// Decorative motion stays outside React's render cycle and stops offscreen.
export function ReactiveBackdrop({ paused = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const host = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(pointer: fine)");
    const pointer = { x: -1000, y: -1000 };
    let width = 0, height = 0, frame = 0, visible = false, tick = 0;
    const colors = ["#9872e9", "#6b9ff4", "#ffad7b"];
    const particles = Array.from({ length: 72 }, (_, i) => ({
      x: ((i * 0.61803398875) % 1), y: ((i * 0.41421356237 + 0.1) % 1),
      angle: i * 2.4, color: colors[i % 3], dx: 0, dy: 0,
    }));
    function paint() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p, i) => {
        const x = p.x * width, y = p.y * height;
        const distance = Math.hypot(x - pointer.x, y - pointer.y);
        const force = fine.matches && !reduced.matches && !paused ? Math.max(0, 1 - distance / 180) : 0;
        const angle = Math.atan2(y - pointer.y, x - pointer.x);
        p.dx += (Math.cos(angle) * force * 65 - p.dx) * 0.07;
        p.dy += (Math.sin(angle) * force * 65 - p.dy) * 0.07;
        // Leave the headline area quiet, with particles concentrated around its edges.
        ctx.globalAlpha = x > width * .19 && x < width * .81 && y > height * .22 && y < height * .76 ? .16 : .7;
        ctx.save();
        ctx.translate(x + p.dx, y + p.dy + (reduced.matches || paused ? 0 : Math.sin(tick * .008 + i) * 7));
        ctx.rotate(p.angle + (reduced.matches || paused ? 0 : tick * .001));
        ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 3); ctx.stroke(); ctx.restore();
      });
    }
    function animate() { tick++; paint(); frame = requestAnimationFrame(animate); }
    function sync() {
      cancelAnimationFrame(frame);
      host.classList.toggle("is-motion-active", visible && !document.hidden && !reduced.matches && !paused);
      host.style.setProperty("--pointer-x", "0");
      host.style.setProperty("--pointer-y", "0");
      if (visible && !document.hidden && !reduced.matches && !paused) frame = requestAnimationFrame(animate);
      else paint();
    }
    const resize = new ResizeObserver(() => {
      width = host.clientWidth; height = host.clientHeight;
      const scale = Math.min(devicePixelRatio || 1, 2);
      canvas.width = width * scale; canvas.height = height * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0); paint();
    });
    resize.observe(host);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(host);
    const move = (event) => {
      if (!fine.matches || reduced.matches || paused) return;
      const box = host.getBoundingClientRect();
      pointer.x = event.clientX - box.left; pointer.y = event.clientY - box.top;
      host.style.setProperty("--pointer-x", String((pointer.x / width - .5) * 2));
      host.style.setProperty("--pointer-y", String((pointer.y / height - .5) * 2));
    };
    const leave = () => { pointer.x = -1000; pointer.y = -1000; host.style.setProperty("--pointer-x", "0"); host.style.setProperty("--pointer-y", "0"); };
    host.addEventListener("pointermove", move); host.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", sync); reduced.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect();
      host.classList.remove("is-motion-active");
      host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", sync); reduced.removeEventListener("change", sync);
    };
  }, [paused]);
  return <canvas ref={ref} className="download-particle-canvas" aria-hidden="true" />;
}

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
