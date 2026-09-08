import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Notice } from "../../../components/ui/primitives";
import { importModel } from "../../models/importModel";
import { ModelScene } from "../../models/modelScene";
import type { ModelSnapshot, ModelSource, ViewPreset } from "../../models/types";
import type { ChatModel } from "../historyTypes";

/** Compact host for the existing viewer core; no geometry evaluator or shared state. */
export function InlineModelPreview({ model, onSnapshot }: {
  model: ChatModel;
  onSnapshot: (snapshot: ModelSnapshot) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ModelScene | null>(null);
  const helpId = useId();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const source = useMemo<ModelSource>(() => ({
    data: model.url, format: model.format,
    identity: { id: model.id, name: model.name }, upAxis: "z", stlUnits: "mm",
  }), [model]);

  useEffect(() => {
    const controller = new AbortController();
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Cap preview 3D canvas");
    canvas.setAttribute("aria-describedby", helpId);
    host.current!.replaceChildren(canvas);
    setState("loading");
    setError("");
    setCapturing(false);
    let current: ModelScene | undefined;
    const fail = (cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "The 3D view could not open.");
      setState("error");
      controller.abort();
      current?.dispose();
      scene.current = null;
    };
    try {
      current = new ModelScene(canvas, () => fail(new Error("The graphics context was lost. Reopen the preview to try again.")));
      scene.current = current;
      const runtime = current;
      void importModel(source, controller.signal).then((imported) => {
        if (controller.signal.aborted) return;
        runtime.setModel(imported, source);
        runtime.zoom(1.3);
        setState("ready");
      }).catch(fail);
    } catch (cause) { fail(cause); }
    return () => {
      controller.abort();
      current?.dispose();
      canvas.remove();
      scene.current = null;
    };
  }, [source, retry, helpId]);

  async function snapshot() {
    const current = scene.current;
    if (!current || capturing) return;
    setCapturing(true);
    try {
      const result = await current.snapshot();
      if (scene.current === current) onSnapshot(result);
    } catch (cause) {
      if (scene.current === current) setError(cause instanceof Error ? cause.message : "Could not save this view.");
    } finally {
      if (scene.current === current) setCapturing(false);
    }
  }

  const ready = state === "ready";
  const views: { label: string; value: ViewPreset }[] = [
    { label: "Top", value: "top" }, { label: "Side", value: "front" }, { label: "Reset view", value: "isometric" },
  ];
  return (
    <div className="chat-inline-model" data-state={state}>
      <div className="chat-model-viewport">
        <div className="chat-model-canvas" ref={host} />
        {state === "loading" && <p className="chat-model-overlay" role="status">Opening the cap…</p>}
      </div>
      {error && <Notice tone="error" action={<Button size="small" onClick={() => setRetry((value) => value + 1)}>Reopen preview</Button>}>{error}</Notice>}
      <div className="chat-model-controls">
        <div className="row" aria-label="Cap views">
          {views.map((view) => <Button key={view.value} size="small" disabled={!ready} onClick={() => scene.current?.setView(view.value)}>{view.label}</Button>)}
        </div>
        <Button size="small" icon="camera" disabled={!ready || capturing} onClick={() => void snapshot()}>{capturing ? "Saving view…" : "Attach this view"}</Button>
      </div>
      <p id={helpId} className="chat-fixture-note">Drag to rotate · scroll to zoom · use the view buttons from the keyboard.</p>
    </div>
  );
}
