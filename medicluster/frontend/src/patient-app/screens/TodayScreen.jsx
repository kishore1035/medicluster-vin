import React, { useState } from "react";
import { Link } from "react-router-dom";
import { usePatient, TabBar, slotKey } from "../PatientApp";
import { Body, ListHeader, ErrorNote, initials } from "../ui";
import { adherence, formatRelative, formatTime12, joinNames, nowMinutes, toMinutes } from "../../data/schedule";

function greeting(now) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function TodayScreen() {
  const { profile, reminders, todaySlots, now, snoozes, takeSlot, snoozeSlot, loading, error, apiError } = usePatient();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const next = todaySlots.find((s) => !s.taken);
  const doses = todaySlots.flatMap((s) => s.reminders.map((r) => ({ r, s })));
  const takenCount = doses.filter(({ r, s }) => (r.doseLog ?? []).some((l) => l.date === s.date && l.time === s.time)).length;
  const week = adherence(reminders, now);
  const firstName = (profile?.name ?? "").split(/\s+/)[0];

  const snoozedUntil = next && snoozes[slotKey(next)] > now.getTime() ? new Date(snoozes[slotKey(next)]) : null;
  const notes = next ? [...new Set(next.reminders.map((r) => r.notes).filter(Boolean))] : [];

  let headline = "No medicines scheduled today";
  if (next) headline = `Next: ${joinNames(next.reminders.map((r) => r.medicationName))} at ${formatTime12(next.time)}`;
  else if (todaySlots.length) headline = "All done for today";

  const take = async () => {
    setBusy(true);
    setActionError("");
    try {
      await takeSlot(next);
    } catch (err) {
      setActionError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const canNotify = typeof window !== "undefined" && "Notification" in window && Notification.permission === "default";
  const [, forceRender] = useState(0);

  return (
    <>
      <Body className="px-[22px] pt-[18px] pb-6 flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <span className="font-mono text-[11px] tracking-[0.08em] text-slate-500">
            {now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "").toUpperCase()}
          </span>
          <Link
            to="/app/profile"
            aria-label="Profile and settings"
            className="w-[34px] h-[34px] rounded-full bg-sunken grid place-items-center text-xs font-semibold"
          >
            {initials(profile?.name)}
          </Link>
        </div>

        <ErrorNote>{error}</ErrorNote>

        <div className="flex flex-col gap-1.5">
          <span className="text-[15px] text-slate-600">
            {greeting(now)}{firstName ? `, ${firstName}` : ""}
          </span>
          <h1 className="m-0 font-serif text-[34px] leading-[1.1] tracking-[-0.01em]">
            {loading ? "Loading…" : headline}
          </h1>
          {!loading && !todaySlots.length && (
            <span className="text-sm text-slate-500">Your care team adds medicines to your plan in MediCluster.</span>
          )}
        </div>

        {next && (
          <div className="flex flex-col gap-2.5 p-4 bg-surface border border-line rounded">
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-medium">
                {notes.length ? notes.join("; ") : next.reminders.map((r) => r.dosage).filter(Boolean).join(", ") || "Your scheduled dose"}
              </span>
              <span className="font-mono text-slate-500 shrink-0">
                {snoozedUntil
                  ? `snoozed to ${snoozedUntil.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : formatRelative(toMinutes(next.time) - nowMinutes(now))}
              </span>
            </div>
            <ErrorNote>{actionError}</ErrorNote>
            <div className="flex gap-2">
              <button
                onClick={take}
                disabled={busy}
                className="flex-1 h-12 rounded bg-ink text-paper text-[15px] font-medium disabled:opacity-50"
              >
                {busy ? "Saving…" : next.reminders.length > 1 ? "I’ve taken them" : "I’ve taken it"}
              </button>
              <button
                onClick={() => snoozeSlot(next)}
                disabled={busy}
                className="h-12 px-4 rounded border border-line-strong text-[15px]"
              >
                Later
              </button>
            </div>
          </div>
        )}

        {todaySlots.length > 0 && (
          <div className="flex flex-col">
            <ListHeader title="Today" meta={`${takenCount} of ${doses.length}`} />
            {todaySlots.map((slot) => {
              const isNext = slot === next;
              const overdue = !slot.taken && toMinutes(slot.time) < nowMinutes(now);
              return (
                <div
                  key={slot.time}
                  className="grid grid-cols-[52px_14px_1fr_auto] gap-3 items-center min-h-[52px] py-2 border-b border-line text-sm"
                >
                  <span className={`font-mono ${slot.taken ? "text-slate-500" : ""}`}>{slot.time}</span>
                  <span className={`w-2.5 h-2.5 ${slot.taken ? "bg-emerald-500" : "border-[1.5px] border-ink"}`} />
                  <span className={isNext ? "font-medium" : ""}>
                    {slot.reminders.map((r) => r.medicationName).join(", ")}
                  </span>
                  <span className={`text-xs ${slot.taken ? "text-emerald-700" : overdue ? "text-orange-600" : "text-slate-500"}`}>
                    {slot.taken ? "Taken" : overdue ? "Overdue" : "Due"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {week.pct != null && (
          <div className="flex justify-between items-center py-3.5 border-b border-line">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">This week</span>
              <span className="text-xs text-slate-500">
                {week.missed ? `${week.missed} missed dose${week.missed > 1 ? "s" : ""}` : "No missed doses"}
              </span>
            </div>
            <span className="font-serif text-[30px]">{week.pct}%</span>
          </div>
        )}

        <div className="flex flex-col border-t border-line">
          {canNotify && (
            <button
              onClick={() => Notification.requestPermission().then(() => forceRender((n) => n + 1))}
              className="flex justify-between items-center min-h-12 border-b border-line text-sm text-left"
            >
              <span>Turn on reminder alerts</span><span className="text-slate-500">›</span>
            </button>
          )}
          <Link to="/app/visits" className="flex justify-between items-center min-h-12 border-b border-line text-sm">
            <span>Visits &amp; medicines</span><span className="text-slate-500">›</span>
          </Link>
          <Link to="/app/emergency" className="flex justify-between items-center min-h-12 border-b border-line text-sm text-red-600 font-medium">
            <span>Emergency help</span><span>›</span>
          </Link>
        </div>
      </Body>
      <TabBar />
    </>
  );
}
