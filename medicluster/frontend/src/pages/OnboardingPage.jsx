import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { uploadDataset } from "../api/apiClient";
import { loadSampleDataset } from "../data/sampleDataset";

const ROLES = [
  { id: "physician",  label: "Physician",    desc: "Patients, predictions, imaging and clinical notes", tag: "MOST COMMON" },
  { id: "nurse",      label: "Nurse",        desc: "Ward lists, MEWS scoring and medication reminders" },
  { id: "analyst",    label: "Data analyst", desc: "Datasets, clustering runs and model comparison" },
  { id: "dispatcher", label: "Dispatcher",   desc: "Emergency requests, units and nearby hospitals" },
];

const DEPARTMENTS = [
  "Internal Medicine", "Cardiology", "Emergency Medicine", "Endocrinology",
  "Critical Care", "General Surgery", "Pediatrics", "Other",
];

// Clustering needs at least these vitals; each test matches common column names.
const REQUIRED = [
  { label: "age",            test: (c) => /^age$/.test(c) },
  { label: "blood pressure", test: (c) => /(^|_)(bp|systolic|diastolic|blood_?pressure)/.test(c) },
  { label: "glucose",        test: (c) => /glucose/.test(c) },
];

const STEPS = ["ROLE", "DATA"];
const linkCls = "text-blue-600 underline underline-offset-2 hover:text-ink";
const primaryBtn = "h-11 px-6 rounded-[3px] bg-ink text-paper text-sm font-medium hover:bg-slate-800 disabled:opacity-60";

// Greet by first name: a title like "Dr." would presume the role this step asks for.
const firstName = (name = "") => name.trim().split(/\s+/)[0] || "";

function Header({ step, onSkip }) {
  return (
    <header className="flex justify-between items-center gap-4 px-6 sm:px-14 py-[22px] border-b border-line">
      <span className="font-serif text-[21px]">MediCluster</span>
      <ol className="flex gap-7 font-mono text-[11px] tracking-[0.06em]">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}
            className={i < step ? "text-green-700" : i === step ? "text-ink" : "text-slate-500"}>
            {i < step ? `✓ ${s}` : `0${i + 1} ${s}`}
          </li>
        ))}
      </ol>
      <a href="#" className={`text-[13px] ${linkCls}`} onClick={(e) => { e.preventDefault(); onSkip(); }}>
        Skip for now
      </a>
    </header>
  );
}

function StepIntro({ step, title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[11px] tracking-[0.08em] text-slate-500">STEP {step + 1} OF {STEPS.length}</span>
      <h1 className="font-serif text-[40px] leading-[1.1] tracking-[-0.02em]">{title}</h1>
      <p className="text-[15px] text-slate-600">{children}</p>
    </div>
  );
}

function RoleStep({ user, onDone }) {
  const { updateProfile } = useAuth();
  const [role, setRole] = useState(user.role || "physician");
  const [department, setDepartment] = useState(user.department || DEPARTMENTS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ role, department });
      onDone();
    } catch (err) {
      setError(err?.response?.data?.error || "Couldn't save your role. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const name = firstName(user.name);
  return (
    <div className="w-full max-w-[640px] flex flex-col gap-[30px]">
      <StepIntro step={0} title={`What’s your role${name ? `, ${name}` : ""}?`}>
        We’ll set up your sidebar and alerts around how you work. You can change this later.
      </StepIntro>

      <fieldset className="flex flex-col border-t border-ink">
        <legend className="sr-only">Role</legend>
        {ROLES.map((r) => {
          const selected = role === r.id;
          return (
            <label key={r.id}
              className={`grid grid-cols-[20px_1fr_auto] gap-4 items-center py-4 cursor-pointer ${ selected ? "px-3 -mx-3 bg-ink text-paper rounded-sm" : "border-b border-line" }`}>
              <input type="radio" name="role" value={r.id} checked={selected}
                onChange={() => setRole(r.id)} className="sr-only peer" />
              <span aria-hidden="true"
                className={`w-3.5 h-3.5 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-ink/10 ${ selected ? "border-4 border-paper" : "border border-line-strong" }`} />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{r.label}</span>
                <span className={`text-[13px] ${selected ? "opacity-75" : "text-slate-500"}`}>{r.desc}</span>
              </span>
              <span className="font-mono text-[11px] opacity-75">{r.tag}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex gap-4 items-end">
        <div className="flex-1 flex flex-col gap-1.5">
          <label htmlFor="department" className="text-xs text-slate-600">Department</label>
          <select id="department" value={department} onChange={(e) => setDepartment(e.target.value)}
            className="h-11 px-3 rounded-[3px] border border-line-strong bg-surface text-sm text-ink outline-none focus:border-ink">
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <button type="button" onClick={save} disabled={busy} className={primaryBtn}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function DatasetStatus({ dataset }) {
  const columns = dataset.featureNames.map((c) => c.toLowerCase());
  const missing = REQUIRED.filter((r) => !columns.some(r.test));
  const found = REQUIRED.length - missing.length;
  return (
    <div className="flex flex-col gap-2.5 p-4 bg-surface border border-line rounded-[3px]">
      <div className="flex justify-between items-center gap-4 text-[13px]">
        <span>
          <span className="font-mono">{dataset.name}</span>{" "}
          <span className="text-slate-500">· {dataset.rowCount.toLocaleString()} rows</span>
        </span>
        <span className={`font-mono text-[11px] ${missing.length ? "text-orange-600" : "text-green-700"}`}>
          {found} OF {REQUIRED.length} REQUIRED VITALS FOUND
        </span>
      </div>
      <div className="h-1 bg-sunken" aria-hidden="true">
        <div className="h-full bg-ink" style={{ width: `${(found / REQUIRED.length) * 100}%` }} />
      </div>
      <span className="text-xs text-slate-500">
        {missing.length
          ? <>Missing: {missing.map((m) => m.label).join(", ")}. Clustering may be less reliable.</>
          : <>{dataset.featureNames.length} columns ready for clustering.</>}
      </span>
    </div>
  );
}

function DataStep({ onBack, onFinish }) {
  const fileRef = useRef();
  const [dataset, setDataset] = useState(null);
  const [busy, setBusy] = useState(null); // "csv" | "sample" | "finish"
  const [error, setError] = useState(null);

  const load = async (kind, fn) => {
    setBusy(kind);
    setError(null);
    try {
      setDataset(await fn());
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) load("csv", () => uploadDataset(file));
  };

  const finish = async () => {
    setBusy("finish");
    setError(null);
    try {
      await onFinish(dataset);
    } catch (err) {
      setError(err?.response?.data?.error || "Couldn't finish setup. Try again.");
      setBusy(null);
    }
  };

  const optionCls = "py-[22px] pb-6 flex flex-col gap-2.5 border-b border-line";
  const letterCls = "font-serif text-[30px] text-slate-500 leading-none";
  const actionCls = `text-[13px] mt-1.5 self-start ${linkCls} disabled:opacity-50 disabled:no-underline disabled:text-slate-500`;

  return (
    <div className="w-full max-w-[760px] flex flex-col gap-[30px]">
      <StepIntro step={1} title="Where do your patient vitals live?">
        MediCluster needs at least age, blood pressure and glucose to cluster patients.
      </StepIntro>

      <div className="grid sm:grid-cols-3 border-t border-ink">
        <div className={`${optionCls} sm:pr-6`}>
          <span className={letterCls}>A</span>
          <span className="font-semibold">Upload a CSV</span>
          <span className="text-[13px] text-slate-600 leading-normal">One row per patient, one column per vital.</span>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          <button type="button" className={actionCls} disabled={!!busy} onClick={() => fileRef.current.click()}>
            {busy === "csv" ? "Uploading…" : "Choose file"}
          </button>
        </div>
        <div className={`${optionCls} sm:px-6 sm:border-l`}>
          <span className={letterCls}>B</span>
          <span className="font-semibold">Connect your EHR</span>
          <span className="text-[13px] text-slate-600 leading-normal">FHIR R4 endpoint. Read-only, synced every hour.</span>
          <button type="button" className={actionCls} disabled title="EHR connections aren't available yet">
            Not available yet
          </button>
        </div>
        <div className={`${optionCls} sm:pl-6 sm:border-l`}>
          <span className={letterCls}>C</span>
          <span className="font-semibold">Try sample data</span>
          <span className="text-[13px] text-slate-600 leading-normal">100 synthetic patients with common vitals. Good for a first look.</span>
          <button type="button" className={actionCls} disabled={!!busy} onClick={() => load("sample", loadSampleDataset)}>
            {busy === "sample" ? "Loading…" : "Load sample"}
          </button>
        </div>
      </div>

      {dataset && <DatasetStatus dataset={dataset} />}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-between items-center">
        <a href="#" className={`text-sm ${linkCls}`} onClick={(e) => { e.preventDefault(); onBack(); }}>Back</a>
        <button type="button" onClick={finish} disabled={!!busy} className={primaryBtn}>
          {busy === "finish" ? "Finishing…" : dataset ? "Continue to dashboard" : "Finish"}
        </button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const complete = async (dataset) => {
    await updateProfile({ onboarded: true });
    navigate(dataset ? "/dashboard" : "/", { replace: true, state: dataset ? { dataset } : undefined });
  };

  const skip = () => complete(null).catch(() => navigate("/", { replace: true }));

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <Header step={step} onSkip={skip} />
      <main className="flex-1 flex justify-center px-6 pt-12 sm:pt-[72px] pb-12">
        {step === 0
          ? <RoleStep user={user} onDone={() => setStep(1)} />
          : <DataStep onBack={() => setStep(0)} onFinish={complete} />}
      </main>
    </div>
  );
}
