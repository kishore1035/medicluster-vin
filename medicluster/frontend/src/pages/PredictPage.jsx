import { useState, useEffect } from "react";
import { listClusterResults, predictRisk } from "../api/apiClient";
import { Page, Section, Tag, KV } from "../components/ui";

// Large tier word colour on the result side.
const TIER_TEXT = {
  Low: "text-green-700", Moderate: "text-amber-700", High: "text-orange-700", Critical: "text-red-700", Noise: "text-slate-500",
};

const VITALS_FIELDS = [
  { key: "age",             label: "Age",             unit: "yrs",   min: 0,   max: 120,  step: 1   },
  { key: "bmi",             label: "BMI",             unit: "kg/m²", min: 10,  max: 60,   step: 0.1 },
  { key: "systolic_bp",     label: "Systolic BP",     unit: "mmHg",  min: 60,  max: 250,  step: 1   },
  { key: "diastolic_bp",    label: "Diastolic BP",    unit: "mmHg",  min: 40,  max: 150,  step: 1   },
  { key: "glucose",         label: "Glucose",         unit: "mg/dL", min: 50,  max: 500,  step: 1   },
  { key: "hba1c",           label: "HbA1c",           unit: "%",     min: 3,   max: 15,   step: 0.1 },
  { key: "cholesterol",     label: "Cholesterol",     unit: "mg/dL", min: 100, max: 400,  step: 1   },
  { key: "hdl",             label: "HDL",             unit: "mg/dL", min: 10,  max: 150,  step: 1   },
  { key: "ldl",             label: "LDL",             unit: "mg/dL", min: 30,  max: 300,  step: 1   },
  { key: "triglycerides",   label: "Triglycerides",   unit: "mg/dL", min: 30,  max: 1000, step: 1   },
  { key: "heart_rate",      label: "Heart Rate",      unit: "bpm",   min: 30,  max: 200,  step: 1   },
  { key: "spo2",            label: "SpO2",            unit: "%",     min: 50,  max: 100,  step: 0.1 },
  { key: "num_medications", label: "Num Medications", unit: "",      min: 0,   max: 50,   step: 1   },
];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PredictPage() {
  const [clusterResults, setClusterResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(true);
  const [selectedResultId, setSelectedResultId] = useState("");
  const [vitals, setVitals] = useState({});
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listClusterResults()
      .then((data) => {
        setClusterResults(data);
        if (data.length > 0) setSelectedResultId(data[0]._id);
      })
      .catch(() => setClusterResults([]))
      .finally(() => setLoadingResults(false));
  }, []);

  function handleVitalChange(key, value) {
    setVitals((prev) => ({ ...prev, [key]: value === "" ? undefined : Number(value) }));
  }

  async function handlePredict(e) {
    e.preventDefault();
    if (!selectedResultId) { setError("Select a cluster result first."); return; }
    const filled = Object.fromEntries(
      Object.entries(vitals).filter(([, v]) => v !== undefined && !isNaN(v))
    );
    if (Object.keys(filled).length === 0) { setError("Enter at least one vital value."); return; }
    setPredicting(true);
    setError(null);
    setPrediction(null);
    try {
      const result = await predictRisk(selectedResultId, filled);
      setPrediction(result);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Prediction failed");
    } finally {
      setPredicting(false);
    }
  }


  const inputCls = "h-11 px-3 w-full border border-line-strong rounded-[3px] bg-surface text-sm font-mono focus:outline-none focus:border-ink";
  const maxDev = Math.max(1, ...(prediction?.feature_deviations ?? []).map((d) => Math.abs(d.deviation / Math.max(Math.abs(d.centroid_value), 1))));
  const nearest = prediction?.all_distances?.find((d) => d.cluster_id === prediction.cluster_id);

  return (
    <Page title="Risk prediction" sub="Enter patient vitals to predict their risk tier based on a saved clustering result.">
      {error && (
        <div role="alert" className="flex justify-between gap-4 px-4 py-3 border border-risk-critical text-red-700 text-[13px]">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="underline shrink-0">Dismiss</button>
        </div>
      )}

      <div className="grid gap-12 items-start lg:grid-cols-2">
        <form onSubmit={handlePredict}>
          <Section
            title="Patient vitals"
            aside={loadingResults ? (
              <span className="font-mono text-[11px] text-slate-500">LOADING…</span>
            ) : clusterResults.length > 0 && (
              <select aria-label="Clustering result" value={selectedResultId} onChange={(e) => setSelectedResultId(e.target.value)}
                className="bg-transparent font-mono text-[11px] text-slate-600 uppercase tracking-[0.04em] focus:outline-none max-w-[60%]">
                {clusterResults.map((r) => (
                  <option key={r._id} value={r._id}>
                    RUN-{String(r._id).slice(-4).toUpperCase()} · {r.algorithm} · {formatDate(r.createdAt)}
                  </option>
                ))}
              </select>
            )}
          >
            {!loadingResults && clusterResults.length === 0 && (
              <p className="pt-4 text-[13px] text-slate-600">No saved results — run clustering first on the Dashboard.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5 pt-5">
              {VITALS_FIELDS.map(({ key, label, unit, min, max, step }) => (
                <label key={key} className="flex flex-col gap-1.5 text-xs text-slate-600">
                  {label}{unit ? ` (${unit})` : ""}
                  <input type="number" min={min} max={max} step={step} placeholder="—"
                    value={vitals[key] ?? ""} onChange={(e) => handleVitalChange(key, e.target.value)} className={inputCls} />
                </label>
              ))}
            </div>
            <button type="submit" disabled={predicting || clusterResults.length === 0} className="btn-primary w-full h-11 mt-5">
              {predicting ? "Predicting…" : "Predict risk"}
            </button>
          </Section>
        </form>

        <div className="flex flex-col gap-8 border-t border-ink pt-6" aria-live="polite">
          {!prediction ? (
            <p className="text-[13px] text-slate-500">Fill in vitals and predict to see the tier, nearest cluster and what drives it.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 pb-6 border-b border-line">
                <span className="eyebrow">Predicted tier</span>
                <div className="flex items-baseline gap-4 flex-wrap">
                  <span className={`font-serif text-[64px] leading-none tracking-[-0.02em] ${TIER_TEXT[prediction.risk_tier] ?? ""}`}>
                    {prediction.risk_tier}
                  </span>
                  <span className="font-mono text-sm">{Math.round(prediction.confidence * 100)}% confidence</span>
                </div>
                <p className="text-[13px] text-slate-600">
                  Nearest cluster C{prediction.cluster_id}
                  {nearest?.distance != null && ` · distance ${nearest.distance.toFixed(2)}`}
                  {prediction.cluster_profile?.size != null && ` · ${prediction.cluster_profile.size} patients`}
                  {` · ${prediction.algorithm}`}
                </p>
              </div>

              {prediction.feature_deviations?.length > 0 && (
                <Section title="Feature contribution" aside={<span className="eyebrow">vs cluster centroid</span>}>
                  <div className="flex flex-col gap-2.5 pt-3">
                    {prediction.feature_deviations.map(({ feature, patient_value, centroid_value, deviation }) => {
                      const rel = deviation / Math.max(Math.abs(centroid_value), 1);
                      return (
                        <div key={feature} className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-3 text-[13px]"
                          title={`Patient ${patient_value.toFixed(1)} · centroid ${centroid_value.toFixed(1)}`}>
                          <span className="font-mono truncate">{feature}</span>
                          <div className="h-2.5 bg-sunken">
                            <div className={`h-full ${deviation > 0 ? "bg-risk-high" : "bg-slate-500"}`}
                              style={{ width: `${(Math.abs(rel) / maxDev) * 100}%` }} />
                          </div>
                          <span className="font-mono text-right">{deviation > 0 ? "+" : "−"}{Math.abs(deviation).toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {prediction.all_distances?.length > 0 && (
                <Section title="Distance to each cluster">
                  {prediction.all_distances.map(({ cluster_id, risk_tier, distance }) => (
                    <KV key={cluster_id}
                      k={<span className="flex items-center gap-2">C{cluster_id} <Tag tone={risk_tier} />{cluster_id === prediction.cluster_id && <span className="text-xs text-slate-500">nearest</span>}</span>}
                      v={distance != null ? distance.toFixed(2) : "—"} />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
