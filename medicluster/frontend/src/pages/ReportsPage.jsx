import { useEffect, useMemo, useState } from "react";
import { getPatientClusterHistory, listPatientMedia, listReminders } from "../api/apiClient";
import { useAuth } from "../auth/AuthContext";
import { Page, Section, Segmented, Tag } from "../components/ui";
import { TIER_RANK, VITALS, adherence7d, fmtVital, loadLatestRuns, shortDate, vitalStatus } from "../data/clinical";

const SECTIONS = [
  { key: "summary",     label: "Summary" },
  { key: "vitals",      label: "Vitals & reference ranges" },
  { key: "tier",        label: "Risk tier & cluster" },
  { key: "medications", label: "Medications" },
  { key: "findings",    label: "Recent findings" },
];
const PERIODS = [{ value: 30, label: "30 d" }, { value: 90, label: "90 d" }, { value: 365, label: "1 yr" }];
const STATUS_TEXT = { High: "text-red-700", Low: "text-amber-700", Normal: "text-green-700" };

function downloadCsv(patient, rows) {
  const lines = [["measure", "value", "unit", "ref_low", "ref_high", "status"],
    ...rows.map((v) => [v.label, patient[v.key] ?? "", v.unit, v.ref[0], v.ref[1], vitalStatus(v, patient[v.key]) ?? ""])];
  const blob = new Blob([lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${patient.patient_id}-risk-report.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [pid, setPid] = useState("");
  const [include, setInclude] = useState(() => Object.fromEntries(SECTIONS.map((s) => [s.key, true])));
  const [period, setPeriod] = useState(90);
  const [format, setFormat] = useState("pdf");
  const [history, setHistory] = useState([]);
  const [media, setMedia] = useState([]);
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    loadLatestRuns().then(({ latest }) => {
      const ps = [...(latest?.patients ?? [])].sort((a, b) => (TIER_RANK[b.risk_tier] ?? 0) - (TIER_RANK[a.risk_tier] ?? 0));
      setPatients(ps);
      setPid((cur) => cur || ps[0]?.patient_id || "");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pid) return undefined;
    let alive = true;
    getPatientClusterHistory(pid).then((h) => alive && setHistory(h)).catch(() => alive && setHistory([]));
    listPatientMedia(pid).then((m) => alive && setMedia(m)).catch(() => alive && setMedia([]));
    listReminders(pid).then((r) => alive && setReminders(r)).catch(() => alive && setReminders([]));
    return () => { alive = false; };
  }, [pid]);

  const patient = patients.find((p) => p.patient_id === pid);
  const since = Date.now() - period * 86_400_000;
  const findings = useMemo(() => [
    ...history.map((h) => ({ at: h.createdAt, text: `Assigned ${h.risk_tier} tier, cluster C${h.cluster_id}` })),
    ...media.map((m) => ({ at: m.uploadedAt, text: `Uploaded ${m.filename}` })),
  ].filter((e) => new Date(e.at) >= since).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6), [history, media, since]);

  const abnormal = patient ? VITALS.filter((v) => vitalStatus(v, patient[v.key]) && vitalStatus(v, patient[v.key]) !== "Normal") : [];
  const tiers = history.filter((h) => new Date(h.createdAt) >= since).map((h) => h.risk_tier);
  const summary = !patient ? "" : [
    tiers.length > 1 && tiers[tiers.length - 1] !== tiers[0]
      ? `Risk moved from ${tiers[tiers.length - 1]} to ${tiers[0]} over the last ${PERIODS.find((p) => p.value === period).label}.`
      : `Currently ${patient.risk_tier} risk.`,
    abnormal.length ? `Outside reference range: ${abnormal.map((v) => v.label).join(", ")}.` : "All recorded vitals within reference range.",
  ].join(" ");

  const exportReport = () => {
    if (format === "csv") return downloadCsv(patient, VITALS);
    document.body.classList.add("printing-report");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-report"), { once: true });
    window.print();
  };
  const generated = new Date().toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Page title="Reports" sub="Build a patient risk report to share, print or send to another system.">
      <div className="grid gap-10 items-start lg:grid-cols-[330px_minmax(0,1fr)]">
        <div className="flex flex-col gap-6 print:hidden">
          <label className="flex flex-col gap-1.5 text-xs text-slate-600">
            Patient
            <select value={pid} onChange={(e) => setPid(e.target.value)} disabled={!patients.length}
              className="h-10 px-3 border border-line-strong rounded-[3px] bg-surface text-[13.5px] text-ink focus:outline-none focus:border-ink">
              {!patients.length && <option>Run clustering to list patients</option>}
              {patients.map((p) => <option key={p.patient_id} value={p.patient_id}>{p.patient_id} · {p.risk_tier}</option>)}
            </select>
          </label>

          <Section title="Include">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-3 py-2.5 border-b border-line text-[13.5px] cursor-pointer">
                <input type="checkbox" checked={include[s.key]} onChange={(e) => setInclude((i) => ({ ...i, [s.key]: e.target.checked }))}
                  className="w-4 h-4 accent-ink" />
                {s.label}
              </label>
            ))}
          </Section>

          <div className="flex flex-col gap-2 text-xs text-slate-600">Period
            <Segmented fullWidth mono label="Period" options={PERIODS} value={period} onChange={setPeriod} />
          </div>
          <div className="flex flex-col gap-2 text-xs text-slate-600">Format
            <Segmented fullWidth mono label="Format" value={format} onChange={setFormat}
              options={[{ value: "pdf", label: "PDF" }, { value: "csv", label: "CSV" }]} />
          </div>
          <button type="button" onClick={exportReport} disabled={!patient} className="btn-primary h-11">
            Export {format.toUpperCase()}
          </button>
        </div>

        <div className="bg-sunken p-4 sm:p-6 print:p-0 print:bg-transparent">
          {!patient ? (
            <p className="text-[13px] text-slate-500 p-6">Pick a patient to preview their report.</p>
          ) : (
            <article id="report" className="bg-surface max-w-[680px] mx-auto p-8 sm:p-12 flex flex-col gap-7 shadow-sm print:shadow-none">
              <header className="flex justify-between gap-4 pb-4 border-b-2 border-ink">
                <div>
                  <p className="font-serif text-xl">MediCluster</p>
                  <p className="eyebrow mt-1">Patient risk report</p>
                </div>
                <p className="font-mono text-[11px] text-slate-500 text-right leading-relaxed">
                  Generated {generated}<br />{user?.name}{user?.department && ` · ${user.department}`}
                </p>
              </header>

              <div className="flex justify-between items-end gap-4">
                <div>
                  <h2 className="font-serif text-[34px] leading-none">{patient.patient_id}</h2>
                  <p className="text-[13px] text-slate-600 mt-2">
                    {[patient.age != null && Math.round(patient.age), patient.gender, `Cluster C${patient.cluster_id}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {include.tier && <div className="text-right"><p className="eyebrow mb-1">Risk tier</p><Tag tone={patient.risk_tier} /></div>}
              </div>

              {include.summary && (
                <div><p className="eyebrow mb-1.5">Summary</p><p className="font-serif text-[17px] leading-snug">{summary}</p></div>
              )}

              {include.vitals && (
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="eyebrow text-left border-b border-ink">
                      <th className="py-1.5 font-normal">Measure</th><th className="py-1.5 font-normal text-right">Value</th>
                      <th className="py-1.5 font-normal text-right">Reference</th><th className="py-1.5 font-normal text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VITALS.map((v) => {
                      const st = vitalStatus(v, patient[v.key]);
                      return (
                        <tr key={v.key} className="border-b border-line">
                          <td className="py-2">{v.label}</td>
                          <td className="py-2 text-right font-mono">{fmtVital(v, patient[v.key])} <span className="text-slate-500">{v.unit}</span></td>
                          <td className="py-2 text-right font-mono text-slate-500">{v.ref[0]}–{v.ref[1]}</td>
                          <td className={`py-2 text-right font-mono text-[11px] uppercase ${STATUS_TEXT[st] ?? "text-slate-500"}`}>{st ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {(include.medications || include.findings) && (
                <div className="grid gap-6 sm:grid-cols-2 text-[12.5px]">
                  {include.medications && (
                    <div>
                      <p className="eyebrow mb-2">Medications</p>
                      {reminders.length === 0 && <p className="text-slate-500">None recorded.</p>}
                      {reminders.map((r) => {
                        const pct = adherence7d(r);
                        return (
                          <p key={r._id} className="py-0.5">
                            {r.medicationName} {r.dosage}
                            <span className="text-slate-500"> · {r.frequency}{!r.active && " · paused"}{pct != null && ` · ${Math.round(pct * 100)}% taken (7 d)`}</span>
                          </p>
                        );
                      })}
                    </div>
                  )}
                  {include.findings && (
                    <div>
                      <p className="eyebrow mb-2">Recent findings</p>
                      {findings.length === 0 && <p className="text-slate-500">None in this period.</p>}
                      {findings.map((f, i) => <p key={i} className="py-0.5">{shortDate(f.at)} — {f.text}</p>)}
                    </div>
                  )}
                </div>
              )}

              <footer className="flex justify-between items-end gap-6 pt-5 border-t border-line text-[11px] text-slate-500">
                <p className="max-w-[300px]">Risk tiers are derived from unsupervised clustering and are decision support, not a diagnosis.</p>
                <p className="w-40 pt-1 border-t border-ink text-right">Signature</p>
              </footer>
            </article>
          )}
        </div>
      </div>
    </Page>
  );
}
