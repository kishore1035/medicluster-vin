import { useRef } from "react";
import useCardDepth from "./useCardDepth";
import { ArrowRight } from "lucide-react";
import type { ProductApp } from "./appTypes";
import "./workspace-showcase.css";

const CONTENT = [
  { id: "medicluster", title: "MediCluster", detail: "CLINICIANS · PATIENT DATA · RISK ANALYSIS", image: "clinical", alt: "Surgeons working together under operating-room lighting" },
  { id: "patient", title: "Patient app", detail: "EVERYDAY CARE · MEDICINES · HEALTH READINGS", image: "everyday", alt: "A stethoscope resting on soft fabric in natural light" },
  { id: "dispatch", title: "Dispatch dashboard", detail: "DISPATCH · INCIDENTS · FLEET COORDINATION", image: "response", alt: "A prepared hospital operating room with monitoring equipment" },
  { id: "crew", title: "Crew app", detail: "AMBULANCE CREWS · CALLS · PATIENT HANDOVER", image: "team", alt: "A medical team gathered around an operating-room light" },
];

export default function WorkspaceShowcase({ apps, paused = false }: { apps: ProductApp[]; paused?: boolean }) {
  const root = useRef<HTMLElement>(null);
  useCardDepth(root, paused);
  return <section className="mc-workspaces" aria-labelledby="workspace-showcase-title" ref={root}>
    <div className="mc-container">
      <div className="mc-workspaces-heading" data-reveal>
        <div><p className="mc-section-label">Explore the platform</p><h2 id="workspace-showcase-title">A workspace for every part of care.</h2></div>
        <p>Four ways in. One connected platform.<br />Find the space made for your day.</p>
      </div>
      <div className="mc-workspace-grid">
        {CONTENT.map(item => {
          const app = apps.find(app => app.id === item.id);
          const href = item.id === "crew" ? "#crew" : app?.webHref;
          const visual = <>
            <div className="mc-workspace-media" data-depth="3">
              <img className="mc-workspace-image" src={`/images/medical-${item.image}.jpg`} alt={item.alt} loading="lazy" width="1400" height="933" />
              <canvas className="mc-workspace-depth" aria-hidden="true" />
            </div>
            <div className="mc-workspace-caption" data-depth="4">
              <p className="mc-workspace-meta">{item.detail.replaceAll(" · ", " • ")}</p>
              <h3><ArrowRight className="mc-workspace-title-arrow" aria-hidden="true" /><span className="mc-workspace-title-mask">{item.title}</span></h3>
            </div>
          </>;
          return <article key={item.id} className="mc-workspace-item" data-reveal>
            {href ? <a className="mc-workspace-card" data-app={item.id} href={href} aria-label={`Explore ${item.title}`}>{visual}</a>
              : <div className="mc-workspace-card" data-app={item.id}>{visual}<p className="mc-workspace-unavailable">Web workspace currently unavailable.</p></div>}
          </article>;
        })}
      </div>
    </div>
  </section>;
}
