import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import Logo from "../Logo";

const METHODS = [
  {
    id: "kmeans",
    label: "K-Means",
    description: "Group similar records around cluster centers.",
  },
  {
    id: "dbscan",
    label: "DBSCAN",
    description: "Find dense groups and identify records outside them.",
  },
  {
    id: "hierarchical",
    label: "Hierarchical",
    description: "Follow the relationships between groups in a hierarchy.",
  },
  {
    id: "gmm",
    label: "GMM",
    description: "Explore overlapping groups with a mixture model.",
  },
] as const;
type Method = (typeof METHODS)[number]["id"];
const COLORS = ["#82976c", "#c87350", "#a594b8"];

function PopulationMap({
  method,
  focus,
}: {
  method: Method;
  focus: number | null;
}) {
  const hierarchy = method === "hierarchical";
  const centers =
    method === "gmm"
      ? [
          [184, 129],
          [302, 104],
          [301, 192],
        ]
      : [
          [150, 126],
          [366, 94],
          [321, 213],
        ];
  const opacity = (group: number) =>
    focus === null || focus === group ? 1 : 0.16;
  return (
    <svg
      className="mc-population-map"
      viewBox="0 0 520 310"
      role="img"
      aria-label={`${METHODS.find((item) => item.id === method)?.label} illustration, not patient results${focus === null ? "" : `, group ${focus + 1} focused`}`}
    >
      {hierarchy ? (
        <>
          <path
            d="M260 30V60M150 100V60H370V100"
            fill="none"
            stroke="#aeb6a5"
            strokeWidth="1.5"
          />
          {[0, 1, 2].map((group) => {
            const x = [115, 260, 405][group];
            return (
              <g key={group} opacity={opacity(group)} data-cluster={group}>
                <path
                  d={`M${group === 0 ? 150 : 370} 100H${x}V135M${x - 42} 170V135H${x + 42}V170`}
                  fill="none"
                  stroke={COLORS[group]}
                  strokeWidth="1.5"
                />
                {[-1, 1].map((side) => (
                  <g key={side}>
                    <path
                      d={`M${x + side * 42} 170V195M${x + side * 42 - 20} 225V195H${x + side * 42 + 20}V225`}
                      stroke={COLORS[group]}
                      fill="none"
                      strokeWidth="1.5"
                    />
                    {[-1, 1].map((leaf) => (
                      <circle
                        key={leaf}
                        cx={x + side * 42 + leaf * 20}
                        cy="225"
                        r="7"
                        fill={COLORS[group]}
                        fillOpacity=".75"
                      />
                    ))}
                  </g>
                ))}
                <text x={x} y="266" textAnchor="middle" fill={COLORS[group]}>
                  Group 0{group + 1}
                </text>
              </g>
            );
          })}
          <text x="260" y="294" textAnchor="middle" fill="#737d69">
            Illustrative group hierarchy
          </text>
        </>
      ) : (
        <>
          {[72, 134, 196, 258].map((y) => (
            <path
              key={y}
              d={`M48 ${y}H495`}
              stroke="#eceee7"
              strokeDasharray="3 5"
            />
          ))}
          {[95, 190, 285, 380, 475].map((x) => (
            <path key={x} d={`M${x} 28V258`} stroke="#f1f2ec" />
          ))}
          <path d="M48 28V258H495" stroke="#bfc6b7" fill="none" />
          <text x="275" y="294" textAnchor="middle" fill="#737d69">
            Component 1
          </text>
          <text
            transform="translate(15 146) rotate(-90)"
            textAnchor="middle"
            fill="#737d69"
          >
            Component 2
          </text>
          {centers.map(([cx, cy], group) => (
            <g key={group} opacity={opacity(group)} data-cluster={group}>
              {[1, 0.7, 0.4].map((scale) => (
                <ellipse
                  key={scale}
                  cx={cx}
                  cy={cy}
                  rx={(method === "gmm" ? 91 : 70) * scale}
                  ry={(method === "gmm" ? 62 : 48) * scale}
                  fill={COLORS[group]}
                  fillOpacity={method === "gmm" ? 0.055 : 0.045}
                />
              ))}
              {method === "dbscan" && (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx="76"
                  ry="50"
                  fill="none"
                  stroke={COLORS[group]}
                  strokeOpacity=".45"
                  strokeDasharray="3 4"
                />
              )}
              {Array.from({ length: 44 }, (_, index) => {
                const angle = index * 2.3999632297 + group;
                const radius = Math.sqrt(((index * 37 + 13) % 101) / 101);
                const x =
                  cx + Math.cos(angle) * radius * (method === "gmm" ? 77 : 63);
                const y =
                  cy + Math.sin(angle) * radius * (method === "gmm" ? 49 : 39);
                return (
                  <circle
                    key={index}
                    cx={x}
                    cy={y}
                    r={index % 6 === 0 ? 2.8 : 2}
                    fill={COLORS[group]}
                    fillOpacity={index % 4 === 0 ? 0.5 : 0.85}
                  />
                );
              })}
              {method === "kmeans" && (
                <path
                  d={`M${cx - 5} ${cy}H${cx + 5}M${cx} ${cy - 5}V${cy + 5}`}
                  stroke={COLORS[group]}
                  strokeWidth="2"
                />
              )}
            </g>
          ))}
          {method === "dbscan" &&
            [
              [75, 219],
              [268, 45],
              [462, 179],
              [222, 201],
            ].map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r="2.6" fill="#7b8278" />
            ))}
        </>
      )}
    </svg>
  );
}

export default function ClinicalSpotlight() {
  const [method, setMethod] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);
  const current = METHODS[method];
  const changeMethod = (index: number, focusTab = false) => {
    setMethod(index);
    if (focusTab)
      document.getElementById(`method-${METHODS[index].id}`)?.focus();
  };
  return (
    <section
      className="mc-clinical mc-container"
      id="clinical"
      aria-labelledby="clinical-title"
    >
      <div className="mc-clinical-copy" data-reveal>
        <p className="mc-section-label">For clinical teams</p>
        <h2 id="clinical-title">
          See the patterns.
          <br />
          Consider the
          <br />
          <em>person.</em>
        </h2>
        <p className="mc-body">
          Bring patient vitals into focus. Explore clustering methods and review
          patients by risk tier.
        </p>
        <a
          href="/login"
          className="download-pill download-pill-dark mc-clinical-cta"
        >
          Open clinician workspace <ArrowUpRight size={19} aria-hidden="true" />
        </a>
        <ol className="mc-clinical-steps">
          {[
            "Upload patient vitals",
            "Compare four methods",
            "Review risk tiers",
          ].map((label, i) => (
            <li key={label}>
              <span>0{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>
      <div className="mc-clinical-console" data-reveal>
        <div className="mc-console-header">
          <span>
            <Logo />
            Patient overview
          </span>
          <span className="mc-demo-label">Demo preview</span>
        </div>
        <div className="mc-console-body">
          <div
            className="mc-method-tabs"
            role="tablist"
            aria-label="Clustering method preview"
            onKeyDown={(event) => {
              const target =
                event.key === "ArrowRight"
                  ? (method + 1) % METHODS.length
                  : event.key === "ArrowLeft"
                    ? (method + METHODS.length - 1) % METHODS.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? METHODS.length - 1
                        : null;
              if (target !== null) {
                event.preventDefault();
                changeMethod(target, true);
              }
            }}
          >
            {METHODS.map((item, i) => (
              <button
                key={item.id}
                id={`method-${item.id}`}
                role="tab"
                type="button"
                aria-selected={i === method}
                aria-controls="clinical-method-panel"
                tabIndex={i === method ? 0 : -1}
                onClick={() => changeMethod(i)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            className="mc-map-panel"
            id="clinical-method-panel"
            role="tabpanel"
            aria-labelledby={`method-${current.id}`}
            tabIndex={0}
          >
            <div className="mc-map-heading">
              <h3>
                {current.id === "hierarchical"
                  ? "Group hierarchy"
                  : "Population map"}
              </h3>
              <span>Illustrative data</span>
            </div>
            <PopulationMap method={current.id} focus={focus} />
            <div
              className="mc-group-legend"
              aria-label="Focus an illustrative group"
            >
              {COLORS.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Focus group 0${i + 1}`}
                  aria-pressed={focus === i}
                  onClick={() => setFocus(focus === i ? null : i)}
                >
                  <i style={{ background: color }} aria-hidden="true" />
                  Group 0{i + 1}
                </button>
              ))}
            </div>
            <p className="mc-method-description">{current.description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
