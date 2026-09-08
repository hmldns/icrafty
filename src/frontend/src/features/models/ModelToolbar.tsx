import { Button, SelectField } from "../../components/ui/primitives";
import type { Projection, SceneAids, ViewPreset } from "./types";

const presets: ViewPreset[] = [
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
  "isometric",
];

export function ModelToolbar({
  ready,
  activePlanes,
  sectionsOpen,
  sectionId,
  aids,
  projection,
  onToggleSections,
  onTogglePanel,
  onAids,
  onView,
  onFit,
  onZoom,
  onProjection,
}: {
  ready: boolean;
  activePlanes: number;
  sectionsOpen: boolean;
  sectionId: string;
  aids: SceneAids;
  projection: Projection;
  onToggleSections: () => void;
  onTogglePanel: () => void;
  onAids: (aids: SceneAids) => void;
  onView: (preset: ViewPreset) => void;
  onFit: () => void;
  onZoom: (factor: number) => void;
  onProjection: (value: Projection) => void;
}) {
  return (
    <div className="model-toolbar">
      <div className="model-tools-primary">
        <div
          className="model-tool-group"
          role="group"
          aria-label="Section tools"
        >
          <Button
            size="small"
            icon="section"
            disabled={!ready}
            aria-pressed={activePlanes > 0}
            onClick={onToggleSections}
            title="Enable or disable visual sections; preserves plane positions"
          >
            Sections: {activePlanes ? `on (${activePlanes})` : "off"}
          </Button>
          <Button
            size="small"
            icon="sliders"
            disabled={!ready}
            aria-label="Section settings"
            aria-expanded={sectionsOpen}
            aria-controls={sectionId}
            onClick={onTogglePanel}
          >
            Planes
          </Button>
        </div>
        <div className="model-tool-group" role="group" aria-label="Scene aids">
          <Button
            size="small"
            icon="axes"
            disabled={!ready}
            aria-label="Show scene axes"
            aria-pressed={aids.axes}
            onClick={() => onAids({ ...aids, axes: !aids.axes })}
          >
            Axes
          </Button>
          <Button
            size="small"
            icon="floorGrid"
            disabled={!ready}
            aria-label="Show horizontal grid"
            aria-pressed={aids.grid}
            onClick={() => onAids({ ...aids, grid: !aids.grid })}
          >
            Grid
          </Button>
        </div>
      </div>
      <div
        className="model-tool-group"
        role="group"
        aria-label="Camera controls"
      >
        <Button
          size="small"
          icon="fit"
          disabled={!ready}
          aria-label="Fit model"
          onClick={onFit}
        >
          Fit
        </Button>
        <Button
          size="small"
          icon="zoomIn"
          disabled={!ready}
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => onZoom(1.25)}
        />
        <Button
          size="small"
          icon="zoomOut"
          disabled={!ready}
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => onZoom(0.8)}
        />
        <SelectField
          label="Projection"
          value={projection}
          disabled={!ready}
          onChange={(event) => onProjection(event.target.value as Projection)}
        >
          <option value="perspective">Perspective</option>
          <option value="orthographic">Orthographic</option>
        </SelectField>
      </div>
      <div
        className="model-tool-group model-view-presets"
        role="group"
        aria-label="Standard views"
      >
        {presets.map((preset) => (
          <Button
            size="small"
            icon="cube"
            key={preset}
            disabled={!ready}
            onClick={() => onView(preset)}
          >
            {preset[0]!.toUpperCase() + preset.slice(1)}
          </Button>
        ))}
      </div>
    </div>
  );
}
