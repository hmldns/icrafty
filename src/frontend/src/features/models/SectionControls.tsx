import { useEffect, useRef, useState } from "react";
import { Button, Field } from "../../components/ui/primitives";
import type { Axis, SectionPlane } from "./types";

export type ModelBounds = Record<Axis, { min: number; max: number }>;

function SectionPosition({
  label,
  position,
  onChange,
}: {
  label: string;
  position: number;
  onChange: (position: number) => void;
}) {
  const [text, setText] = useState(String(Number(position.toPrecision(8))));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(Number(position.toPrecision(8))));
  }, [position]);
  return (
    <Field
      label={label}
      type="number"
      step="any"
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(String(Number(position.toPrecision(8))));
      }}
      onChange={(event) => {
        setText(event.target.value);
        if (
          event.target.value !== "" &&
          Number.isFinite(Math.fround(event.target.valueAsNumber))
        )
          onChange(event.target.valueAsNumber);
      }}
    />
  );
}

export function SectionControls({
  sections,
  bounds,
  onChange,
}: {
  sections: SectionPlane[];
  bounds: ModelBounds;
  onChange: (sections: SectionPlane[]) => void;
}) {
  const update = (axis: Axis, change: Partial<SectionPlane>) =>
    onChange(
      sections.map((section) =>
        section.axis === axis ? { ...section, ...change } : section,
      ),
    );
  return (
    <section className="model-sections" aria-label="Visual sections">
      <div className="section-heading">
        <h3>Sections</h3>
        <div className="row">
          {(["x", "y", "z"] as const).map((axis) => (
            <Button
              key={axis}
              size="small"
              disabled={sections.some((section) => section.axis === axis)}
              onClick={() =>
                onChange([
                  ...sections,
                  {
                    axis,
                    enabled: true,
                    flipped: false,
                    position: (bounds[axis].min + bounds[axis].max) / 2,
                  },
                ])
              }
            >
              Add {axis.toUpperCase()} plane
            </Button>
          ))}
        </div>
      </div>
      <p className="small">
        Visual cuts have open surfaces, without caps. Positions are in viewer
        millimeters; mesh bounds are not verified CAD measurements.
      </p>
      {sections.map((section) => {
        const label = section.axis.toUpperCase();
        const { min, max } = bounds[section.axis];
        return (
          <fieldset className="model-section-row" key={section.axis}>
            <legend>{label} plane</legend>
            <label className="row">
              <input
                type="checkbox"
                checked={section.enabled}
                onChange={(event) =>
                  update(section.axis, { enabled: event.target.checked })
                }
              />
              Enable {label} plane
            </label>
            <input
              type="range"
              aria-label={`${label} plane slider`}
              min={min}
              max={max}
              step={Math.max((max - min) / 500, 0.000001)}
              value={section.position}
              onChange={(event) =>
                update(section.axis, { position: Number(event.target.value) })
              }
            />
            <SectionPosition
              label={`${label} position (mm)`}
              position={section.position}
              onChange={(position) => update(section.axis, { position })}
            />
            <Button
              size="small"
              aria-pressed={section.flipped}
              onClick={() =>
                update(section.axis, { flipped: !section.flipped })
              }
            >
              Flip {label}
            </Button>
            <Button
              size="small"
              onClick={() =>
                onChange(
                  sections.filter((plane) => plane.axis !== section.axis),
                )
              }
            >
              Remove {label}
            </Button>
          </fieldset>
        );
      })}
    </section>
  );
}
