import { useEffect, type RefObject } from "react";

/** Native scroll progression inspired by the local Yuva Garden reference. */
export function useSiteMotion(
  rootRef: RefObject<HTMLDivElement>,
  paused: boolean,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const progress = root.querySelector<HTMLElement>(".mc-scroll-progress");
    const heroImage = root.querySelector<HTMLElement>(
      "[data-hero-artifact-scroll]",
    );
    let frame = 0;
    const paint = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - innerHeight;
      const amount =
        scrollable > 0 ? Math.min(1, Math.max(0, scrollY / scrollable)) : 0;
      if (progress) progress.style.transform = `scaleX(${amount})`;
      if (paused || reduced.matches) return;
      if (heroImage) {
        const top = root.getBoundingClientRect().top;
        heroImage.style.transform = `translateY(${Math.min(35, Math.max(0, -top * 0.045))}px)`;
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const elements = root.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" },
    );
    const sync = () => {
      if (paused || reduced.matches) {
        elements.forEach((element) => element.classList.add("is-visible"));
        heroImage?.style.removeProperty("transform");
      }
      schedule();
    };
    elements.forEach((element) => {
      if (!paused && !reduced.matches) element.classList.add("will-reveal");
      observer.observe(element);
    });
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule, { passive: true });
    reduced.addEventListener("change", sync);
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      reduced.removeEventListener("change", sync);
      heroImage?.style.removeProperty("transform");
    };
  }, [rootRef, paused]);
}
