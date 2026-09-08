import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge, Button, Notice } from "../../components/ui/primitives";
import { errorMessage } from "../images/imageIO";
import { importModel } from "./importModel";
import { ModelScene } from "./modelScene";
import { ModelToolbar } from "./ModelToolbar";
import { OrientationWidget } from "./OrientationWidget";
import { SectionControls, type ModelBounds } from "./SectionControls";
import type {
  ModelSnapshot,
  ModelSource,
  Projection,
  SectionPlane,
  SectionAppearance,
  ReferenceSphere,
  CameraOrientation,
  SceneAids,
  Axis,
} from "./types";

export interface ModelViewerProps {
  source: ModelSource | null;
  label?: string;
  onSnapshot?: (snapshot: ModelSnapshot) => void | Promise<void>;
  snapshotDisabled?: boolean;
  snapshotLabel?: string;
  initialSections?: readonly SectionPlane[];
  referenceObjects?: readonly ReferenceSphere[];
  layout?: "document" | "workspace";
  onLoad?: (event: ModelLoadEvent) => void;
}

export interface ModelLoadEvent {
  source: ModelSource;
  state: "loading" | "ready" | "error";
  /** One 192 × 128 PNG from the initial view, when preview generation succeeds. */
  preview?: Blob;
}

export function ModelViewer({
  source,
  label = "Model viewer",
  onSnapshot,
  snapshotDisabled = false,
  snapshotLabel = "Snapshot",
  initialSections,
  referenceObjects,
  layout = "document",
  onLoad,
}: ModelViewerProps) {
  const loadCallback = useRef(onLoad);
  loadCallback.current = onLoad;
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const sectionId = useId();
  const canvasHost = useRef<HTMLDivElement>(null);
  const scene = useRef<ModelScene | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useMemo(
    () => ({}),
    [source, retry, label, initialSections, referenceObjects],
  );
  const activeGeneration = useRef(generation);
  activeGeneration.current = generation;
  const helpId = useId();
  const [state, setState] = useState<"empty" | "loading" | "ready" | "error">(
    "empty",
  );
  const [error, setError] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [projection, setProjection] = useState<Projection>("perspective");
  const [orientation, setOrientation] = useState<CameraOrientation>([
    0, 0, 0, 1,
  ]);
  const [aids, setAids] = useState<SceneAids>({ axes: true, grid: true });
  const aidPreference = useRef(aids);
  const enabledBeforePause = useRef<Axis[]>([]);
  const [sections, setSections] = useState<SectionPlane[]>([]);
  const [appearance, setAppearance] = useState<SectionAppearance>({
    guides: true,
    caps: true,
    hatching: true,
  });
  const [bounds, setBounds] = useState<ModelBounds | null>(null);
  const [triangles, setTriangles] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setCaptureError("");
    setCapturing(false);
    setSections(initialSections?.map((section) => ({ ...section })) ?? []);
    setAppearance({ guides: true, caps: true, hatching: true });
    setBounds(null);
    setProjection("perspective");
    enabledBeforePause.current = [];
    if (!source || !canvasHost.current) {
      setState("empty");
      return;
    }
    // Each effect setup gets a fresh canvas, including React StrictMode replay.
    const canvas = document.createElement("canvas");
    canvas.tabIndex = -1;
    canvas.setAttribute("aria-label", `${label} 3D canvas`);
    canvas.setAttribute("aria-describedby", helpId);
    canvasHost.current.replaceChildren(canvas);
    setState("loading");
    loadCallback.current?.({ source, state: "loading" });
    let runtime: ModelScene | undefined;
    const fail = (cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(errorMessage(cause));
      setState("error");
      loadCallback.current?.({ source, state: "error" });
      controller.abort();
      runtime?.dispose();
      scene.current = null;
    };
    try {
      runtime = new ModelScene(
        canvas,
        () =>
          fail(
            new Error(
              "The graphics context was lost. Reload the model to recover.",
            ),
          ),
        (next) => {
          if (!controller.signal.aborted) setOrientation(next);
        },
      );
      runtime.setSceneAids(aidPreference.current);
      scene.current = runtime;
      const current = runtime;
      void importModel(source, controller.signal)
        .then((model) => {
          if (controller.signal.aborted || scene.current !== current) return;
          current.setModel(model, source);
          current.addReferenceObjects(referenceObjects ?? []);
          current.setSections(
            initialSections?.map((section) => ({ ...section })) ?? [],
          );
          setBounds({
            x: { min: current.bounds.min.x, max: current.bounds.max.x },
            y: { min: current.bounds.min.y, max: current.bounds.max.y },
            z: { min: current.bounds.min.z, max: current.bounds.max.z },
          });
          setTriangles(
            model.meshes.reduce(
              (count, mesh) =>
                count + (mesh.indices?.length ?? mesh.positions.length / 3) / 3,
              0,
            ),
          );
          setState("ready");
          canvas.tabIndex = 0;
          if (loadCallback.current) {
            void current
              .thumbnail()
              .catch(() => undefined)
              .then((preview) => {
                if (!controller.signal.aborted && scene.current === current)
                  loadCallback.current?.({ source, state: "ready", preview });
              });
          }
        })
        .catch(fail);
    } catch (cause) {
      fail(
        new Error(
          `The 3D view could not start. This browser needs WebGL 2. ${errorMessage(cause)}`,
        ),
      );
    }
    return () => {
      controller.abort();
      runtime?.dispose();
      canvas.remove();
      if (scene.current === runtime) scene.current = null;
    };
  }, [source, generation, label, helpId, initialSections, referenceObjects]);

  const capture = async () => {
    if (!scene.current || !onSnapshot || capturing) return;
    const currentGeneration = generation;
    const currentScene = scene.current;
    setCapturing(true);
    setCaptureError("");
    try {
      const snapshot = await currentScene.snapshot();
      if (
        activeGeneration.current === currentGeneration &&
        scene.current === currentScene
      )
        await onSnapshot(snapshot);
    } catch (cause) {
      if (
        activeGeneration.current === currentGeneration &&
        scene.current === currentScene
      )
        setCaptureError(errorMessage(cause));
    } finally {
      if (activeGeneration.current === currentGeneration) setCapturing(false);
    }
  };
  const ready = state === "ready";
  const changeSections = (next: SectionPlane[]) => {
    scene.current?.setSections(next);
    setSections(next);
  };
  const toggleSections = () => {
    if (!bounds) return;
    const enabled = sections.filter((section) => section.enabled);
    if (enabled.length) {
      enabledBeforePause.current = enabled.map((section) => section.axis);
      changeSections(
        sections.map((section) => ({ ...section, enabled: false })),
      );
    } else {
      const restore = enabledBeforePause.current.filter((axis) =>
        sections.some((section) => section.axis === axis),
      );
      changeSections(
        sections.length
          ? sections.map((section) => ({
              ...section,
              enabled: !restore.length || restore.includes(section.axis),
            }))
          : [
              {
                axis: "x",
                enabled: true,
                flipped: false,
                position: (bounds.x.min + bounds.x.max) / 2,
              },
            ],
      );
      setSectionsOpen(true);
    }
  };
  const sectionControls = ready && bounds && (
    <SectionControls
      sections={sections}
      bounds={bounds}
      appearance={appearance}
      onAppearanceChange={(next) => {
        scene.current?.setSectionAppearance(next);
        setAppearance(next);
      }}
      onChange={changeSections}
    />
  );
  return (
    <section
      className={`model-viewer card model-viewer--${layout}`}
      aria-label={label}
      data-state={state}
    >
      <header className="model-heading">
        <div>
          <h2>{label}</h2>
          <p className="small model-name">
            {source?.identity.name ?? "Choose a STEP or STL model"}
          </p>
        </div>
        {onSnapshot && (
          <Button
            variant="primary"
            icon="camera"
            disabled={!ready || capturing || snapshotDisabled}
            onClick={() => void capture()}
          >
            {capturing ? "Freezing view…" : snapshotLabel}
          </Button>
        )}
      </header>
      <ModelToolbar
        ready={ready}
        activePlanes={sections.filter((section) => section.enabled).length}
        sectionsOpen={sectionsOpen}
        sectionId={sectionId}
        aids={aids}
        projection={projection}
        onToggleSections={toggleSections}
        onTogglePanel={() => setSectionsOpen((open) => !open)}
        onAids={(next) => {
          aidPreference.current = next;
          setAids(next);
          scene.current?.setSceneAids(next);
        }}
        onView={(preset) => scene.current?.setView(preset)}
        onFit={() => scene.current?.fit()}
        onZoom={(factor) => scene.current?.zoom(factor)}
        onProjection={(next) => {
          scene.current?.setProjection(next);
          setProjection(next);
        }}
      />
      <div className="model-stage">
        <div className="model-viewport">
          <div className="model-canvas-host" ref={canvasHost} />
          <OrientationWidget
            orientation={orientation}
            disabled={!ready}
            onAlign={(preset) => scene.current?.setView(preset)}
            onRotate={(horizontal, vertical) =>
              scene.current?.rotate(horizontal, vertical)
            }
          />
          {!ready && (
            <div className="model-overlay">
              {state === "error" ? (
                <Notice
                  tone="error"
                  action={
                    <Button
                      size="small"
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      Retry model
                    </Button>
                  }
                >
                  {error}
                </Notice>
              ) : (
                <p role="status">
                  {state === "loading"
                    ? "Loading model…"
                    : "Choose a model to begin."}
                </p>
              )}
            </div>
          )}
        </div>
        {layout === "workspace" && (
          <aside
            className="model-section-panel"
            id={sectionId}
            hidden={!sectionsOpen}
            aria-label="Section settings"
          >
            {sectionControls}
          </aside>
        )}
      </div>
      <details className="model-caption">
        <summary>View controls & model info</summary>
        <p id={helpId} className="small">
          Drag to orbit · Right-drag or Shift-drag to pan · Scroll to zoom.
          Touch: one finger orbits, two pan/zoom. Focus the canvas for arrow-key
          pan.
        </p>
        {ready && (
          <Badge>{triangles.toLocaleString()} triangles · mm · Z-up</Badge>
        )}
      </details>
      {captureError && <Notice tone="error">{captureError}</Notice>}
      {layout === "document" && (
        <div id={sectionId} hidden={!sectionsOpen}>
          {sectionControls}
        </div>
      )}
    </section>
  );
}
