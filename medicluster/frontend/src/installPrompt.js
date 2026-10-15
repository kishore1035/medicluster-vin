import { useEffect, useState } from "react";

// Chrome fires `beforeinstallprompt` once, often before React mounts, so capture it at import time.
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(deferred));

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** Returns an install() function when the browser offers installation, otherwise null. */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(deferred);
  useEffect(() => {
    listeners.add(setPrompt);
    return () => listeners.delete(setPrompt);
  }, []);
  if (!prompt) return null;
  return async () => {
    prompt.prompt();
    await prompt.userChoice;
    deferred = null;
    notify();
  };
}
