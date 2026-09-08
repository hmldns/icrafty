import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Badge, Button } from "../../components/ui/primitives";
import { Icon } from "../../components/ui/Icon";
import type { SourceImage } from "../images/types";
import { CameraView } from "./CameraPanel";
import { useCamera } from "./useCamera";
import { useFloatingPosition } from "./useFloatingPosition";

export type CameraPhase = ReturnType<typeof useCamera>["phase"];

/** One mounted video/stream survives resizing and collapsing its originating chat card. */
export function CameraWidget({ onCapture, onClose, compact, onCompactChange, onPhaseChange }: {
  onCapture: (source: SourceImage) => Promise<unknown>;
  onClose: () => void;
  compact: boolean;
  onCompactChange: (compact: boolean) => void;
  onPhaseChange: (phase: CameraPhase) => void;
}) {
  const camera = useCamera(onCapture, true);
  const floating = useFloatingPosition();
  useEffect(() => { onPhaseChange(camera.phase); }, [camera.phase, onPhaseChange]);
  const close = () => { camera.stop(); onClose(); };
  return createPortal(<section ref={floating.element} className={`camera-widget${compact ? " camera-widget--compact" : ""}`}
    style={floating.style} aria-label="Camera widget" data-camera-phase={camera.phase} data-compact={compact}>
    <CameraView camera={camera} onClose={close} compact={compact} heading={<div className="camera-widget-heading">
      <button type="button" className="camera-widget-drag" aria-label="Move camera" title="Drag to move · Arrow keys move · Shift moves farther" {...floating.handle}>
        <Icon name="camera" size={18} /><span>Camera</span>
      </button>
      <Badge tone={camera.phase === "live" ? "success" : "neutral"}>{camera.phase === "live" ? "Live" : camera.phase === "requesting" ? "Starting…" : "Off"}</Badge>
      <Button variant="ghost" size="small" icon="fit" aria-label={compact ? "Enlarge camera" : "Shrink camera"} title={compact ? "Enlarge camera" : "Shrink camera"}
        onClick={() => onCompactChange(!compact)} />
      <Button variant="ghost" size="small" icon="close" aria-label="Close camera" title="Close camera" onClick={close} />
    </div>} />
  </section>, document.body);
}
