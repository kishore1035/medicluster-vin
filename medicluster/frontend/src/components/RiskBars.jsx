import { Section } from "./ui";

const TIERS = [
  { name: "Low",      bar: "bg-risk-low" },
  { name: "Moderate", bar: "bg-risk-moderate" },
  { name: "High",     bar: "bg-risk-high" },
  { name: "Critical", bar: "bg-risk-critical" },
  { name: "Noise",    bar: "bg-risk-noise", optional: true },
];

// Risk distribution as one labelled bar per tier, scaled to the largest tier.
export default function RiskBars({ riskDistribution = {} }) {
  const total = Object.values(riskDistribution).reduce((a, b) => a + (b || 0), 0);
  const rows = TIERS.filter((t) => !t.optional || riskDistribution[t.name] > 0);
  const max = Math.max(1, ...rows.map((t) => riskDistribution[t.name] || 0));

  return (
    <Section title="Risk distribution">
      {rows.map((t) => {
        const n = riskDistribution[t.name] || 0;
        return (
          <div key={t.name} className="flex flex-col gap-1.5 py-2.5 border-b border-line">
            <div className="flex justify-between text-[13px]">
              <span>{t.name}</span>
              <span className="font-mono text-slate-600">
                {total ? `${n.toLocaleString()} · ${Math.round((n / total) * 100)}%` : "—"}
              </span>
            </div>
            <div className="h-1.5 bg-sunken" aria-hidden="true">
              <div className={`h-full ${t.bar}`} style={{ width: `${total ? (n / max) * 100 : 0}%` }} />
            </div>
          </div>
        );
      })}
    </Section>
  );
}
