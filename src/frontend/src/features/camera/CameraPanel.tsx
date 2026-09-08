import { useEffect } from "react";
import {
  Badge,
  Button,
  Card,
  LoadingState,
  Notice,
  SelectField,
} from "../../components/ui/primitives";
import { Icon } from "../../components/ui/Icon";
import { isTypingTarget } from "../images/imageIO";
import type { SourceImage } from "../images/types";
import { useCamera } from "./useCamera";

export function CameraPanel({
  onCapture,
  onClose,
}: {
  onCapture: (source: SourceImage) => Promise<unknown>;
  onClose: () => void;
}) {
  const camera = useCamera(onCapture);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        isTypingTarget(event.target) ||
        document.querySelector("dialog[open]")
      )
        return;
      // Native controls retain their own Space activation behavior.
      if (
        event.target instanceof Element &&
        event.target.closest('button, a, [role="button"]')
      )
        return;
      if (camera.phase === "live") {
        event.preventDefault();
        void camera.capture();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [camera.phase, camera.capture]);
  return (
    <Card className="camera-panel">
      <div className="section-heading">
        <div className="row">
          <Icon name="camera" />
          <h2>Camera</h2>
          <Badge tone={camera.phase === "live" ? "success" : "neutral"}>
            {camera.phase === "live" ? "Live" : "Off"}
          </Badge>
        </div>
        <Button
          variant="ghost"
          icon="close"
          onClick={() => {
            camera.stop();
            onClose();
          }}
        >
          Close camera
        </Button>
      </div>
      <div className="camera-preview">
        <video
          ref={camera.videoRef}
          muted
          playsInline
          aria-label="Live camera preview"
        />
        {camera.phase !== "live" && (
          <div className="camera-placeholder">
            {camera.phase === "requesting" ? (
              <LoadingState>Waiting for camera access…</LoadingState>
            ) : (
              <>
                <Icon name="camera" size={40} />
                <h3>A new perspective</h3>
                <p>Turn your object. Capture the details.</p>
                <Button
                  variant="primary"
                  icon="camera"
                  onClick={() => void camera.start()}
                >
                  Start camera
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {camera.error && <Notice tone="error">{camera.error}</Notice>}
      <div className="camera-controls">
        <div>
          {camera.devices.length > 0 && (
            <SelectField
              label="Camera device"
              value={camera.deviceId}
              onChange={(event) => camera.selectDevice(event.target.value)}
              disabled={camera.phase === "requesting"}
            >
              {camera.devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </SelectField>
          )}
        </div>
        <div className="row">
          <Button
            icon="stop"
            onClick={camera.stop}
            disabled={camera.phase === "off"}
          >
            {camera.phase === "requesting"
              ? "Cancel camera request"
              : "Stop camera"}
          </Button>
          <Button
            variant="primary"
            icon="camera"
            onClick={() => void camera.capture()}
            disabled={camera.phase !== "live" || camera.capturing}
          >
            {camera.capturing ? "Capturing…" : "Capture image"}
          </Button>
        </div>
      </div>
      <p className="camera-caption" role="status">
        {camera.count
          ? `${camera.count} ${camera.count === 1 ? "image" : "images"} captured. Reposition and capture again.`
          : "Camera starts only when you choose. Audio is never recorded."}{" "}
        {camera.phase === "live" && (
          <span>
            Shortcut: <kbd>Space</kbd> when you’re not in a field or button.
          </span>
        )}
      </p>
    </Card>
  );
}
