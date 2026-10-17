import { ArrowUpRight } from "lucide-react";

/** Describe the real workspace rather than presenting fabricated results. */
export default function ClinicalSpotlight() {
  return (
    <section
      className="mc-clinical mc-container"
      id="clinical"
      aria-labelledby="clinical-title"
    >
      <div className="mc-clinical-copy" data-reveal>
        <p className="mc-section-label">Clinical workspace</p>
        <h2 id="clinical-title">
          Upload vitals.
          <br />
          Review results.
        </h2>
        <p className="mc-body">
          Upload a CSV, choose a clustering method, then review patient groups
          and risk tiers.
        </p>
        <a href="/login" className="mc-text-link">
          Open clinician workspace <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </div>
      <ol
        className="mc-clinical-workflow"
        aria-label="Clinical workflow"
        data-reveal
      >
        <li>
          <span className="mc-workflow-number">01</span>
          <div>
            <h3>Start with a CSV</h3>
            <p>
              Upload patient vitals or use the workspace’s sample dataset to
              explore the tools.
            </p>
          </div>
        </li>
        <li>
          <span className="mc-workflow-number">02</span>
          <div>
            <h3>Choose your method</h3>
            <p>
              Run K-Means, DBSCAN, hierarchical clustering or a Gaussian mixture
              model.
            </p>
          </div>
        </li>
        <li>
          <span className="mc-workflow-number">03</span>
          <div>
            <h3>Review the results</h3>
            <p>
              Explore patient groups, compare clustering results and open
              individual patient details.
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}
