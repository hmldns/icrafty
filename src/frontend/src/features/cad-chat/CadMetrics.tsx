import type { CadMetric } from "./types";

const labels = { pass: "Pass", fail: "Fail", measured: "Measured", unavailable: "Unavailable", error: "Error" };
function valueText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
const unitText = (unit: string) => unit === "1" ? "" : unit.replace("^2", "²").replace("^3", "³");

export function CadMetrics({ metrics }: { metrics: readonly CadMetric[] }) {
  if (!metrics.length) return null;
  return <section className="cad-metrics" aria-label="Computed measurements and checks">
    <h3>Measurements & checks</h3>
    <ul>{metrics.map(metric => <li key={metric.id} data-check-status={metric.status}>
      <details>
        <summary><span className="cad-check-label">{metric.id}</span>
          <strong>{valueText(metric.value)}{metric.value != null && unitText(metric.unit) ? ` ${unitText(metric.unit)}` : ""}</strong>
          <span className={`cad-check-status cad-check-status--${metric.status}`}>{labels[metric.status]}</span>
        </summary>
        <dl>
          <div><dt>Metric</dt><dd>{metric.kind}{metric.axis ? ` · ${metric.axis} axis` : ""}</dd></div>
          <div><dt>Target</dt><dd>{valueText(metric.target)}</dd></div>
          {metric.criterion !== undefined && <div><dt>Required</dt><dd>{valueText(metric.criterion)}</dd></div>}
          {metric.difference !== undefined && <div><dt>Difference</dt><dd>{valueText(metric.difference)}</dd></div>}
          <div><dt>Method</dt><dd>{metric.method || "Not supplied"}{metric.frame ? ` · ${metric.frame}` : ""}</dd></div>
        </dl>
      </details>
    </li>)}</ul>
  </section>;
}
