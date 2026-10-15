import { DISPATCH_URL } from "../navigation";

// Who signs in where. Shown on every sign-in screen so nobody tries the wrong door.
const ACCESS = [
  { id: "clinician",  who: "Doctors, nurses & analysts", what: "Patients, clustering, imaging, reminders, reports", how: "Hospital email + password",           where: "This web app",            href: "/login" },
  { id: "patient",    who: "Patients",                  what: "Your medicines, reminders, readings and CliniQ",    how: "Mobile number + 6-digit text code",   where: "MediCluster mobile app",  href: "/app" },
  { id: "dispatcher", who: "Dispatchers",               what: "Live incidents, ambulances, hospitals and radio",   how: "Dispatch account email + password",   where: "Dispatch center",         href: `${DISPATCH_URL}/#/login` },
  { id: "crew",       who: "Ambulance crews",           what: "Duty status, incoming calls, missions and radio",   how: "Employee ID + 4-digit PIN",           where: "Crew app",                href: `${DISPATCH_URL}/#/driver/login` },
];

/** Compact list of every role, its sign-in method and a link to the right screen. `current` is highlighted. */
export default function AccessGuide({ current, dark = false, className = "" }) {
  const muted = dark ? "text-[#b3b4b3]" : "text-slate-600";
  const faint = dark ? "text-[#8a8c8e]" : "text-slate-500";
  const rule = dark ? "border-[#2e3036]" : "border-line";
  return (
    <section aria-labelledby="access-guide" className={`flex flex-col ${className}`}>
      <h2 id="access-guide" className={`font-mono text-[11px] tracking-[0.08em] uppercase pb-2 border-b ${dark ? "border-[#45484d] text-[#8a8c8e]" : "border-ink text-slate-500"}`}>
        Who signs in where
      </h2>
      <ul>
        {ACCESS.map((a) => {
          const here = a.id === current;
          return (
            <li key={a.id} className={`py-3 border-b ${rule} flex flex-col gap-0.5`}>
              <div className="flex justify-between items-baseline gap-3">
                <span className="text-[13.5px] font-medium">{a.who}</span>
                {here
                  ? <span className={`font-mono text-[10.5px] tracking-[0.06em] uppercase ${faint}`}>You are here</span>
                  : <a href={a.href} className={`text-[12.5px] underline underline-offset-2 whitespace-nowrap ${dark ? "text-[#ecebe6]" : "text-blue-600 hover:text-ink"}`}>{a.where} →</a>}
              </div>
              <span className={`text-[12.5px] ${muted}`}>{a.what}</span>
              <span className={`font-mono text-[11px] ${faint}`}>{a.how}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
