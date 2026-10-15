import React, { useState } from "react";
import { formatTime12 } from "../data/schedule";

/** Lock-screen style reminder for a due dose slot. */
export default function ReminderAlert({ slot, now, onTaken, onSnooze, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const meds = slot.reminders.map((r) => `${r.medicationName}${r.dosage ? ` ${r.dosage}` : ""}`);
  const notes = [...new Set(slot.reminders.map((r) => r.notes).filter(Boolean))];
  const body = `${meds.length > 1 ? `${meds.slice(0, -1).join(", ")} and ${meds.at(-1)}` : meds[0]}${notes.length ? `, ${notes.join("; ").toLowerCase()}` : ""}.`;

  const taken = async () => {
    setBusy(true);
    setError("");
    try {
      await onTaken();
    } catch {
      setError("Couldn't save. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dose-alert-title"
      className="absolute inset-0 z-50 flex flex-col items-center px-3.5 bg-[#1c1d20]/95 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <span className="mt-24 text-lg text-[#b3b4b3]">
        {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      </span>
      <span className="font-serif text-[96px] leading-none text-[#ecebe6]">
        {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "")}
      </span>

      <div className="mt-auto mb-28 w-full p-4 bg-[#ecebe6]/95 rounded-[18px] flex flex-col gap-2.5 text-ink">
        <div className="flex justify-between text-xs text-slate-600">
          <span className="font-semibold tracking-wide">MEDICLUSTER</span>
          <span>now</span>
        </div>
        <span id="dose-alert-title" className="text-[15px] font-semibold">
          Time for your {formatTime12(slot.time)} medicines
        </span>
        <span className="text-sm leading-snug">{body}</span>
        {error && <span className="text-xs text-red-600">{error}</span>}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={taken}
            disabled={busy}
            className="h-11 rounded-[10px] bg-ink text-paper text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Saving…" : "Taken"}
          </button>
          <button onClick={onSnooze} disabled={busy} className="h-11 rounded-[10px] bg-line text-sm">
            Snooze 30 min
          </button>
        </div>
      </div>
    </div>
  );
}
