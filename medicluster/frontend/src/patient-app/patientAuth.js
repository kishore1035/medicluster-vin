const GOOGLE_PROOF_KEY = "medicluster.patientGoogle.v1";
const HANDOFF_LIFETIME_MS = 10 * 60 * 1000;
const HEX_64 = /^[a-f0-9]{64}$/;

export function googleAuthError(reason) {
  const messages = {
    google_cancelled: "Google sign-in was cancelled. You can try again or use a code.",
    patient_not_linked: "Your clinic hasn’t linked this email to your patient records yet. Contact your clinic or try SMS.",
    google_email_unverified: "Please verify your email with Google before signing in, or use an email code.",
    google_email_not_authoritative: "Please use an email code to confirm this address and sign in.",
    google_identity_conflict: "This Google account couldn’t be matched to your patient records. Contact your clinic or use an email code.",
    google_not_configured: "Google sign-in is currently unavailable. Try an email code or SMS.",
  };
  return messages[reason] || "Couldn’t sign in with Google. Please try again or use a code.";
}

/** Persist proof in the WebView before opening Google's system-browser flow. */
export async function createGoogleHandoff({ storage, crypto = globalThis.crypto, now = Date.now(), platform = "web" } = {}) {
  if (!crypto?.getRandomValues || !crypto?.subtle) {
    throw new Error("Google sign-in needs a secure connection. Try an email code or SMS.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...hash)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    (storage ?? globalThis.localStorage).setItem(GOOGLE_PROOF_KEY, JSON.stringify({ verifier, createdAt: now }));
  } catch {
    throw new Error("Please allow browser storage to sign in with Google, or use a code.");
  }
  return `/api/patient-auth/google/start?handoff_challenge=${challenge}&platform=${platform === "android" ? "android" : "web"}`;
}

/** Remove callback credentials synchronously, before any network request. */
export function consumeGoogleCallback({ location = globalThis.location, history = globalThis.history, storage, exchange, now = Date.now() } = {}) {
  const url = new URL(location.href);
  if (!url.searchParams.has("patient_auth_code") && !url.searchParams.has("auth_error")) return null;
  const code = url.searchParams.get("patient_auth_code");
  const error = url.searchParams.get("auth_error");
  url.searchParams.delete("patient_auth_code");
  url.searchParams.delete("auth_error");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return (async () => {
    let proof;
    try {
      const targetStorage = storage ?? globalThis.localStorage;
      const raw = targetStorage.getItem(GOOGLE_PROOF_KEY);
      targetStorage.removeItem(GOOGLE_PROOF_KEY);
      proof = raw ? JSON.parse(raw) : null;
    } catch { /* Missing or inaccessible proof cannot authorize the exchange. */ }
    if (error !== null) throw new Error(googleAuthError(error));
    if (!HEX_64.test(code || "") || !HEX_64.test(proof?.verifier || "")
      || !Number.isFinite(proof?.createdAt) || now < proof.createdAt || now - proof.createdAt >= HANDOFF_LIFETIME_MS) {
      throw new Error("Please start Google sign-in again. This sign-in request has expired.");
    }
    return exchange(code, proof.verifier);
  })();
}

/** One task survives React StrictMode's effect setup / cleanup / setup cycle. */
export function createGoogleCallbackTask(options) {
  let started = false;
  let task;
  return () => {
    if (!started) {
      started = true;
      task = consumeGoogleCallback(options);
    }
    return task;
  };
}

/** Returning from an external browser can happen without a Google callback. */
export function subscribeGoogleSignInRecovery(setPhase, target = globalThis.window) {
  const recover = () => setPhase((phase) => phase === "outbound" ? "idle" : phase);
  const events = ["medicluster:patient-resumed", "pageshow", "focus"];
  for (const event of events) target.addEventListener(event, recover);
  return () => {
    for (const event of events) target.removeEventListener(event, recover);
  };
}
