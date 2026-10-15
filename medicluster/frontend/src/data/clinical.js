import { getClusterResult, listClusterResults } from "../api/apiClient";
import { adherence } from "./schedule";

// Vitals shown on patient charts and reports, with adult reference ranges and the axis used to draw them.
export const VITALS = [
  { key: "systolic_bp",  label: "Systolic BP",  unit: "mmHg",  ref: [90, 120],   axis: [70, 200] },
  { key: "diastolic_bp", label: "Diastolic BP", unit: "mmHg",  ref: [60, 80],    axis: [40, 130] },
  { key: "heart_rate",   label: "Heart rate",   unit: "bpm",   ref: [60, 100],   axis: [30, 160] },
  { key: "glucose",      label: "Glucose",      unit: "mg/dL", ref: [70, 140],   axis: [40, 320] },
  { key: "hba1c",        label: "HbA1c",        unit: "%",     ref: [4, 5.7],    axis: [4, 14] },
  { key: "bmi",          label: "BMI",          unit: "kg/m²", ref: [18.5, 25],  axis: [12, 50] },
  { key: "spo2",         label: "SpO₂",         unit: "%",     ref: [95, 100],   axis: [80, 100] },
];

export function vitalStatus(v, value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value > v.ref[1]) return "High";
  if (value < v.ref[0]) return "Low";
  return "Normal";
}

export const fmtVital = (v, value) =>
  typeof value !== "number" ? "—" : value % 1 === 0 ? String(value) : value.toFixed(1);

// Abnormal readings worth surfacing next to a patient, most urgent first.
const FLAGS = [
  { key: "spo2",        label: "SpO₂",    bad: (v) => v < 94,   fmt: (v) => `${v}%` },
  { key: "systolic_bp", label: "SBP",     bad: (v) => v >= 160 },
  { key: "glucose",     label: "glucose", bad: (v) => v >= 180 },
  { key: "hba1c",       label: "HbA1c",   bad: (v) => v >= 8,   fmt: (v) => `${v}%` },
  { key: "heart_rate",  label: "HR",      bad: (v) => v > 110 },
  { key: "bmi",         label: "BMI",     bad: (v) => v >= 35 },
];

export function flagReason(p, fallback = "Clustered with the critical group") {
  const hits = FLAGS.filter((f) => typeof p[f.key] === "number" && f.bad(p[f.key]))
    .slice(0, 2)
    .map((f) => `${f.label} ${f.fmt ? f.fmt(p[f.key]) : Math.round(p[f.key])}`);
  return hits.length ? hits.join(", ") : fallback;
}

export const TIER_RANK = { Low: 1, Moderate: 2, High: 3, Critical: 4 };

export const runId = (r) => `RUN-${String(r._id).slice(-4).toUpperCase()}`;

const ALGO_NAMES = { kmeans: "K-Means", dbscan: "DBSCAN", hierarchical: "Hierarchical", gmm: "GMM" };

export function runLabel(r) {
  const name = ALGO_NAMES[r.algorithm] || r.algorithm;
  const p = r.params || {};
  if (r.algorithm === "kmeans" && p.k) return `${name}, k=${p.k}`;
  if (r.algorithm === "gmm" && p.n_components) return `${name}, ${p.n_components} comp.`;
  if (r.algorithm === "dbscan" && p.eps != null) return `${name}, ε=${p.eps}`;
  if (r.algorithm === "hierarchical" && p.n_clusters) return `${name}, n=${p.n_clusters}`;
  return name;
}

// "09:14" today, "Yesterday", otherwise "12 Oct".
export function when(iso) {
  const d = new Date(iso);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export const shortDate = (iso) => new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short" });

// Latest run with its patients, plus the previous run on the same dataset for comparison.
export async function loadLatestRuns() {
  const runs = await listClusterResults();
  if (!runs.length) return { runs, latest: null, prev: null };
  const latestMeta = runs[0];
  const prevMeta = runs.slice(1).find((r) => String(r.datasetId) === String(latestMeta.datasetId));
  const [latest, prev] = await Promise.all([
    getClusterResult(latestMeta._id),
    prevMeta ? getClusterResult(prevMeta._id) : null,
  ]);
  return { runs, latest, prev };
}

// Share of scheduled doses taken over the last 7 days, or null when nothing was due.
export function adherence7d(reminder) {
  const { pct } = adherence([reminder]);
  return pct == null ? null : pct / 100;
}
