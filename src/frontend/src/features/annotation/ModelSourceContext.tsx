import type { ModelProvenance } from "../models/types";

/** Useful capture context shared by every editor embedding, without debug internals. */
export function ModelSourceContext({ model }: { model: ModelProvenance }) {
  const sections = model.sections.filter((plane) => plane.enabled);
  return (
    <dl className="model-provenance">
      <div>
        <dt>Model source</dt>
        <dd>{model.source.name}</dd>
      </div>
      <div>
        <dt>Frozen view</dt>
        <dd>
          {model.camera.projection === "orthographic"
            ? "Orthographic"
            : "Perspective"}{" "}
          · {model.capture.width} × {model.capture.height} px
        </dd>
      </div>
      <div>
        <dt>Coordinates</dt>
        <dd>
          Millimeters · Z-up
          {model.coordinates.sourceUpAxis === "y"
            ? " (converted from Y-up)"
            : ""}
          {model.format === "stl"
            ? ` · STL assumes ${model.coordinates.sourceUnits}`
            : " · STEP file units converted"}
        </dd>
      </div>
      <div>
        <dt>Visual sections</dt>
        <dd>
          {sections.length
            ? sections
                .map(
                  (plane) =>
                    `${plane.axis.toUpperCase()} ${plane.flipped ? "≤" : "≥"} ${Number(plane.position.toPrecision(6))} mm`,
                )
                .join("; ")
            : "None"}
        </dd>
      </div>
      <div>
        <dt>Model fingerprint</dt>
        <dd title={`SHA-256 ${model.sha256}`}>{model.sha256.slice(0, 16)}…</dd>
      </div>
      {model.source.revisionId && (
        <div>
          <dt>Model revision</dt>
          <dd>{model.source.revisionId}</dd>
        </div>
      )}
      {model.source.evaluationId && (
        <div>
          <dt>Evaluation</dt>
          <dd>{model.source.evaluationId}</dd>
        </div>
      )}
    </dl>
  );
}
