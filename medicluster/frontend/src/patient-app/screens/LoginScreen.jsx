import React, { useEffect, useRef, useState } from "react";
import { requestPatientCode, verifyPatientCode } from "../../api/apiClient";
import Logo from "../../components/Logo";
import AccessGuide from "../../components/AccessGuide";

const CODE_LEN = 6;

const errorText = (err, fallback) => err?.response?.data?.error || fallback;

/** Patient sign-in: mobile number, then the 6-digit code texted to it. */
export default function LoginScreen({ onSignedIn }) {
  const [step, setStep] = useState("mobile"); // mobile | code
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef();

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await requestPatientCode(mobile);
      setStep("code");
      setCode("");
      setResendIn(r.resendAfterSeconds ?? 30);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(errorText(err, "Couldn’t send the code. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (code.length !== CODE_LEN) return;
    setBusy(true);
    setError("");
    try {
      onSignedIn(await verifyPatientCode(mobile, code));
    } catch (err) {
      setError(errorText(err, "Couldn’t verify the code. Try again."));
      setBusy(false);
    }
  };

  const fieldCls = "h-[52px] border border-line-strong rounded bg-surface";

  if (step === "code") {
    const ok = code.length === CODE_LEN;
    return (
      <form onSubmit={verify} className="flex-1 overflow-y-auto px-6 pt-5 pb-7 flex flex-col gap-7">
        <button type="button" onClick={() => { setStep("mobile"); setError(""); }} className="self-start h-11 text-[15px]">← Back</button>
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-[38px] leading-[1.05] tracking-[-0.02em]">Enter the code</h1>
          <span className="text-[15px] text-slate-600">Sent to +91 {mobile}</span>
        </div>
        <label className="relative grid grid-cols-6 gap-2">
          <span className="sr-only">6-digit code</span>
          {Array.from({ length: CODE_LEN }, (_, i) => (
            <div key={i} aria-hidden="true"
              className={`h-[58px] grid place-items-center border rounded bg-surface font-mono text-2xl ${i === code.length ? "border-ink" : "border-line-strong"}`}>
              {code[i] || ""}
            </div>
          ))}
          <input ref={codeRef} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LEN))}
            inputMode="numeric" autoComplete="one-time-code" maxLength={CODE_LEN} autoFocus
            className="absolute inset-0 opacity-0 cursor-text" />
        </label>
        {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
        <button type="submit" disabled={!ok || busy}
          className={`h-[52px] rounded text-base font-medium ${ok ? "bg-ink text-paper" : "bg-sunken text-slate-500"}`}>
          {busy ? "Verifying…" : "Verify"}
        </button>
        {resendIn > 0 ? (
          <span className="text-[13px] text-slate-500">Didn’t get it? Resend in 0:{String(resendIn).padStart(2, "0")}</span>
        ) : (
          <button type="button" onClick={sendCode} disabled={busy} className="self-start text-[13px] text-blue-600 underline underline-offset-2">
            Resend code
          </button>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="flex-1 overflow-y-auto px-6 py-7 flex flex-col gap-7">
      <div className="flex items-center gap-[9px]">
        <Logo className="w-[18px] h-[18px] text-ink" />
        <span className="font-serif text-[21px] tracking-[-0.01em]">MediCluster</span>
      </div>
      <div className="flex flex-col gap-2 mt-9">
        <h1 className="font-serif text-[38px] leading-[1.05] tracking-[-0.02em]">Sign in</h1>
        <span className="text-[15px] text-slate-600 leading-snug">Your medicines, reminders and CliniQ.</span>
      </div>
      <div className="flex flex-col gap-[18px]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-slate-600">Mobile number</span>
          <div className={`flex items-center overflow-hidden ${fieldCls} focus-within:border-ink`}>
            <span className="h-full grid place-items-center px-3.5 border-r border-line font-mono text-[15px] text-slate-600">+91</span>
            <input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))}
              inputMode="tel" autoComplete="tel-national" placeholder="98450 12345"
              className="flex-1 min-w-0 h-full px-3.5 bg-transparent font-mono text-base focus:outline-none" />
          </div>
        </label>
        {error && <p role="alert" className="text-[13px] text-red-700">{error}</p>}
        <button type="submit" disabled={busy || mobile.replace(/\D/g, "").length !== 10}
          className="h-[52px] rounded bg-ink text-paper text-base font-medium disabled:opacity-50">
          {busy ? "Sending…" : "Send code"}
        </button>
        <span className="text-[13px] text-slate-500 leading-normal">
          We’ll text a 6-digit code to this number. Your clinic links your records to it.
        </span>
      </div>
      <AccessGuide current="patient" className="mt-4" />
    </form>
  );
}
