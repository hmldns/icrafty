import { useId, useMemo, useRef } from "react";
import { Quaternion, Vector3 } from "three";
import type { Axis, CameraOrientation, ViewPreset } from "./types";

const axes: {
  axis: Axis;
  direction: [number, number, number];
  positive: ViewPreset;
  negative: ViewPreset;
}[] = [
  { axis: "x", direction: [1, 0, 0], positive: "right", negative: "left" },
  { axis: "y", direction: [0, 1, 0], positive: "back", negative: "front" },
  { axis: "z", direction: [0, 0, 1], positive: "top", negative: "bottom" },
];

/** DOM/SVG control, with no renderer or animation loop of its own. */
export function OrientationWidget({
  orientation,
  disabled,
  onAlign,
  onRotate,
}: {
  orientation: CameraOrientation;
  disabled: boolean;
  onAlign: (view: ViewPreset) => void;
  onRotate: (horizontal: number, vertical: number) => void;
}) {
  const helpId = useId();
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    distance: number;
    view?: ViewPreset;
  } | null>(null);
  const points = useMemo(() => {
    const inverse = new Quaternion(...orientation).invert();
    return axes.flatMap(({ axis, direction, positive, negative }) => {
      const vector = new Vector3(...direction).applyQuaternion(inverse);
      return ([1, -1] as const).map((sign) => {
        // Separate the two end-on buttons instead of stacking one out of reach.
        const endOn = Math.hypot(vector.x, vector.y) < 0.28;
        return {
          axis,
          sign,
          view: sign === 1 ? positive : negative,
          x: 56 + (endOn ? sign * 12 : vector.x * sign * 39),
          y: 56 - vector.y * sign * 39,
          depth: vector.z * sign,
        };
      });
    });
  }, [orientation]);
  return (
    <div
      className="model-orientation"
      role="group"
      aria-label="View orientation"
    >
      <div
        className="orientation-drag"
        role="group"
        aria-label="Rotate view"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={helpId}
        onKeyDown={(event) => {
          if (
            disabled ||
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          const angle = Math.PI / 12;
          onRotate(
            event.key === "ArrowLeft"
              ? angle
              : event.key === "ArrowRight"
                ? -angle
                : 0,
            event.key === "ArrowUp"
              ? angle
              : event.key === "ArrowDown"
                ? -angle
                : 0,
          );
        }}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0 || drag.current) return;
          event.preventDefault();
          const button = (event.target as Element).closest<HTMLButtonElement>(
            "button[data-view]",
          );
          (button ?? event.currentTarget).focus({ preventScroll: true });
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            distance: 0,
            view: button?.dataset.view as ViewPreset | undefined,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.id !== event.pointerId) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          current.distance += Math.hypot(dx, dy);
          current.x = event.clientX;
          current.y = event.clientY;
          if (current.distance > 4)
            onRotate((dx * Math.PI) / 180, (dy * Math.PI) / 180);
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          if (!current || current.id !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (current.distance <= 4 && current.view) onAlign(current.view);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <svg viewBox="0 0 112 112" aria-hidden="true">
          <circle cx="56" cy="56" r="43" className="orientation-ring" />
          {points.map((point) => (
            <line
              key={`${point.axis}${point.sign}`}
              x1="56"
              y1="56"
              x2={point.x}
              y2={point.y}
              data-axis={point.axis}
              data-sign={point.sign}
            />
          ))}
        </svg>
        {points.map((point) => (
          <button
            type="button"
            key={`${point.axis}${point.sign}`}
            className="orientation-axis"
            data-axis={point.axis}
            data-sign={point.sign}
            data-view={point.view}
            style={{
              left: `${point.x / 1.12}%`,
              top: `${point.y / 1.12}%`,
              zIndex: Math.round((point.depth + 1) * 10) + 1,
            }}
            disabled={disabled}
            aria-label={`View from ${point.sign === 1 ? "+" : "−"}${point.axis.toUpperCase()} (${point.view})`}
            title={`${point.view} view · ${point.sign === 1 ? "+" : "−"}${point.axis.toUpperCase()}`}
            onClick={(event) => {
              if (event.detail === 0) onAlign(point.view);
            }}
          >
            {point.sign === -1 ? "−" : ""}
            {point.axis.toUpperCase()}
          </button>
        ))}
      </div>
      <span id={helpId} className="orientation-hint">
        Drag / arrows to rotate
      </span>
    </div>
  );
}
