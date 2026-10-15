import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { dispatchEmergency } from "../../api/apiClient";
import { fetchNearbyHospitals } from "../../api/nearbyHospitals";
import { usePatient } from "../PatientApp";
import { Body, ListHeader, TopBar } from "../ui";

const HOLD_MS = 3000;
const AMBULANCE_NUMBER = "108";

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 60_000 }
    );
  });
}

function SosButton({ onTrigger, disabled }) {
  const [progress, setProgress] = useState(0);
  const start = useRef(null);
  const frame = useRef(null);

  const stop = () => {
    cancelAnimationFrame(frame.current);
    start.current = null;
    setProgress(0);
  };

  const begin = () => {
    if (disabled || start.current) return;
    start.current = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start.current) / HOLD_MS, 1);
      setProgress(p);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else { stop(); onTrigger(); }
    };
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const holdKey = (e) => (e.key === " " || e.key === "Enter") && !e.repeat;
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => { if (holdKey(e)) { e.preventDefault(); begin(); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") stop(); }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="SOS. Press and hold for 3 seconds to call an ambulance"
      className="relative w-[200px] h-[200px] rounded-full bg-red-500 text-white flex flex-col items-center justify-center gap-1 shadow-[0_0_0_14px_#f1d9d6] select-none touch-none disabled:opacity-60"
      style={{ WebkitTouchCallout: "none" }}
    >
      <svg className="absolute -inset-[14px] w-[228px] h-[228px] -rotate-90 pointer-events-none" viewBox="0 0 228 228" aria-hidden="true">
        <circle cx="114" cy="114" r="107" fill="none" stroke="#a82f2a" strokeWidth="14"
          strokeDasharray={2 * Math.PI * 107} strokeDashoffset={(1 - progress) * 2 * Math.PI * 107} />
      </svg>
      <span className="font-serif text-[40px] leading-none">SOS</span>
      <span className="text-[13px]">{progress > 0 ? "Keep holding…" : "Hold for 3 seconds"}</span>
    </button>
  );
}

export default function EmergencyScreen() {
  const { patientId, profile } = usePatient();
  const [hospitals, setHospitals] = useState(null); // null = loading
  const [hospitalError, setHospitalError] = useState("");
  const [status, setStatus] = useState("");
  const [calling, setCalling] = useState(false);
  const contact = profile?.emergencyContact;

  useEffect(() => {
    let cancelled = false;
    getPosition().then(async (pos) => {
      if (!pos) {
        if (!cancelled) { setHospitals([]); setHospitalError("Turn on location to see the nearest hospitals."); }
        return;
      }
      try {
        const list = await fetchNearbyHospitals(pos, 5);
        if (!cancelled) setHospitals(list.filter((h) => h.isHospital !== false).slice(0, 3));
      } catch {
        if (!cancelled) { setHospitals([]); setHospitalError("Couldn't load nearby hospitals right now."); }
      }
    });
    return () => { cancelled = true; };
  }, []);

  const triggerSos = async () => {
    setCalling(true);
    navigator.vibrate?.(200);
    setStatus(`Calling ${AMBULANCE_NUMBER}…`);
    // Start the phone call first; alerting dispatch must never delay it.
    window.location.href = `tel:${AMBULANCE_NUMBER}`;
    const pos = await getPosition();
    try {
      await dispatchEmergency({
        caller_location: pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : "Unknown — patient app SOS",
        reported_condition: `Patient SOS from MediCluster app: ${profile?.name || "patient"} (ID ${patientId})`,
        severity_score: 8,
      });
      setStatus(`Calling ${AMBULANCE_NUMBER}. Dispatch has your ${pos ? "location and " : ""}details.`);
    } catch {
      setStatus(`Calling ${AMBULANCE_NUMBER}. Couldn't alert dispatch — tell the operator where you are.`);
    } finally {
      setCalling(false);
    }
  };

  return (
    <>
      <TopBar back="/app" title="Emergency" />
      <Body className="p-[22px] flex flex-col gap-[22px]">
        <div className="flex flex-col items-center gap-3.5 pt-5 pb-1">
          <SosButton onTrigger={triggerSos} disabled={calling} />
          <span className="text-sm text-slate-600 text-center leading-normal max-w-[280px]" aria-live="assertive">
            {status || `Calls an ambulance (${AMBULANCE_NUMBER}) and shares your location and details with dispatch.`}
          </span>
        </div>

        <div className="flex flex-col">
          <ListHeader title="Nearest hospitals" meta="NEAR YOU" />
          {hospitals === null && <span className="py-3 text-sm text-slate-500">Finding hospitals…</span>}
          {hospitalError && <span className="py-3 text-sm text-slate-500">{hospitalError}</span>}
          {hospitals?.length === 0 && !hospitalError && (
            <span className="py-3 text-sm text-slate-500">No hospitals found within 5 km.</span>
          )}
          {hospitals?.map((h) => (
            <div key={h.place_id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 items-center py-3 border-b border-line">
              <span className="text-sm font-medium">{h.name}</span>
              <span className="font-mono text-[13px]">{h.distKm.toFixed(1)} km</span>
              <span className="text-xs text-slate-500">
                {[h.emergency && "24h emergency", h.address].filter(Boolean).join(" · ") || "Hospital"}
              </span>
              {h.phone ? (
                <a href={`tel:${h.phone.split(/[;,]/)[0].replace(/\s/g, "")}`} className="text-[13px] text-blue-600 underline">Call</a>
              ) : (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] text-blue-600 underline"
                >
                  Directions
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center gap-3 p-3.5 border border-line-strong rounded">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium">Emergency contact</span>
            <span className="text-xs text-slate-500 truncate">
              {contact?.name
                ? `${contact.name}${contact.relation ? ` (${contact.relation})` : ""}${contact.phone ? ` · ${contact.phone}` : ""}`
                : "Not set yet"}
            </span>
          </div>
          {contact?.phone ? (
            <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="h-10 px-3.5 grid place-items-center bg-ink text-paper rounded text-[13px] shrink-0">
              Call
            </a>
          ) : (
            <Link to="/app/profile" className="h-10 px-3.5 grid place-items-center border border-ink rounded text-[13px] shrink-0">
              Add
            </Link>
          )}
        </div>
      </Body>
    </>
  );
}
