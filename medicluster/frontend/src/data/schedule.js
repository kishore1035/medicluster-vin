// Dose-slot logic shared by the patient app and clinician reminders. A "slot" is one reminder time on one day,
// grouping every medicine due at that time.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local calendar date as YYYY-MM-DD (matches Reminder.doseLog.date). */
export function dateKey(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function nowMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

/** "20:00" → "8 pm", "08:30" → "8:30 am". */
export function formatTime12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

/** "in 2 h 15 m" / "15 m ago" relative to now. */
export function formatRelative(minutesFromNow) {
  const abs = Math.abs(minutesFromNow);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const span = h ? `${h} h ${m} m` : `${m} m`;
  if (minutesFromNow === 0) return "now";
  return minutesFromNow > 0 ? `in ${span}` : `${span} ago`;
}

/** "Metformin", "Metformin & Amlodipine", "A, B & C". */
export function joinNames(names) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function appliesOn(reminder, day) {
  if (!reminder.active || reminder.frequency === "as-needed") return false;
  if (reminder.createdAt && dateKey(new Date(reminder.createdAt)) > dateKey(day)) return false;
  if (reminder.frequency === "weekly") return (reminder.days ?? []).includes(WEEKDAYS[day.getDay()]);
  return true;
}

export function isTaken(reminder, date, time) {
  return (reminder.doseLog ?? []).some((l) => l.date === date && l.time === time);
}

/** Slots for one day, sorted by time: [{ date, time, reminders, taken }]. */
export function slotsOn(reminders, day) {
  const date = dateKey(day);
  const byTime = new Map();
  for (const r of reminders) {
    if (!appliesOn(r, day)) continue;
    for (const time of r.times ?? []) {
      if (!byTime.has(time)) byTime.set(time, []);
      byTime.get(time).push(r);
    }
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => toMinutes(a) - toMinutes(b))
    .map(([time, rems]) => ({
      date,
      time,
      reminders: rems,
      taken: rems.every((r) => isTaken(r, date, time)),
    }));
}

/** Dose adherence over the last `days` days, counting only doses already due. */
export function adherence(reminders, now = new Date(), days = 7) {
  let expected = 0;
  let taken = 0;
  for (let i = 0; i < days; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    for (const slot of slotsOn(reminders, day)) {
      if (i === 0 && toMinutes(slot.time) > nowMinutes(now)) continue;
      for (const r of slot.reminders) {
        expected += 1;
        if (isTaken(r, slot.date, slot.time)) taken += 1;
      }
    }
  }
  return {
    expected,
    taken,
    missed: expected - taken,
    pct: expected ? Math.round((taken / expected) * 100) : null,
  };
}

/** Doses per day for refill estimates (weekly reminders averaged over the week). */
export function dosesPerDay(reminder) {
  const perDay = (reminder.times ?? []).length;
  if (reminder.frequency === "weekly") return (perDay * (reminder.days ?? []).length) / 7;
  if (reminder.frequency === "as-needed") return 0;
  return perDay;
}
