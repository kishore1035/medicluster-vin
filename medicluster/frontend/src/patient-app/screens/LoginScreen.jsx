import React, { useEffect, useRef, useState } from "react";
import {
  requestPatientCode, verifyPatientCode, getPatientAuthConfig,
  requestPatientEmailCode, verifyPatientEmailCode, exchangePatientGoogleCode,
} from "../../api/apiClient";
import Logo from "../../components/Logo";
import PatientDownload from "../PatientDownload";
import { isPatientAndroid } from "../patientPlatform";
import { createGoogleHandoff, createGoogleCallbackTask, googleAuthError, subscribeGoogleSignInRecovery } from "../patientAuth";

const CODE_LEN = 6;
const fieldCls = "h-[52px] border border-line-strong rounded bg-surface";
const errorText = (err, fallback) => err?.response?.data?.error || fallback;

function GoogleLogo() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
    <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h10.99a9.4 9.4 0 0 1-4.07 6.18v5.14h6.6c3.86-3.56 6.09-8.8 6.09-14.82Z" />
    <path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.51-4.96l-6.6-5.14c-1.83 1.23-4.17 1.98-6.91 1.98-5.31 0-9.82-3.59-11.43-8.43H5.75v5.29A20 20 0 0 0 24 44Z" />
    <path fill="#FBBC05" d="M12.57 27.45A12 12 0 0 1 11.94 24c0-1.2.22-2.36.63-3.45v-5.29H5.75A20 20 0 0 0 4 24c0 3.22.77 6.27 2.15 8.97l6.42-5.52Z" />
    <path fill="#EA4335" d="M24 12.12c3 0 5.69 1.03 7.81 3.05l5.86-5.86C34.12 6 29.51 4 24 4A20 20 0 0 0 5.75 15.26l6.82 5.29C14.18 15.71 18.69 12.12 24 12.12Z" />
  </svg>;
}

/** Patient sign-in with a clinic-linked email, Google account or mobile number. */
export default function LoginScreen({ onSignedIn }) {
  const [method, setMethod] = useState("email");
  const [step, setStep] = useState("address");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [googlePhase, setGooglePhase] = useState("idle");
  const [error, setError] = useState("");
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const callbackTask = useRef(null);
  const codeRef = useRef(null);
  const isEmail = method === "email";
  const googleBusy = googlePhase !== "idle";
  const enabled = config?.[isEmail ? "email" : "sms"] === true;
  const validAddress = isEmail ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) : mobile.replace(/\D/g, "").length === 10;

  useEffect(() => subscribeGoogleSignInRecovery(setGooglePhase), []);

  useEffect(() => {
    let active = true;
    setConfigError(false);
    getPatientAuthConfig().then((value) => {
      if (active) setConfig(value);
    }).catch(() => { if (active) setConfigError(true); });
    return () => { active = false; };
  }, [configAttempt]);

  useEffect(() => {
    // Keep the promise in a ref: StrictMode cleans up the first subscriber,
    // then the second subscriber still receives the same one-time exchange.
    callbackTask.current ??= createGoogleCallbackTask({ exchange: exchangePatientGoogleCode });
    const task = callbackTask.current();
    if (!task) return undefined;
    let active = true;
    setGooglePhase("exchange");
    task.then((session) => {
      if (active) onSignedIn(session);
    }).catch((err) => {
      if (active) setError(err?.response ? googleAuthError(err.response.data?.error) : err.message || googleAuthError());
    }).finally(() => { if (active) setGooglePhase("idle"); });
    return () => { active = false; };
  }, [onSignedIn]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const sendCode = async (event) => {
    event?.preventDefault();
    if (!enabled || busy || googleBusy || !validAddress) return;
    setBusy(true);
    setError("");
    try {
      const response = await (isEmail ? requestPatientEmailCode(email.trim()) : requestPatientCode(mobile));
      if (response.sent !== true) throw new Error("Code delivery was not confirmed");
      setStep("code");
      setCode("");
      setResendIn(Number.isFinite(response.resendAfterSeconds) ? Math.max(0, Math.ceil(response.resendAfterSeconds)) : 30);
    } catch (err) {
      setError(errorText(err, "Couldn’t send the code. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    if (code.length !== CODE_LEN || busy || googleBusy) return;
    setBusy(true);
    setError("");
    try {
      onSignedIn(await (isEmail ? verifyPatientEmailCode(email.trim(), code) : verifyPatientCode(mobile, code)));
    } catch (err) {
      setError(errorText(err, "Couldn’t verify the code. Try again."));
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    if (!config?.google || busy || googleBusy) return;
    setGooglePhase("preparing");
    setError("");
    try {
      const path = await createGoogleHandoff({ platform: isPatientAndroid() ? "android" : "web" });
      setGooglePhase("outbound");
      window.location.assign(path);
    } catch (err) {
      setError(err.message || googleAuthError());
      setGooglePhase("idle");
    }
  };

  if (step === "code") {
    const ok = code.length === CODE_LEN;
    return (
      <form onSubmit={verify} className="flex-1 overflow-y-auto px-6 pt-5 pb-7 flex flex-col gap-7" aria-busy={busy}>
        <button type="button" disabled={busy} onClick={() => { setStep("address"); setError(""); }} className="self-start h-11 text-[15px]">← Back</button>
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-[38px] leading-[1.05] tracking-[-0.02em]">Enter the code</h1>
          <span className="text-[15px] text-slate-600 break-words">Code requested for {isEmail ? email.trim() : `+91 ${mobile}`}. {isEmail ? "Check your inbox and spam folder." : "It may take a moment to arrive."}</span>
        </div>
        <label className="relative grid grid-cols-6 gap-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-ink rounded">
          <span className="sr-only">6-digit code</span>
          {Array.from({ length: CODE_LEN }, (_, i) => (
            <div key={i} aria-hidden="true"
              className={`h-[58px] grid place-items-center border rounded bg-surface font-mono text-2xl ${i === code.length ? "border-ink" : "border-line-strong"}`}>
              {code[i] || ""}
            </div>
          ))}
          <input ref={codeRef} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LEN))}
            inputMode="numeric" autoComplete="one-time-code" maxLength={CODE_LEN} disabled={busy}
            className="absolute inset-0 opacity-0 cursor-text" />
        </label>
        {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
        <button type="submit" disabled={!ok || busy}
          className={`h-[52px] rounded text-base font-medium disabled:opacity-50 ${ok ? "bg-ink text-paper" : "bg-sunken text-slate-500"}`}>
          {busy ? "Verifying…" : "Verify"}
        </button>
        {resendIn > 0 ? (
          <span className="text-[13px] text-slate-500">Didn’t get it? Resend in {Math.floor(resendIn / 60)}:{String(resendIn % 60).padStart(2, "0")}</span>
        ) : (
          <button type="button" onClick={sendCode} disabled={busy || !enabled} className="self-start min-h-11 text-[13px] text-blue-600 underline underline-offset-2 disabled:opacity-50">
            Resend code
          </button>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="flex-1 overflow-y-auto px-6 py-7 flex flex-col gap-6" aria-busy={busy || googleBusy}>
      <div className="flex items-center gap-[9px]">
        <Logo className="w-[18px] h-[18px] text-ink" />
        <span className="font-serif text-[21px] tracking-[-0.01em]">MediCluster</span>
      </div>
      <div className="flex flex-col gap-2 mt-5">
        <h1 className="font-serif text-[38px] leading-[1.05] tracking-[-0.02em]">Sign in</h1>
        <span className="text-[15px] text-slate-600 leading-snug">Your medicines, reminders and CliniQ.</span>
      </div>
      <div className="flex flex-col gap-4">
        <button type="button" onClick={signInWithGoogle} disabled={!config?.google || busy || googleBusy}
          className="h-[52px] shrink-0 flex items-center justify-center gap-3 rounded border border-line-strong bg-surface text-[15px] font-medium disabled:opacity-50">
          <GoogleLogo />{googleBusy ? "Signing in…" : "Continue with Google"}
        </button>
        {googlePhase === "outbound" && <button type="button" onClick={() => setGooglePhase("idle")}
          className="min-h-11 text-[13px] text-blue-600 underline underline-offset-2">Cancel Google sign-in</button>}
        {config && !config.google && <p className="text-[13px] text-slate-600">Google sign-in is currently unavailable. Use a code below.</p>}
        <div className="flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-line" />or use a code<span className="h-px flex-1 bg-line" /></div>
        <div className="grid grid-cols-2 p-1 rounded bg-sunken" role="group" aria-label="Code delivery method">
          {[['email', 'Email'], ['sms', 'SMS']].map(([value, label]) => <button key={value} type="button" aria-pressed={method === value} disabled={busy || googleBusy}
            onClick={() => { setMethod(value); setError(""); }}
            className={`h-11 rounded text-sm ${method === value ? "bg-surface shadow-sm font-medium" : "text-slate-600"}`}>{label}</button>)}
        </div>
        {isEmail ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-slate-600">Email address</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false}
              placeholder="you@example.com" required disabled={busy || googleBusy}
              className={`${fieldCls} px-3.5 text-base focus:outline-none focus:border-ink`} />
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-slate-600">Mobile number</span>
            <div className={`flex items-center overflow-hidden ${fieldCls} focus-within:border-ink`}>
              <span className="h-full grid place-items-center px-3.5 border-r border-line font-mono text-[15px] text-slate-600">+91</span>
              <input value={mobile} onChange={(event) => setMobile(event.target.value.replace(/[^\d ]/g, "").slice(0, 11))}
                inputMode="tel" autoComplete="tel-national" placeholder="98450 12345" disabled={busy || googleBusy}
                className="flex-1 min-w-0 h-full px-3.5 bg-transparent font-mono text-base focus:outline-none" />
            </div>
          </label>
        )}
        {!config && !configError && <p role="status" className="text-[13px] text-slate-600">Checking sign-in options…</p>}
        {configError && <div role="alert" className="text-[13px] text-red-700">
          <p>Couldn’t load sign-in options. Check your connection.</p>
          <button type="button" onClick={() => setConfigAttempt((attempt) => attempt + 1)} className="min-h-11 underline underline-offset-2">Retry sign-in options</button>
        </div>}
        {config && !enabled && <p role="status" className="text-[13px] text-slate-600">{isEmail ? "Email" : "SMS"} sign-in is currently unavailable. Try another option or contact your clinic.</p>}
        {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
        <button type="submit" disabled={busy || googleBusy || !enabled || !validAddress}
          className="h-[52px] shrink-0 rounded bg-ink text-paper text-base font-medium disabled:opacity-50">
          {busy ? "Sending…" : isEmail ? "Email me a code" : "Send SMS code"}
        </button>
        <span className="text-[13px] text-slate-500 leading-normal">
          {isEmail ? "Use the email your clinic linked to your records. We’ll send a 6-digit code." : "We’ll text a 6-digit code to this number. Your clinic links your records to it."}
        </span>
      </div>
      {!isPatientAndroid() && <PatientDownload />}
    </form>
  );
}
