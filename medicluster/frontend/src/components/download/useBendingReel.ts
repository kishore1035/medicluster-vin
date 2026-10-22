import { useEffect, type RefObject } from "react";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Curved edges and a perspective surface share one scroll/pointer animation frame. */
export default function useBendingReel(stageRef: RefObject<HTMLDivElement>, pathRef: RefObject<SVGPathElement>, stopped: boolean) {
  useEffect(() => {
    const stage = stageRef.current;
    const path = pathRef.current;
    if (!stage || !path) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(pointer: fine)");
    let frame = 0, progress: number | null = null, lastY = scrollY;
    let mouseX = 0, mouseY = 0, x = 0, y = 0, velocity = 0;
    const draw = () => {
      frame = 0;
      const rect = stage.getBoundingClientRect();
      const enabled = !stopped && !reduced.matches;
      const mobile = innerWidth <= 760;
      const target = enabled ? clamp((innerHeight * .95 - rect.top) / (innerHeight * .95)) : 1;
      if (progress === null) progress = target;
      progress += (target - progress) * .13;
      x += (mouseX - x) * .1;
      y += (mouseY - y) * .1;
      velocity += ((scrollY - lastY) / 90 - velocity) * .12;
      lastY = scrollY;
      if (Math.abs(target - progress) < .0005) progress = target;
      const envelope = enabled ? Math.sin(progress * Math.PI) : 0;
      const bend = enabled ? Math.min(1, envelope * .85 + Math.abs(velocity) * .2 + Math.abs(x) * .12) * (mobile ? .4 : 1) : 0;
      const r = .022, topLeft = .018 + bend * .11, bottomLeft = .982 - bend * .12;
      // The top and bottom bow in opposite directions, like a flexible film sheet.
      path.setAttribute("d", `M${r} ${topLeft} C.32 ${topLeft + bend * .12} .68 ${.018 + bend * .06} ${1-r} .018 Q1 .018 1 ${.018+r} C${1-bend*.03} .34 ${1-bend*.04} .67 1 ${.982-r} Q1 .982 ${1-r} .982 C.68 ${.982-bend*.015} .32 ${bottomLeft+bend*.05} ${r} ${bottomLeft} Q0 ${bottomLeft} 0 ${bottomLeft-r} C${bend*.055} .67 ${bend*.055} .34 0 ${topLeft+r} Q0 ${topLeft} ${r} ${topLeft} Z`);
      stage.dataset.reelMotion = enabled ? "on" : "off";
      stage.style.setProperty("--reel-width", enabled && !mobile ? `${(53 + progress * 47).toFixed(3)}%` : "100%");
      stage.style.setProperty("--reel-turn-x", `${enabled ? envelope * 7 - y * 5 : 0}deg`);
      stage.style.setProperty("--reel-turn-y", `${enabled ? -envelope * 7 + x * 7 : 0}deg`);
      stage.style.setProperty("--reel-turn-z", `${enabled ? -envelope * 3.5 + x : 0}deg`);
      stage.style.setProperty("--reel-image-x", `${enabled ? -x * 18 : 0}px`);
      stage.style.setProperty("--reel-image-y", `${enabled ? -y * 12 : 0}px`);
      if (enabled && (progress !== target || Math.abs(mouseX-x) > .001 || Math.abs(mouseY-y) > .001 || Math.abs(velocity) > .001)) frame = requestAnimationFrame(draw);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const move = (event: PointerEvent) => {
      if (!fine.matches || event.pointerType === "touch") return;
      const rect = stage.getBoundingClientRect();
      mouseX = clamp((event.clientX - rect.left) / rect.width) - .5;
      mouseY = clamp((event.clientY - rect.top) / rect.height) - .5;
      schedule();
    };
    const leave = () => { mouseX = 0; mouseY = 0; schedule(); };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule, { passive: true });
    stage.addEventListener("pointermove", move, { passive: true });
    stage.addEventListener("pointerleave", leave, { passive: true });
    reduced.addEventListener("change", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
      reduced.removeEventListener("change", schedule);
    };
  }, [stageRef, pathRef, stopped]);
}
