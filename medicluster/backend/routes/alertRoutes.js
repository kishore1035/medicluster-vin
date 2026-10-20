/**
 * backend/routes/alertRoutes.js
 * Alerts derived from every module: newly critical patients (clustering), missed doses (reminders)
 * and likely findings (imaging). Alerts aren't stored; their ids are stable so acknowledgements stick.
 */

const express = require("express");
const ClusterResult = require("../models/ClusterResult");
const Reminder = require("../models/Reminder");
const PatientMedia = require("../models/PatientMedia");
const AlertAck = require("../models/AlertAck");

const router = express.Router();

const HOUR = 3_600_000;
const DOSE_GRACE_MS = 30 * 60_000;      // a dose counts as missed 30 min after it was due
const IMAGING_WINDOW_MS = 7 * 24 * HOUR;
const FINDING_THRESHOLD = 0.5;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const runId = (id) => `RUN-${String(id).slice(-4).toUpperCase()}`;

async function clusteringAlerts() {
  const runs = await ClusterResult.find({}, { datasetId: 1, algorithm: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(20).lean();
  if (!runs.length) return [];
  const latest = runs[0];
  const prev = runs.slice(1).find((r) => String(r.datasetId) === String(latest.datasetId));
  const critical = async (id) => {
    const doc = await ClusterResult.findById(id, { patients: 1 }).lean();
    return (doc?.patients || []).filter((p) => p.risk_tier === "Critical");
  };
  const [now, before] = await Promise.all([critical(latest._id), prev ? critical(prev._id) : []]);
  const was = new Set(before.map((p) => p.patient_id));
  return now
    .filter((p) => !was.has(p.patient_id))
    .map((p) => ({
      id: `clu:${latest._id}:${p.patient_id}`,
      at: latest.createdAt,
      severity: "CRITICAL",
      source: "Clustering",
      patientId: p.patient_id,
      title: prev ? `${p.patient_id} moved to Critical` : `${p.patient_id} is in the critical tier`,
      body: `${runId(latest._id)} (${latest.algorithm}) placed this patient in cluster C${p.cluster_id}, the critical tier.`,
      facts: [
        ["Run", runId(latest._id)],
        ["Cluster", `C${p.cluster_id}`],
        p.systolic_bp != null && ["Systolic BP", `${Math.round(p.systolic_bp)} mmHg`],
        p.glucose != null && ["Glucose", `${Math.round(p.glucose)} mg/dL`],
        p.spo2 != null && ["SpO₂", `${p.spo2}%`],
      ].filter(Boolean),
      link: `/patient/${encodeURIComponent(p.patient_id)}`,
    }));
}

async function missedDoseAlerts(now) {
  const reminders = await Reminder.find({ active: true, frequency: { $ne: "as-needed" } }).lean();
  const alerts = [];
  for (const r of reminders) {
    for (const back of [1, 0]) {
      const day = new Date(now);
      day.setDate(day.getDate() - back);
      if (r.frequency === "weekly" && !(r.days || []).includes(WEEKDAYS[day.getDay()])) continue;
      const date = dateKey(day);
      for (const time of r.times || []) {
        const [h, m] = time.split(":").map(Number);
        const due = new Date(day);
        due.setHours(h, m, 0, 0);
        if (due < r.createdAt || due > now - DOSE_GRACE_MS || due < now - 24 * HOUR) continue;
        if ((r.doseLog || []).some((l) => l.date === date && l.time === time)) continue;
        alerts.push({
          id: `dose:${r._id}:${date}:${time}`,
          at: due,
          severity: "WARNING",
          source: "Reminders",
          patientId: r.patientId,
          title: `Missed dose: ${r.medicationName}${r.dosage ? ` ${r.dosage}` : ""}`,
          body: `Scheduled for ${time} and not marked as taken.`,
          facts: [["Medication", r.medicationName], ["Scheduled", `${date} ${time}`], ["Frequency", r.frequency]],
          link: `/reminders/${encodeURIComponent(r.patientId)}`,
        });
      }
    }
  }
  return alerts;
}

async function imagingAlerts(now) {
  const media = await PatientMedia.find(
    { "analysis.analyzedAt": { $gte: new Date(now - IMAGING_WINDOW_MS) } },
    { patient_id: 1, original_name: 1, analysis: 1 }
  ).lean();
  return media.flatMap((m) => {
    const top = [...(m.analysis?.findings || [])].sort((a, b) => b.confidence - a.confidence)[0];
    if (!top || top.confidence < FINDING_THRESHOLD ||
        m.analysis?.modality === "brain-mri" && (m.analysis.is_tumor === false || top.label === "No Tumor")) return [];
    return [{
      id: `img:${m._id}:${top.label}`,
      at: m.analysis.analyzedAt,
      severity: top.confidence >= 0.7 ? "HIGH" : "WARNING",
      source: "Imaging",
      patientId: m.patient_id,
      title: `${top.label} flagged on ${m.original_name}`,
      body: `${m.analysis.model || "Model"} estimated ${Math.round(top.confidence * 100)}% probability of ${top.label.toLowerCase()}.`,
      facts: [["File", m.original_name], ["Model", m.analysis.model || "—"], ["Probability", `${Math.round(top.confidence * 100)}%`]],
      link: `/patient/${encodeURIComponent(m.patient_id)}`,
    }];
  });
}

// ── GET /api/alerts ─────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const now = new Date();
    const groups = await Promise.all([clusteringAlerts(), missedDoseAlerts(now), imagingAlerts(now)]);
    const alerts = groups.flat().sort((a, b) => new Date(b.at) - new Date(a.at));
    const acks = await AlertAck.find({ userId: req.userId, alertId: { $in: alerts.map((a) => a.id) } }, { alertId: 1 }).lean();
    const read = new Set(acks.map((a) => a.alertId));
    return res.json(alerts.map((a) => ({ ...a, read: read.has(a.id) })));
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/alerts/ack ── body: { ids: [alertId] } ────────────────────────
router.post("/ack", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter((id) => typeof id === "string" && id.length <= 200).slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: "ids must be a non-empty array" });
    await AlertAck.bulkWrite(ids.map((alertId) => ({
      updateOne: { filter: { userId: req.userId, alertId }, update: { $setOnInsert: { userId: req.userId, alertId } }, upsert: true },
    })));
    return res.json({ acknowledged: ids.length });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
