import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getMediaFileUrl, getPatientClusterHistory, getPatientProfile, listPatientMedia, listReminders, updatePatientProfile } from "../api/apiClient";
import {
  TIER_RANK, VITALS, adherence7d, flagReason, fmtVital, loadLatestRuns, runId, shortDate, vitalStatus,
} from "../data/clinical";
import { Page, Section, Tag, linkCls } from "../components/ui";

const TIER_BAR = { Low: "bg-risk-low", Moderate: "bg-risk-moderate", High: "bg-risk-high", Critical: "bg-risk-critical" };
const STATUS_TEXT = { High: "text-red-700", Low: "text-amber-700", Normal: "text-green-700" };

function sexLabel(g) {
  const s = String(g || "").toLowerCase();
  return s.startsWith("f") ? "F" : s.startsWith("m") ? "M" : "";
}

// ── Roster ────────────────────────────────────────────────────────────────────
function Roster({ patients, selectedId, onPick }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const rows = term ? patients.filter((p) => String(p.patient_id).toLowerCase().includes(term)) : patients;

  const submit = (e) => {
    e.preventDefault();
    if (term && !rows.length) onPick(q.trim());
    else if (rows.length) onPick(rows[0].patient_id);
  };

  return (
    <div className="flex flex-col gap-5 min-w-0">
      <form onSubmit={submit}>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients"
          placeholder={patients.length ? `Search ${patients.length.toLocaleString()} patients` : "Patient ID"}
          className="h-9 w-full px-3 border border-line-strong rounded-[3px] bg-surface text-[13px] focus:outline-none focus:border-ink" />
      </form>
      {patients.length > 0 && (
        <div>
          <div className="flex justify-between eyebrow pb-2 border-b border-ink"><span>Patient</span><span>Tier</span></div>
          <ul className="max-h-[70vh] overflow-y-auto" aria-label="Patients">
            {rows.slice(0, 200).map((p) => {
              const on = p.patient_id === selectedId;
              return (
                <li key={p.patient_id}>
                  <button type="button" onClick={() => onPick(p.patient_id)} aria-current={on ? "true" : undefined}
                    className={`w-full flex justify-between items-center gap-3 px-2 py-2.5 border-b border-line text-left ${on ? "bg-ink text-paper" : "hover:bg-sunken"}`}>
                    <span className="flex flex-col min-w-0">
                      <span className="text-[13.5px] font-medium">{p.patient_id}</span>
                      <span className={`font-mono text-[11px] ${on ? "text-paper/70" : "text-slate-500"}`}>
                        {[p.age != null && `${Math.round(p.age)}${sexLabel(p.gender)}`, `C${p.cluster_id}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <Tag tone={p.risk_tier} className={on ? "!border-paper !text-paper" : ""} />
                  </button>
                </li>
              );
            })}
            {rows.length === 0 && <li className="py-3 text-[13px] text-slate-500">No match. Press Enter to open “{q.trim()}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Profile pieces ────────────────────────────────────────────────────────────
function RangeBar({ v, value }) {
  const [a, b] = v.axis;
  const pos = (x) => `${Math.max(0, Math.min(100, ((x - a) / (b - a)) * 100))}%`;
  const status = vitalStatus(v, value);
  return (
    <div className="relative h-3" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
      <div className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-risk-low/30" style={{ left: pos(v.ref[0]), width: `calc(${pos(v.ref[1])} - ${pos(v.ref[0])})` }} />
      {typeof value === "number" && (
        <div className={`absolute top-0 h-3 w-0.5 ${status === "Normal" ? "bg-risk-low" : "bg-risk-high"}`} style={{ left: pos(value) }} />
      )}
    </div>
  );
}

function VitalsTable({ patient }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[560px]">
        <thead>
          <tr className="eyebrow text-left border-b border-ink">
            <th className="py-2 font-normal">Measure</th>
            <th className="py-2 font-normal text-right pr-4">Value</th>
            <th className="py-2 font-normal w-[38%]">Reference range</th>
            <th className="py-2 font-normal pl-4">Ref</th>
            <th className="py-2 font-normal text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {VITALS.map((v) => {
            const value = patient[v.key];
            const status = vitalStatus(v, value);
            return (
              <tr key={v.key} className="border-b border-line">
                <td className="py-3">{v.label}</td>
                <td className="py-3 text-right pr-4 whitespace-nowrap">
                  <span className="font-mono text-[16px]">{fmtVital(v, value)}</span>
                  <span className="text-[11px] text-slate-500 ml-1">{v.unit}</span>
                </td>
                <td className="py-3"><RangeBar v={v} value={value} /></td>
                <td className="py-3 pl-4 font-mono text-slate-500 whitespace-nowrap">{v.ref[0]}–{v.ref[1]}</td>
                <td className={`py-3 text-right font-mono text-[11px] tracking-[0.04em] uppercase ${STATUS_TEXT[status] ?? "text-slate-500"}`}>
                  {status ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function History({ clusterHistory, media }) {
  const events = [
    ...clusterHistory.map((h) => ({
      at: h.createdAt, key: `c-${h.resultId}`,
      text: `Assigned ${h.risk_tier} tier, cluster C${h.cluster_id}`,
      src: `Clustering · ${runId({ _id: h.resultId })}`,
      to: `/results/${h.resultId}`,
    })),
    ...media.map((m) => ({
      at: m.uploadedAt, key: `m-${m.fileId}`,
      text: `Uploaded ${m.filename}`,
      src: "Imaging",
      href: getMediaFileUrl(m.fileId),
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <Section title="History">
      {events.length === 0 && <p className="py-3 text-[13px] text-slate-500">No clustering runs or uploads yet.</p>}
      <ol className="pt-1">
        {events.map((e, i) => (
          <li key={e.key} className="grid grid-cols-[56px_12px_minmax(0,1fr)] gap-3 pt-3">
            <span className="font-mono text-xs text-slate-500">{shortDate(e.at)}</span>
            <span className="flex flex-col items-center" aria-hidden="true">
              <span className="w-2 h-2 bg-ink mt-1" />
              {i < events.length - 1 && <span className="flex-1 w-px bg-line-strong mt-1" />}
            </span>
            <span className="flex flex-col gap-0.5 pb-2 min-w-0">
              {e.to ? <Link to={e.to} className="text-[13.5px] hover:underline">{e.text}</Link>
                : <a href={e.href} target="_blank" rel="noreferrer" className="text-[13.5px] hover:underline truncate">{e.text}</a>}
              <span className="text-xs text-slate-500">{e.src}</span>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Medications({ reminders, patientId }) {
  return (
    <Section title="Medications" aside={<span className="eyebrow">7-day adherence</span>}>
      {reminders.length === 0 && (
        <p className="py-3 text-[13px] text-slate-500">
          No medication schedules. <Link to={`/reminders/${encodeURIComponent(patientId)}`} className={linkCls}>Add one</Link>
        </p>
      )}
      {reminders.map((r) => {
        const pct = adherence7d(r);
        const tone = pct == null ? "" : pct >= 0.9 ? "bg-risk-low" : pct >= 0.75 ? "bg-risk-moderate" : "bg-risk-high";
        return (
          <div key={r._id} className="grid grid-cols-[minmax(0,1fr)_60px_44px] gap-3 items-center py-3 border-b border-line">
            <span className="flex flex-col min-w-0">
              <span className="text-[13.5px] truncate">{r.medicationName} <span className="font-mono text-slate-500 text-xs">{r.dosage}</span></span>
              <span className="text-xs text-slate-500">
                {[r.times?.length ? `${r.times.length}× ${r.frequency}` : r.frequency, !r.active && "paused"].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="h-1 bg-sunken" aria-hidden="true"><span className={`block h-full ${tone}`} style={{ width: `${(pct ?? 0) * 100}%` }} /></span>
            <span className="font-mono text-[13px] text-right">{pct == null ? "—" : `${Math.round(pct * 100)}%`}</span>
          </div>
        );
      })}
    </Section>
  );
}

// Links the mobile number the patient signs in to the patient app with.
function AppSignIn({ patientId }) {
  const [saved, setSaved] = useState("");
  const [value, setValue] = useState("");
  const [state, setState] = useState({ busy: false, error: "", ok: false });

  useEffect(() => {
    let alive = true;
    getPatientProfile(patientId).then((p) => { if (alive) { setSaved(p?.mobile || ""); setValue(p?.mobile || ""); } }).catch(() => {});
    return () => { alive = false; };
  }, [patientId]);

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: "", ok: false });
    try {
      const p = await updatePatientProfile(patientId, { mobile: value.trim() });
      setSaved(p.mobile || "");
      setValue(p.mobile || "");
      setState({ busy: false, error: "", ok: true });
    } catch (err) {
      setState({ busy: false, error: err?.response?.data?.error || "Couldn’t save the number.", ok: false });
    }
  };

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
      <label htmlFor="app-mobile" className="text-slate-600">Patient app sign-in</label>
      <span className="font-mono text-slate-500">+91</span>
      <input id="app-mobile" value={value} onChange={(e) => { setValue(e.target.value); setState((s) => ({ ...s, ok: false })); }}
        inputMode="tel" placeholder="Mobile number"
        className="h-8 w-36 bg-transparent border-b border-line-strong font-mono focus:outline-none focus:border-ink" />
      <button type="submit" disabled={state.busy || value.trim() === saved} className={`${linkCls} disabled:opacity-40 disabled:no-underline`}>
        {state.busy ? "Saving…" : saved && !value.trim() ? "Unlink" : "Save"}
      </button>
      {state.ok && <span className="text-green-700">{saved ? "Linked" : "Unlinked"}</span>}
      {state.error && <span role="alert" className="text-red-700">{state.error}</span>}
    </form>
  );
}

function summarize(history, patient) {
  const tiers = [...history].reverse().map((h) => h.risk_tier).filter((t) => TIER_RANK[t]);
  const drivers = patient ? flagReason(patient, "") : "";
  const why = drivers ? `, driven by ${drivers}` : "";
  if (tiers.length < 2) return tiers.length ? `Currently ${tiers[0]} risk${why}.` : null;
  const first = tiers[0], last = tiers[tiers.length - 1];
  const span = `${tiers.length} runs`;
  if (first === last) return `Risk steady at ${last} across ${span}${why}.`;
  return `Risk ${TIER_RANK[last] > TIER_RANK[first] ? "rose" : "fell"} from ${first} to ${last} over ${span}${why}.`;
}

function Profile({ patientId, patient }) {
  const [clusterHistory, setClusterHistory] = useState([]);
  const [media, setMedia] = useState([]);
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    let alive = true;
    setClusterHistory([]); setMedia([]); setReminders([]);
    getPatientClusterHistory(patientId).then((h) => alive && setClusterHistory(h)).catch(() => {});
    listPatientMedia(patientId).then((m) => alive && setMedia(m)).catch(() => {});
    listReminders(patientId).then((r) => alive && setReminders(r)).catch(() => {});
    return () => { alive = false; };
  }, [patientId]);

  const tier = clusterHistory[0]?.risk_tier ?? patient?.risk_tier;
  const trend = [...clusterHistory].reverse().slice(-6);
  const summary = summarize(clusterHistory, patient);
  const pid = encodeURIComponent(patientId);

  return (
    <div className="flex flex-col gap-8 min-w-0">
      <div className="flex justify-between gap-6 flex-wrap items-end">
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">{patientId}{patient && ` · Cluster C${patient.cluster_id}`}</span>
          <h2 className="font-serif text-[44px] leading-none tracking-[-0.02em]">{patientId}</h2>
          <span className="text-[13px] text-slate-600">
            {[patient?.age != null && Math.round(patient.age), patient?.gender, clusterHistory[0] && `Last clustered ${shortDate(clusterHistory[0].createdAt)}`]
              .filter(Boolean).join(" · ") || "Not in the latest clustering run"}
          </span>
        </div>
        {tier && (
          <div className="flex flex-col items-end gap-2">
            {trend.length > 1 && (
              <div className="flex items-end gap-1 h-8" aria-label={`Risk history: ${trend.map((t) => t.risk_tier).join(", ")}`}>
                {trend.map((t, i) => (
                  <span key={t.resultId} className={`w-2.5 ${i === trend.length - 1 ? TIER_BAR[t.risk_tier] : "bg-line-strong"}`}
                    style={{ height: `${(TIER_RANK[t.risk_tier] ?? 1) * 25}%` }} />
                ))}
              </div>
            )}
            <span className="flex items-center gap-2 eyebrow">Risk <Tag tone={tier} /></span>
          </div>
        )}
      </div>

      {summary && <p className="font-serif text-[22px] leading-snug max-w-[640px]">{summary}</p>}

      <div className="flex flex-col gap-4 pb-6 border-b border-line">
        <div className="flex gap-5 flex-wrap text-[13px]">
          <Link to="/predict" className={linkCls}>Re-run prediction</Link>
          <Link to={`/reminders/${pid}`} className={linkCls}>Medication reminders</Link>
          <Link to="/imaging" className={linkCls}>Imaging</Link>
        </div>
        <AppSignIn patientId={patientId} />
      </div>

      {patient ? <VitalsTable patient={patient} /> : (
        <p className="text-[13px] text-slate-500">Vitals come from the latest clustering run; this patient isn’t in it.</p>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <History clusterHistory={clusterHistory} media={media} />
        <Medications reminders={reminders} patientId={patientId} />
      </div>
    </div>
  );
}

export default function PatientPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    let alive = true;
    loadLatestRuns().then(({ latest }) => alive && setRoster(latest?.patients ?? [])).catch(() => {});
    return () => { alive = false; };
  }, []);

  const sorted = useMemo(
    () => [...roster].sort((a, b) => (TIER_RANK[b.risk_tier] ?? 0) - (TIER_RANK[a.risk_tier] ?? 0)),
    [roster]
  );
  const patient = roster.find((p) => p.patient_id === patientId);
  const pick = (id) => navigate(`/patient/${encodeURIComponent(id)}`);

  return (
    <Page title="Patients" sub="Look up a patient to see their profile, vitals, risk tier and history.">
      <div className="grid gap-10 items-start lg:grid-cols-[330px_minmax(0,1fr)]">
        <Roster patients={sorted} selectedId={patientId} onPick={pick} />
        {patientId ? <Profile patientId={patientId} patient={patient} /> : (
          <p className="text-[13px] text-slate-500 border-t border-ink pt-6">
            {sorted.length ? "Pick a patient from the list, or search by ID." : "Search by patient ID. Run clustering to populate the patient list."}
          </p>
        )}
      </div>
    </Page>
  );
}
