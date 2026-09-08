import { useCallback, useEffect, useRef, useState } from "react";
import { canvasBlob, prepareImage } from "../images/imageIO";
import type { SourceImage } from "../images/types";

export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera access was denied. Allow camera access in your browser’s site settings, then try again. You can also add a file.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "No camera was found. Connect a camera, then try again, or add a file.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "The camera is busy or unavailable. Close other apps using it, then try again.";
  if (name === "OverconstrainedError")
    return "That camera is no longer available. Select a different camera and try again.";
  return "The camera could not start. Check that it is connected and available, then try again.";
}

export function useCamera(
  onCapture: (source: SourceImage) => Promise<unknown>,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [phase, setPhase] = useState<"off" | "requesting" | "live">("off");
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [count, setCount] = useState(0);
  const generation = useRef(0);
  const alive = useRef(true);
  const captureLock = useRef(false);
  const captureAbort = useRef<AbortController | null>(null);

  const release = useCallback(() => {
    generation.current += 1;
    captureAbort.current?.abort();
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
  }, []);
  const stop = useCallback(() => {
    release();
    setStream(null);
    setPhase("off");
    setError("");
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [release]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      release();
    };
  }, [release]);

  const refreshDevices = useCallback(async () => {
    try {
      const available = await navigator.mediaDevices?.enumerateDevices();
      if (alive.current && available)
        setDevices(available.filter((device) => device.kind === "videoinput"));
    } catch {
      /* Device selection is optional; the active/default camera remains usable. */
    }
  }, []);
  useEffect(() => {
    const media = navigator.mediaDevices;
    media?.addEventListener?.("devicechange", refreshDevices);
    return () => media?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  const start = useCallback(
    async (selectedDevice = deviceId) => {
      release();
      setStream(null);
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase("off");
        setError(
          "Camera access is unavailable here. Use HTTPS or localhost in a supported browser, or add a file.",
        );
        return;
      }
      const ticket = generation.current;
      setPhase("requesting");
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(selectedDevice ? { deviceId: { exact: selectedDevice } } : {}),
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!alive.current || ticket !== generation.current) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = next;
        const track = next.getVideoTracks()[0];
        if (track) {
          setDeviceId(track.getSettings().deviceId ?? selectedDevice);
          track.onended = () => {
            if (alive.current && ticket === generation.current) {
              stop();
              setError(
                "The camera disconnected. Reconnect it and start again.",
              );
            }
          };
        }
        setStream(next);
        await refreshDevices();
      } catch (cause) {
        if (alive.current && ticket === generation.current) {
          setPhase("off");
          setError(cameraError(cause));
        }
      }
    },
    [deviceId, refreshDevices, release, stop],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    let cancelled = false;
    video.srcObject = stream;
    void video
      .play()
      .then(() => {
        if (!cancelled) setPhase("live");
      })
      .catch(() => {
        if (!cancelled) {
          stop();
          setError(
            "The camera preview could not play. Try starting the camera again.",
          );
        }
      });
    return () => {
      cancelled = true;
      video.srcObject = null;
    };
  }, [stream, stop]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (
      captureLock.current ||
      phase !== "live" ||
      !video?.videoWidth ||
      !video.videoHeight
    )
      return;
    captureLock.current = true;
    setCapturing(true);
    setError("");
    const controller = new AbortController();
    captureAbort.current = controller;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Canvas is unavailable. Try a different browser.");
      context.drawImage(video, 0, 0);
      const blob = await canvasBlob(canvas);
      const source = await prepareImage(
        blob,
        `Capture ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.png`,
        "camera",
        controller.signal,
      );
      if (controller.signal.aborted) return;
      await onCapture(source);
      if (alive.current) setCount((current) => current + 1);
    } catch (cause) {
      if (alive.current && !controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "This frame could not be captured. Try again.",
        );
    } finally {
      captureLock.current = false;
      if (alive.current) setCapturing(false);
    }
  }, [onCapture, phase]);

  return {
    videoRef,
    devices,
    deviceId,
    phase,
    error,
    capturing,
    count,
    capture,
    stop,
    start,
    selectDevice: (id: string) => {
      setDeviceId(id);
      if (phase !== "off") void start(id);
    },
  };
}
