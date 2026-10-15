// Plain-language reading assessment for the patient app.
// Thresholds follow common adult targets (ADA glucose, ACC/AHA blood pressure).

export const READING_TYPES = {
  glucose: { label: "Blood sugar", short: "Blood sugar", unit: "mg/dL" },
  bp: { label: "Blood pressure", short: "BP", unit: "mmHg" },
  weight: { label: "Weight", short: "Weight", unit: "kg" },
};

export const GLUCOSE_CONTEXTS = [
  { value: "fasting", label: "Fasting" },
  { value: "after-meal", label: "After a meal" },
  { value: "bedtime", label: "Bedtime" },
];

export function glucoseTarget(context) {
  return context === "fasting" ? 130 : 180;
}

export function formatValue(reading) {
  if (reading.type === "bp") return `${reading.value}/${reading.diastolic}`;
  return String(reading.value);
}

/**
 * @returns {{ level: "good"|"warn"|"bad"|"neutral", text: string }}
 * `previous` is the prior reading of the same type (weight trend only).
 */
export function assess(reading, previous) {
  const v = reading.value;
  if (reading.type === "glucose") {
    if (v < 70) return { level: "bad", text: "Low" };
    if (v >= 250) return { level: "bad", text: "Very high" };
    if (v > glucoseTarget(reading.context)) return { level: "warn", text: "Above target" };
    return { level: "good", text: "In target" };
  }
  if (reading.type === "bp") {
    const d = reading.diastolic;
    if (v >= 180 || d >= 120) return { level: "bad", text: "Very high" };
    if (v >= 140 || d >= 90) return { level: "warn", text: "High" };
    if (v >= 130 || d >= 80) return { level: "warn", text: "A little high" };
    if (v < 90 || d < 60) return { level: "warn", text: "Low" };
    return { level: "good", text: "Normal" };
  }
  if (!previous) return { level: "neutral", text: "First reading" };
  const diff = Math.round((v - previous.value) * 10) / 10;
  if (diff < 0) return { level: "good", text: `Down ${Math.abs(diff)} kg` };
  if (diff > 0) return { level: "neutral", text: `Up ${diff} kg` };
  return { level: "neutral", text: "No change" };
}

export const LEVEL_TEXT = {
  good: "text-emerald-700",
  warn: "text-orange-600",
  bad: "text-red-600",
  neutral: "text-slate-500",
};

export const LEVEL_BAR = {
  good: "bg-emerald-500",
  warn: "bg-orange-400",
  bad: "bg-red-500",
  neutral: "bg-slate-500",
};

const SEVERITY = { good: 0, neutral: 0, warn: 1, bad: 2 };
export const TIERS = ["Low", "Moderate", "High", "Critical"];

const DRIVER_ADVICE = {
  glucose: "Mostly due to blood sugar. Keeping up with your diabetes medicines and diet plan is the biggest help.",
  bp: "Mostly due to blood pressure. Taking your BP medicines on time and cutting down on salt helps most.",
};

/**
 * Risk tier from the latest glucose and BP readings.
 * @param {Array} readings newest first
 * @returns {null | { tier: string, index: number, advice: string }}
 */
export function riskFromReadings(readings) {
  const latest = ["glucose", "bp"]
    .map((type) => readings.find((r) => r.type === type))
    .filter(Boolean);
  if (!latest.length) return null;

  const scored = latest.map((r) => ({ type: r.type, severity: SEVERITY[assess(r).level] }));
  const total = scored.reduce((sum, s) => sum + s.severity, 0);
  const index = Math.min(total, 3);
  const driver = scored.reduce((a, b) => (b.severity > a.severity ? b : a));

  return {
    tier: TIERS[index],
    index,
    advice: driver.severity
      ? DRIVER_ADVICE[driver.type]
      : "Your recent readings are in range. Keep taking your medicines as planned.",
  };
}
