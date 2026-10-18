import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Logo from "../components/Logo";
import { useInstallPrompt } from "../installPrompt";

export function Field({ label, aside, id, ...input }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <label htmlFor={id} className="text-slate-600">{label}</label>
        {aside}
      </div>
      <input
        id={id}
        {...input}
        className="h-11 px-3 rounded-[3px] border border-line-strong bg-surface text-sm text-ink outline-none focus:border-ink focus:shadow-[inset_0_0_0_0.5px_#15171a]"
      />
    </div>
  );
}

const linkCls = "text-blue-600 underline underline-offset-2 hover:text-ink";
const primaryBtn = "h-11 rounded-[3px] bg-ink text-paper text-sm font-medium hover:bg-slate-800 disabled:opacity-60";

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("signin"); // signin | request
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const install = useInstallPrompt();

  if (user) return <Navigate to={user.onboarded ? location.state?.from || "/" : "/onboarding"} replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = mode === "signin"
        ? await login(form.email, form.password)
        : await register(form.name, form.email, form.password);
      navigate(u.onboarded ? location.state?.from || "/" : "/onboarding", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || "Couldn't reach MediCluster. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next) => (e) => {
    e.preventDefault();
    setMode(next);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-paper text-ink">
      <aside className="hidden lg:flex flex-col justify-between bg-ink text-[#ecebe6] p-14">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-serif text-2xl">MediCluster</span>
        </div>
        <div className="flex flex-col gap-7">
          <p className="font-serif text-[44px] leading-[1.15] tracking-[-0.015em] max-w-[480px]">
            Patient risk stratification at scale.
          </p>
          <div className="flex gap-0.5 h-3.5 max-w-[420px]" aria-hidden="true">
            <div className="bg-risk-low" style={{ flex: 41 }} />
            <div className="bg-[#d5a640]" style={{ flex: 32 }} />
            <div className="bg-risk-high" style={{ flex: 20 }} />
            <div className="bg-[#d0433d] min-w-5" style={{ flex: 7 }} />
          </div>
          <p className="text-[15px] leading-relaxed text-[#b3b4b3] max-w-[420px]">
            Upload patient vitals, run unsupervised clustering, and instantly identify at-risk
            populations — no labels, no manual review.
          </p>
        </div>
        <span className="font-mono text-[11px] text-[#8a8c8e]">HIPAA-aligned · Data stays in your region</span>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-14">
        <form onSubmit={submit} className="w-full max-w-[360px] flex flex-col gap-[22px]" noValidate>
          <div className="lg:hidden flex items-center gap-2.5 text-ink">
            <Logo />
            <span className="font-serif text-2xl">MediCluster</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <h1 className="font-serif text-[32px] tracking-[-0.01em]">
              {mode === "signin" ? "Sign in" : "Request access"}
            </h1>
            <p className="text-sm text-slate-600">
              {mode === "signin" ? "Use your hospital account." : "Create an account with your hospital email."}
            </p>
          </div>

          {mode === "signin" && (
            <>
              <button
                type="button"
                disabled
                title="Single sign-on isn't configured for this deployment"
                className="h-11 rounded-[3px] border border-ink bg-transparent text-sm font-medium text-ink disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue with hospital SSO
              </button>
              <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
                <span className="flex-1 h-px bg-line" />OR<span className="flex-1 h-px bg-line" />
              </div>
            </>
          )}

          {mode === "request" && (
            <Field id="name" label="Full name" autoComplete="name" value={form.name} onChange={set("name")} required />
          )}
          <Field
            id="email" type="email" label="Work email" autoComplete="email"
            value={form.email} onChange={set("email")} required
          />
          <Field
            id="password" type="password" label="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={mode === "request" ? 8 : undefined}
            value={form.password} onChange={set("password")} required
            aside={mode === "signin" && (
              <a href="#" className={linkCls}
                onClick={(e) => { e.preventDefault(); setNotice("Ask your MediCluster administrator to reset your password."); }}>
                Forgot?
              </a>
            )}
          />

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {notice && <p role="status" className="text-sm text-slate-600">{notice}</p>}

          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <p className="text-[13px] text-slate-600">
            {mode === "signin" ? (
              <>New to MediCluster? <a href="#" className={linkCls} onClick={switchMode("request")}>Request access</a></>
            ) : (
              <>Already have an account? <a href="#" className={linkCls} onClick={switchMode("signin")}>Sign in</a></>
            )}
          </p>
          <a href="/download" className="text-[13px] text-slate-600 underline underline-offset-4">Explore MediCluster apps</a>

          {install && (
            <button type="button" onClick={install} className="btn-secondary h-10 text-[13px]">
              Install MediCluster app
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
