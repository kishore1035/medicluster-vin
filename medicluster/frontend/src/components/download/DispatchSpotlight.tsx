import { useState } from "react";
import { Ambulance, ArrowUpRight, Check, ChevronDown, ClipboardList, Cross, MapPin, Navigation, Radio, ShieldCheck } from "lucide-react";
import Logo from "../Logo";
import type { ProductApp } from "./appTypes";

const DISPATCH_FEATURES = [
  { title: "Every incident, in view", body: "Review incoming calls and incident details in a shared dispatch workspace." },
  { title: "The right crew, connected", body: "Track ambulance availability and coordinate assignments with your crews." },
  { title: "A smoother handover", body: "Keep destination hospitals and patient handovers in the same response workflow." },
];
const CREW_FEATURES = [
  { title: "Ready for your shift", body: "Sign in with your employee ID and PIN, then manage your duty status." },
  { title: "Your next call, together", body: "Receive assigned calls and follow your mission from the scene to the hospital." },
  { title: "Keep the next team informed", body: "Share patient vitals and handover details with the team receiving your patient." },
];

function FeatureList({ prefix, features, selected, onSelect, href, link }: {
  prefix: string; features: typeof DISPATCH_FEATURES; selected: number;
  onSelect: (index: number) => void; href?: string | null; link: string;
}) {
  return <div className="mc-feature-list">
    {features.map((feature, index) => <div className="mc-feature" data-selected={selected === index || undefined} key={feature.title}>
      <button type="button" aria-expanded={selected === index} aria-controls={`${prefix}-feature-${index}`} onClick={() => onSelect(index)}>
        <span className="mc-feature-number">0{index + 1}</span>
        <span>{feature.title}</span><ChevronDown size={18} aria-hidden="true" />
      </button>
      <div className="mc-feature-description" id={`${prefix}-feature-${index}`} hidden={selected !== index}>
        <p>{feature.body}</p>
        {href && <a className="mc-text-link" href={href}>{link}<ArrowUpRight size={16} aria-hidden="true" /></a>}
      </div>
    </div>)}
  </div>;
}

function DispatchPreview({ selected }: { selected: number }) {
  const labels = ["Incident overview", "Ambulance availability", "Hospital handover"];
  return <div className="mc-dispatch-scene" role="group" aria-label="Illustrative dispatch dashboard preview">
    <span className="mc-preview-caption">Dispatch dashboard preview</span>
    <div className="mc-dispatch-window">
      <div className="mc-ops-window-bar"><span /><span /><span /><small>Workspace preview</small></div>
      <div className="mc-ops-toolbar"><Logo /><h3>Dispatch dashboard</h3><span className="mc-ops-preview-tag">Preview</span></div>
      <div className="mc-ops-workspace">
        <aside className="mc-ops-rail" aria-hidden="true"><Radio size={17} /><Ambulance size={17} /><Cross size={17} /><ClipboardList size={17} /></aside>
        <div className="mc-ops-map">
          <svg viewBox="0 0 500 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <rect width="500" height="420" fill="#e9ecdf" />
            <path d="M360 -20C290 60 400 140 310 220S280 330 350 450" stroke="#cadbd7" strokeWidth="46" fill="none" />
            <g fill="#dce3d0"><rect x="24" y="28" width="90" height="67" rx="14" /><rect x="165" y="155" width="100" height="65" rx="18" /><rect x="375" y="275" width="85" height="110" rx="18" /><rect x="35" y="295" width="100" height="75" rx="12" /></g>
            <g fill="none" stroke="#fbfaf7" strokeWidth="14"><path d="M-20 130L520 85M-20 260L520 235M135 -20L160 450M430 -20L405 450M-20 375L520 340M-20 10L520 430" /></g>
            <g fill="none" stroke="#d4d7ca" strokeWidth="1.5"><path d="M0 130L500 87M0 260L500 236M135 0L158 420M429 0L407 420M0 375L500 341" /></g>
            <path d={selected === 2 ? "M155 255L278 248L284 110L420 101" : "M155 255L151 121L280 113"} fill="none" stroke="#b56949" strokeWidth="4" strokeDasharray="7 5" strokeLinecap="round" />
            <g fill="#89917f" fontSize="10" fontFamily="sans-serif" letterSpacing="2"><text x="28" y="193">CENTRAL</text><text x="340" y="190">RIVERSIDE</text><text x="194" y="383">SOUTH DISTRICT</text></g>
          </svg>
          <span className="mc-map-pin mc-map-call"><Radio size={16} aria-hidden="true" /></span>
          <span className="mc-map-pin mc-map-unit"><Ambulance size={18} aria-hidden="true" /></span>
          <span className="mc-map-pin mc-map-hospital"><Cross size={16} aria-hidden="true" /></span>
          {selected === 1 && <span className="mc-map-pin mc-map-unit-secondary"><Ambulance size={18} aria-hidden="true" /></span>}
          <div className="mc-map-legend"><span />Illustrative map</div>
        </div>
        <div className="mc-ops-summary" aria-live="polite">
          <span className="mc-ops-summary-icon">{selected === 0 ? <Radio size={18} /> : selected === 1 ? <Ambulance size={18} /> : <Cross size={18} />}</span>
          <div><strong>{labels[selected]}</strong><p>{["A shared view of the response.", "Keep your team within reach.", "Connect the next step of care."][selected]}</p></div>
          <ArrowUpRight size={17} aria-hidden="true" />
        </div>
      </div>
      <div className="mc-ops-window-footer"><ShieldCheck size={12} aria-hidden="true" />Illustrative preview · No live incident data</div>
    </div>
    <div className="mc-ops-scene-note"><span>One shared view.</span><span>A more connected response.</span></div>
  </div>;
}

function CrewPreview({ selected, onSelect }: { selected: number; onSelect: (index: number) => void }) {
  return <div className="mc-crew-scene" role="group" aria-label="Illustrative crew app preview">
    <span className="mc-preview-caption">Crew app preview · Illustrative screens</span>
    <div className="mc-crew-orbit" aria-hidden="true" /><div className="mc-crew-plinth" aria-hidden="true" />
    <div className="mc-phone mc-crew-phone">
      <div className="mc-phone-camera" />
      <div className="mc-phone-screen">
        <div className="mc-phone-brand"><Logo /><span>MediCluster</span><span className="mc-phone-avatar"><Radio size={13} aria-hidden="true" /></span></div>
        <h3 className="mc-crew-app-name">Dispatch crew app</h3>
        <p className="mc-crew-greeting">{["Your shift", "Your calls", "Patient handover"][selected]}</p>
        <div className="mc-crew-preview-body" aria-live="polite">
          {selected === 0 ? <>
            <div className="mc-crew-duty"><span /><span>Ready when you are</span><Check size={14} aria-hidden="true" /></div>
            <div className="mc-crew-empty"><span className="mc-crew-symbol"><Ambulance size={30} strokeWidth={1.25} /></span><h4>Start with your team.</h4><p>Your duty status and assigned ambulance, together in one place.</p></div>
            <div className="mc-crew-detail"><ShieldCheck size={17} /><div><strong>Your own workspace</strong><p>Employee ID and PIN</p></div></div>
          </> : selected === 1 ? <>
            <div className="mc-crew-duty"><span /><span>Mission workspace</span><Navigation size={14} /></div>
            <div className="mc-crew-empty"><span className="mc-crew-symbol"><MapPin size={30} strokeWidth={1.25} /></span><h4>Know your next step.</h4><p>Assigned calls, scene details and hospital destination appear here.</p></div>
            <div className="mc-crew-detail"><Radio size={17} /><div><strong>Connected to dispatch</strong><p>From the call to the handover</p></div></div>
          </> : <>
            <div className="mc-crew-duty"><span /><span>Keep care connected</span><ClipboardList size={14} /></div>
            <div className="mc-crew-empty"><span className="mc-crew-symbol"><ClipboardList size={30} strokeWidth={1.25} /></span><h4>Pass care forward.</h4><p>Record patient vitals and share a clear handover with the receiving team.</p></div>
            <div className="mc-crew-detail"><Cross size={17} /><div><strong>For the next care team</strong><p>Patient details in one place</p></div></div>
          </>}
        </div>
        <nav className="mc-phone-nav" aria-label="Crew preview sections">
          {[{ icon: Ambulance, label: "Shift" }, { icon: Navigation, label: "Calls" }, { icon: ClipboardList, label: "Handover" }].map((item, index) => <button key={item.label} type="button" aria-pressed={selected === index} onClick={() => onSelect(index)}><item.icon size={17} aria-hidden="true" />{item.label}</button>)}
        </nav>
      </div>
    </div>
    <p className="mc-crew-scene-note">With you. Through every shift.</p>
  </div>;
}

export default function DispatchSpotlight({ apps }: { apps: ProductApp[] }) {
  const [dispatchFeature, setDispatchFeature] = useState(0);
  const [crewFeature, setCrewFeature] = useState(0);
  const dispatch = apps.find(app => app.id === "dispatch");
  const crew = apps.find(app => app.id === "crew");
  return <div id="emergency-workspaces">
    <section className="mc-spotlight mc-ops-spotlight mc-container" aria-labelledby="dispatch-title">
      <div className="mc-spotlight-copy">
        <p className="mc-section-label">Dispatch dashboard</p>
        <h2 id="dispatch-title">Every call.<br />A clear <em>direction.</em></h2>
        <p className="mc-body">Incidents, ambulances and hospitals. Bring every part of the response into one shared view.</p>
        <FeatureList prefix="dispatch" features={DISPATCH_FEATURES} selected={dispatchFeature} onSelect={setDispatchFeature} href={dispatch?.webHref} link="Open dispatch dashboard" />
        <p className="mc-ops-signin">Sign in with your dispatch account email and password.</p>
        {!dispatch?.webHref && <p className="mc-ops-signin">Dispatch web workspace is currently unavailable.</p>}
      </div>
      <DispatchPreview selected={dispatchFeature} />
    </section>
    <section className="mc-spotlight mc-ops-spotlight mc-crew-spotlight mc-container" aria-labelledby="crew-title">
      <CrewPreview selected={crewFeature} onSelect={setCrewFeature} />
      <div className="mc-spotlight-copy">
        <p className="mc-section-label">For ambulance crews</p>
        <h2 id="crew-title">Your shift.<br />In good <em>hands.</em></h2>
        <p className="mc-body">A clear place for your duty, your calls and your patient handovers. Wherever the next call takes you.</p>
        <FeatureList prefix="crew" features={CREW_FEATURES} selected={crewFeature} onSelect={setCrewFeature} href={crew?.webHref} link="Open crew web app" />
        <a className="mc-text-link mc-crew-download-link" href="#crew">Get Crew for Android<ArrowUpRight size={18} aria-hidden="true" /></a>
        <p className="mc-ops-signin">Employee ID and PIN sign-in. Available on Android and the web.</p>
      </div>
    </section>
  </div>;
}
