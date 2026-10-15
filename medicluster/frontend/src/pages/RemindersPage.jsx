import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  listReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  generateMedicationPlan,
  checkDrugInteractions,
  markDoseTaken,
} from "../api/apiClient";
import { Link } from "react-router-dom";
import { Page, Section, linkCls } from "../components/ui";
import { adherence, dateKey, formatRelative, formatTime12, isTaken, joinNames, nowMinutes, slotsOn, toMinutes } from "../data/schedule";

const PRESET_TIMES = [
  { label: "Morning",   value: "08:00" },
  { label: "Afternoon", value: "13:00" },
  { label: "Evening",   value: "18:00" },
  { label: "Night",     value: "21:00" },
];

const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", "as-needed": "As needed" };

function AddReminderForm({ patientId, onAdded }) {
  const [med,      setMed]      = useState("");
  const [dosage,   setDosage]   = useState("");
  const [times,    setTimes]    = useState([]);
  const [custom,   setCustom]   = useState("");
  const [freq,     setFreq]     = useState("daily");
  const [days,     setDays]     = useState([]);
  const [notes,    setNotes]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  function togglePreset(val) {
    setTimes((prev) => prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]);
  }

  function toggleDay(d) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  function addCustomTime() {
    const t = custom.trim();
    if (!t) return;
    if (!/^\d{2}:\d{2}$/.test(t)) { setError("Custom time must be HH:MM format"); return; }
    if (!times.includes(t)) setTimes((prev) => [...prev, t].sort());
    setCustom("");
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!med.trim()) { setError("Medication name is required"); return; }
    if (times.length === 0) { setError("Select at least one time"); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await createReminder({
        patientId,
        medicationName: med.trim(),
        dosage: dosage.trim(),
        times: [...times].sort(),
        frequency: freq,
        days: freq === "weekly" ? days : [],
        notes: notes.trim(),
      });
      onAdded(created);
      setMed(""); setDosage(""); setTimes([]); setDays([]); setNotes(""); setFreq("daily");
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to save reminder");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="section-label mb-0">Add medication</p>

      {error && (
        <p className="text-xs text-red-600 bg-surface border border-red-200 rounded-[3px] px-3 py-2">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Medication Name *</label>
          <input
            type="text"
            value={med}
            onChange={(e) => setMed(e.target.value)}
            placeholder="e.g. Metformin"
            className="w-full text-sm border border-line rounded-[3px] px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-ink/10"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Dosage</label>
          <input
            type="text"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder="e.g. 500mg"
            className="w-full text-sm border border-line rounded-[3px] px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-ink/10"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 block mb-2">Reminder Times *</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {PRESET_TIMES.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => togglePreset(value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-[3px] border transition-colors ${ times.includes(value) ? "bg-ink text-paper border-ink" : "bg-surface text-slate-500 border-line hover:border-line-strong hover:text-blue-600" }`}
            >
              {label} · {formatTime12(value)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="time"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="text-sm border border-line rounded-[3px] px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-ink/10"
          />
          <button
            type="button"
            onClick={addCustomTime}
            className="text-xs px-3 py-1.5 border border-line rounded-[3px] text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Add custom time
          </button>
        </div>
        {times.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[...times].sort().map((t) => (
              <span key={t} className="text-xs bg-sunken text-blue-700 px-2 py-0.5 rounded-sm font-semibold flex items-center gap-1">
                {formatTime12(t)}
                <button type="button" onClick={() => setTimes((prev) => prev.filter((x) => x !== t))} className="hover:text-red-500">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-slate-500 block mb-2">Frequency</label>
        <div className="flex gap-2">
          {Object.entries(FREQ_LABELS).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => setFreq(val)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-[3px] border transition-colors ${ freq === val ? "bg-ink text-paper border-ink" : "bg-surface text-slate-500 border-line hover:border-line-strong" }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        {freq === "weekly" && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`text-xs font-semibold w-10 py-1 rounded-[3px] border transition-colors ${ days.includes(d) ? "bg-ink text-paper border-ink" : "bg-surface text-slate-500 border-line hover:border-line-strong" }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-slate-500 block mb-1">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Take with food"
          className="w-full text-sm border border-line rounded-[3px] px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-ink/10"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full btn-primary text-sm py-2 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Reminder"}
      </button>
    </form>
  );
}

function AIPrescriptionPlanner({ patientId, reminders, onAdded, onError }) {
  const [text, setText] = useState("");
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedKeys, setSavedKeys] = useState(new Set());

  async function handleGenerate() {
    if (!text.trim()) {
      onError("Paste prescription text first");
      return;
    }
    setLoading(true);
    setPlan(null);
    setSavedKeys(new Set());
    try {
      const data = await generateMedicationPlan(patientId, text, reminders);
      setPlan(data);
      if (data.error) onError(data.error);
    } catch (err) {
      onError(err?.response?.data?.error || "AI prescription parser failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveReminder(reminder, key) {
    setSaving(true);
    try {
      const created = await createReminder({
        patientId,
        medicationName: reminder.medicationName,
        dosage: reminder.dosage,
        times: reminder.times,
        frequency: reminder.frequency,
        days: reminder.frequency === "weekly" ? reminder.days : [],
        notes: reminder.notes,
      });
      onAdded(created);
      setSavedKeys((prev) => new Set(prev).add(key));
    } catch (err) {
      onError(err?.response?.data?.error || "Failed to save AI reminder");
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    const pending = (plan?.reminders ?? [])
      .map((reminder, index) => ({ reminder, key: `${reminder.medicationName}-${index}` }))
      .filter(({ key }) => !savedKeys.has(key));
    for (const item of pending) {
      await saveReminder(item.reminder, item.key);
    }
  }

  const pendingCount = (plan?.reminders ?? []).filter((reminder, index) => (
    !savedKeys.has(`${reminder.medicationName}-${index}`)
  )).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-ink">
        <p className="text-[13px] font-semibold">AI prescription parser</p>
        {plan?.source && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm border ${ plan.source === "ai" ? "bg-sunken text-ink border-line-strong" : "bg-slate-50 text-slate-500 border-line" }`}>
            {plan.source === "ai" ? "AI" : "Local"}
          </span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Paste prescription text, e.g. Metformin 500mg twice daily; Atorvastatin 20mg at night"
        className="w-full text-sm border border-line rounded-[3px] px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-ink/10 resize-none"
      />

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading || !text.trim()}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-ink bg-sunken hover:bg-sunken border border-line-strong rounded-[3px] py-2 transition-colors disabled:opacity-50"
      >
        {loading ? <><div className="spinner w-3.5 h-3.5" />Extracting...</> : "Extract schedule"}
      </button>

      {plan?.warnings?.length > 0 && (
        <div className="bg-surface border border-amber-200 rounded-[3px] px-3 py-2 space-y-1">
          {plan.warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-700">{warning}</p>
          ))}
        </div>
      )}

      {plan?.reminders?.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Suggested reminders
            </p>
            {pendingCount > 1 && (
              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="text-xs font-semibold text-ink hover:text-ink disabled:opacity-50"
              >
                Add all
              </button>
            )}
          </div>

          {plan.reminders.map((reminder, index) => {
            const key = `${reminder.medicationName}-${index}`;
            const saved = savedKeys.has(key);
            return (
              <div key={key} className="rounded-[3px] border border-line bg-slate-50 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{reminder.medicationName}</p>
                    <p className="text-xs text-slate-400">
                      {[reminder.dosage, FREQ_LABELS[reminder.frequency] ?? reminder.frequency]
                        .filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => saveReminder(reminder, key)}
                    disabled={saving || saved}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-[3px] border transition-colors ${ saved ? "bg-surface text-emerald-700 border-emerald-200" : "bg-surface text-ink border-line-strong hover:bg-sunken" }`}
                  >
                    {saved ? "Added" : "Add"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(reminder.times ?? []).map((time) => (
                    <span key={time} className="text-xs font-semibold px-2 py-0.5 rounded-sm bg-sunken text-blue-700 border border-line-strong">
                      {formatTime12(time)}
                    </span>
                  ))}
                  {reminder.days?.map((day) => (
                    <span key={day} className="text-xs font-semibold px-2 py-0.5 rounded-sm bg-slate-100 text-slate-600">
                      {day}
                    </span>
                  ))}
                </div>

                {reminder.notes && (
                  <p className="text-xs text-slate-500 leading-relaxed">{reminder.notes}</p>
                )}
              </div>
            );
          })}

          {plan.counseling?.length > 0 && (
            <div className="border-t border-line pt-3 space-y-1">
              {plan.counseling.map((item) => (
                <p key={item} className="text-xs text-slate-400">{item}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DrugInteractionChecker({ reminders }) {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);

  const activeNames = reminders.filter((r) => r.active).map((r) => r.medicationName);
  if (activeNames.length < 2) return null;

  async function handleCheck() {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const data = await checkDrugInteractions(activeNames);
      setResult(data);
    } catch {
      setErr("Interaction check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const interactions = result?.interactions ?? [];
  const major    = interactions.filter((i) => i.severity === "major");
  const moderate = interactions.filter((i) => i.severity === "moderate");
  const minor    = interactions.filter((i) => i.severity === "minor" || (!i.severity && i.description));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-ink">
        <p className="text-[13px] font-semibold">Drug interactions</p>
        <span className="text-xs text-slate-400">{activeNames.length} active meds</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {activeNames.map((name) => (
          <span key={name} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm font-medium">
            {name}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={handleCheck}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-orange-700 bg-surface hover:bg-surface border border-orange-200 rounded-[3px] py-2 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <><div className="spinner w-3.5 h-3.5" />Checking…</>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Check Interactions
          </>
        )}
      </button>

      {err && (
        <p className="text-xs text-red-600 bg-surface border border-red-200 rounded-[3px] px-3 py-2">{err}</p>
      )}

      {result && interactions.length === 0 && (
        <div className="flex items-center gap-2 bg-surface border border-emerald-200 rounded-[3px] px-3 py-2.5">
          <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-emerald-700 font-semibold">No significant interactions found between current medications.</p>
        </div>
      )}

      {major.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-700 inline-block" />
            Major — {major.length}
          </p>
          {major.map((item, i) => (
            <div key={i} className="bg-surface border border-red-200 rounded-[3px] p-3 space-y-1">
              <p className="text-xs font-semibold text-red-800">{item.drug1} + {item.drug2}</p>
              {item.description && <p className="text-xs text-red-600 leading-relaxed">{item.description}</p>}
              {item.recommendation && <p className="text-xs text-red-700 italic">{item.recommendation}</p>}
            </div>
          ))}
        </div>
      )}

      {moderate.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            Moderate — {moderate.length}
          </p>
          {moderate.map((item, i) => (
            <div key={i} className="bg-surface border border-amber-200 rounded-[3px] p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-800">{item.drug1} + {item.drug2}</p>
              {item.description && <p className="text-xs text-amber-700 leading-relaxed">{item.description}</p>}
              {item.recommendation && <p className="text-xs text-amber-600 italic">{item.recommendation}</p>}
            </div>
          ))}
        </div>
      )}

      {minor.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
            Minor — {minor.length}
          </p>
          {minor.map((item, i) => (
            <div key={i} className="bg-sunken border border-line-strong rounded-[3px] p-3 space-y-1">
              <p className="text-xs font-semibold text-blue-800">{item.drug1} + {item.drug2}</p>
              {item.description && <p className="text-xs text-blue-600 leading-relaxed">{item.description}</p>}
            </div>
          ))}
        </div>
      )}

      {result?.summary && (
        <p className="text-xs text-slate-500 border-t border-line pt-3 leading-relaxed">{result.summary}</p>
      )}
    </div>
  );
}

export default function RemindersPage() {
  const { patientId: urlPatientId } = useParams();
  const navigate = useNavigate();

  const [patientId,  setPatientId]  = useState(urlPatientId ?? "");
  const [reminders,  setReminders]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [searchInput, setSearchInput] = useState(urlPatientId ?? "");

  const loadReminders = useCallback((pid) => {
    if (!pid) return;
    setLoading(true);
    setError(null);
    listReminders(pid)
      .then(setReminders)
      .catch(() => setError("Failed to load reminders"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (urlPatientId) {
      setPatientId(urlPatientId);
      setSearchInput(urlPatientId);
      loadReminders(urlPatientId);
    }
  }, [urlPatientId, loadReminders]);

  function handleSearch(e) {
    e.preventDefault();
    const pid = searchInput.trim();
    if (!pid) return;
    navigate(`/reminders/${pid}`);
  }

  async function handleMarkTaken(slot) {
    try {
      const updated = await Promise.all(
        slot.reminders.filter((r) => !isTaken(r, slot.date, slot.time)).map((r) => markDoseTaken(r._id, slot.date, slot.time))
      );
      setReminders((prev) => prev.map((r) => updated.find((u) => u._id === r._id) ?? r));
    } catch {
      setError("Failed to record the dose");
    }
  }

  function handleAdded(reminder) {
    setReminders((prev) => [reminder, ...prev]);
  }

  async function handleToggle(reminder) {
    try {
      const updated = await updateReminder(reminder._id, { active: !reminder.active });
      setReminders((prev) => prev.map((r) => r._id === updated._id ? updated : r));
    } catch {
      setError("Failed to update reminder");
    }
  }

  async function handleDelete(id) {
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r._id !== id));
    } catch {
      setError("Failed to delete reminder");
    }
  }

  return (
    <Page title="Medication reminders" sub="Set and manage medication schedules per patient.">
      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-4 border-b border-line text-[13px]">
        <label className="flex items-center gap-2 text-slate-600">
          Patient
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Patient ID"
            className="h-8 w-40 px-2 border-b border-line-strong bg-transparent font-medium text-ink focus:outline-none focus:border-ink" />
        </label>
        <button type="submit" className="btn-secondary h-8 text-[13px] px-3">Load</button>
        {patientId && (
          <span className="ml-auto flex gap-5">
            <a href="#add-medication" className={linkCls}>Add medication</a>
            <Link to={`/patient/${encodeURIComponent(patientId)}`} className={linkCls}>Open chart</Link>
          </span>
        )}
      </form>

      {error && (
        <div role="alert" className="flex justify-between gap-4 px-4 py-3 border border-risk-critical text-red-700 text-[13px]">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="underline shrink-0">Dismiss</button>
        </div>
      )}

      {!patientId ? (
        <p className="text-[13px] text-slate-500">Enter a patient ID to manage their medication schedules.</p>
      ) : loading ? (
        <p className="text-[13px] text-slate-500" aria-busy="true">Loading reminders…</p>
      ) : (
        <>
          <NextDose reminders={reminders} onTaken={handleMarkTaken} />
          <TodayTimeline reminders={reminders} />
          <div className="grid gap-10 lg:grid-cols-2 items-start">
            <Schedules reminders={reminders} onToggle={handleToggle} onDelete={handleDelete} />
            <WeekGrid reminders={reminders} />
          </div>
          <div id="add-medication" className="grid gap-10 lg:grid-cols-3 items-start pt-4">
            <AddReminderForm patientId={patientId} onAdded={handleAdded} />
            <AIPrescriptionPlanner patientId={patientId} reminders={reminders} onAdded={handleAdded} onError={setError} />
            <DrugInteractionChecker reminders={reminders} />
          </div>
        </>
      )}
    </Page>
  );
}

// ── Next dose ─────────────────────────────────────────────────────────────────
function NextDose({ reminders, onTaken }) {
  const now = new Date();
  const mins = nowMinutes(now);
  const today = slotsOn(reminders, now);
  // First untaken slot that isn't more than 2 h overdue; otherwise tomorrow's first.
  let slot = today.find((s) => !s.taken && toMinutes(s.time) >= mins - 120);
  let tomorrow = false;
  if (!slot) {
    const t = new Date(now); t.setDate(t.getDate() + 1);
    slot = slotsOn(reminders, t)[0];
    tomorrow = !!slot;
  }
  if (!slot) return null;
  const delta = toMinutes(slot.time) - mins + (tomorrow ? 1440 : 0);
  const names = joinNames(slot.reminders.map((r) => r.medicationName));
  const doses = [...new Set(slot.reminders.map((r) => r.dosage).filter(Boolean))];

  return (
    <section className="flex flex-wrap justify-between items-end gap-6">
      <div className="flex flex-col gap-2 min-w-0">
        <span className="eyebrow">Next dose · {tomorrow ? "tomorrow" : formatRelative(delta)}</span>
        <h2 className="font-serif text-[clamp(30px,5vw,44px)] leading-[1.05] tracking-[-0.02em]">{names} at {slot.time}</h2>
        {doses.length > 0 && <p className="text-[13px] text-slate-600">{doses.join(" · ")}</p>}
      </div>
      {!tomorrow && (
        <button type="button" onClick={() => onTaken(slot)} className="btn-primary h-10 px-5">Mark taken</button>
      )}
    </section>
  );
}

// ── Today timeline ────────────────────────────────────────────────────────────
function TodayTimeline({ reminders }) {
  const now = new Date();
  const slots = slotsOn(reminders, now);
  const doses = slots.reduce((n, s) => n + s.reminders.length, 0);
  const taken = slots.reduce((n, s) => n + s.reminders.filter((r) => isTaken(r, s.date, s.time)).length, 0);
  const pos = (m) => `${(m / 1440) * 100}%`;
  const mins = nowMinutes(now);
  const title = `Today · ${now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}`;

  return (
    <Section title={title} aside={<span className="eyebrow">{taken} of {doses} doses taken</span>}>
      <div className="relative h-28 mx-2 mt-2" role="img"
        aria-label={slots.map((s) => `${s.time} ${s.reminders.length} dose(s) ${s.taken ? "taken" : "due"}`).join(", ") || "No doses today"}>
        <div className="absolute inset-x-0 top-12 h-px bg-line-strong" />
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="absolute top-[86px] -translate-x-1/2 font-mono text-[11px] text-slate-500" style={{ left: pos(h * 60) }}>
            {String(h).padStart(2, "0")}:00
          </span>
        ))}
        <div className="absolute top-3 bottom-10 w-px bg-risk-high" style={{ left: pos(mins) }}>
          <span className="absolute -top-3 left-1 font-mono text-[11px] text-orange-700 whitespace-nowrap">NOW</span>
        </div>
        {slots.map((s) => {
          const m = toMinutes(s.time);
          const missed = !s.taken && m < mins;
          return (
            <div key={s.time} className="absolute -translate-x-1/2 flex flex-col items-center gap-1" style={{ left: pos(m), top: 18 }}>
              <span className="font-mono text-[11px]">{s.time}</span>
              <span className={`w-6 h-6 grid place-items-center font-mono text-[11px] border ${ s.taken ? "bg-risk-low border-risk-low text-paper" : missed ? "border-risk-critical text-red-700 bg-surface" : "border-ink bg-surface" }`}>{s.reminders.length}</span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Schedules ─────────────────────────────────────────────────────────────────
function Schedules({ reminders, onToggle, onDelete }) {
  const rows = [...reminders].sort((a, b) => Number(b.active) - Number(a.active));
  return (
    <Section title="Schedules" aside={<span className="eyebrow">Times</span>}>
      {rows.length === 0 && <p className="py-3 text-[13px] text-slate-500">No schedules yet. Add one below.</p>}
      {rows.map((r) => (
        <div key={r._id} className={`flex flex-col gap-2 py-3 border-b border-line ${r.active ? "" : "text-slate-500"}`}>
          <div className="flex justify-between items-start gap-3">
            <span className="text-[13.5px] font-medium">{r.medicationName} <span className="font-mono text-xs font-normal text-slate-500">{r.dosage}</span></span>
            <span className="flex gap-1 flex-wrap justify-end">
              {(r.times ?? []).map((t) => <span key={t} className="font-mono text-xs px-1.5 py-0.5 border border-line-strong">{t}</span>)}
            </span>
          </div>
          <div className="flex justify-between items-center gap-3 text-xs">
            <span className="text-slate-500 truncate">
              {[FREQ_LABELS[r.frequency] ?? r.frequency, r.frequency === "weekly" && r.days?.join(", "), r.notes].filter(Boolean).join(" · ")}
            </span>
            <span className="flex items-center gap-3 shrink-0">
              <button type="button" onClick={() => onToggle(r)} className="text-blue-600 underline underline-offset-2 hover:text-ink">
                {r.active ? "Pause" : "Resume"}
              </button>
              <button type="button" onClick={() => onDelete(r._id)} className="text-red-700 underline underline-offset-2">Delete</button>
              <span className={`font-mono tracking-[0.04em] ${r.active ? "text-green-700" : "text-slate-500"}`}>{r.active ? "ACTIVE" : "PAUSED"}</span>
            </span>
          </div>
        </div>
      ))}
    </Section>
  );
}

// ── This week ─────────────────────────────────────────────────────────────────
function WeekGrid({ reminders }) {
  const now = new Date();
  const days = [...Array(7)].map((_, i) => { const d = new Date(now); d.setDate(d.getDate() - 6 + i); return d; });
  const week = adherence(reminders, now, 7);
  const cell = (r, d, i) => {
    const date = dateKey(d);
    const due = slotsOn([r], d).filter((s) => i < 6 || toMinutes(s.time) <= nowMinutes(now));
    if (!r.active) return "bg-sunken";
    if (!slotsOn([r], d).length) return "border border-dashed border-line-strong";
    if (!due.length) return "border border-dashed border-line-strong";
    const taken = due.filter((s) => isTaken(r, date, s.time)).length;
    if (taken === due.length) return "bg-risk-low";
    if (taken === 0) return "bg-red-50 border border-risk-critical";
    return "bg-[linear-gradient(90deg,#5b8f72_50%,#e9e6df_50%)]";
  };
  const legend = [["bg-risk-low", "Taken"], ["bg-[linear-gradient(90deg,#5b8f72_50%,#e9e6df_50%)]", "Partly taken"], ["bg-red-50 border border-risk-critical", "Missed"], ["bg-sunken", "Paused"]];

  return (
    <Section title="This week" aside={<span className="eyebrow">{week.pct == null ? "—" : `${week.pct}% · ${week.missed} missed`}</span>}>
      <div className="overflow-x-auto pt-3">
        <table className="w-full text-[13px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th />
              {days.map((d, i) => (
                <th key={i} className={`font-mono text-[11px] font-normal ${i === 6 ? "text-ink font-semibold" : "text-slate-500"}`}>
                  {d.toLocaleDateString([], { weekday: "narrow" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reminders.map((r) => (
              <tr key={r._id}>
                <td className="pr-2 truncate max-w-[120px]">{r.medicationName}</td>
                {days.map((d, i) => <td key={i}><div className={`h-4 min-w-[24px] ${cell(r, d, i)}`} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 pt-3 text-xs text-slate-600">
        {legend.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 ${c}`} />{l}</span>)}
      </div>
    </Section>
  );
}
