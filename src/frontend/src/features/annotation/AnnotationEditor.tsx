import { useCallback, useEffect, useRef, useState } from "react";
import { ModelSourceContext } from "./ModelSourceContext";
import { Dialog } from "../../components/ui/Dialog";
import {
  Badge,
  Button,
  Notice,
  SelectField,
} from "../../components/ui/primitives";
import { downloadPng, errorMessage, isTypingTarget } from "../images/imageIO";
import { getRevision } from "../images/storage";
import {
  LIMITS,
  type CollectionImage,
  type EditHistory,
  type ImageSave,
  type ImageSaveMode,
  type Mark,
} from "../images/types";
import { AnnotationCanvas, type Tool } from "./AnnotationCanvas";
import { AnnotationToolbar } from "./AnnotationToolbar";
import {
  ANNOTATION_COLORS,
  commitMarks,
  flattenImage,
  redoHistory,
  undoHistory,
  withModelOutline,
} from "./geometry";
import "./AnnotationEditor.css";

export function AnnotationEditor({
  image,
  onClose,
  onChange,
  onSave,
  pending,
  storageError,
  initialMessage = "",
}: {
  image: CollectionImage;
  onClose: () => void;
  onChange: (sourceId: string, history: EditHistory) => void;
  onSave: (
    input: ImageSave,
    mode: ImageSaveMode,
    signal: AbortSignal,
  ) => Promise<CollectionImage>;
  pending: boolean;
  storageError: string;
  initialMessage?: string;
}) {
  const [history, setHistory] = useState(image.draft.history);
  const historyRef = useRef(history);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[0].value);
  const [width, setWidth] = useState(6);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(40);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<
    "download" | ImageSaveMode | "restore" | null
  >(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [revisionId, setRevisionId] = useState("");
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);

  const update = useCallback(
    (next: EditHistory) => {
      historyRef.current = next;
      setHistory(next);
      onChange(image.source.id, next);
      setMessage("");
      setError("");
    },
    [image.source.id, onChange],
  );
  const add = useCallback(
    (mark: Mark) => {
      const current = historyRef.current;
      if (current.present.length >= LIMITS.marks) {
        setError("This image has 300 marks. Clear or undo before adding more.");
        return;
      }
      update(
        commitMarks(current, [
          ...current.present,
          withModelOutline(image.source, mark),
        ]),
      );
    },
    [update, image.source],
  );
  const undo = useCallback(
    () => update(undoHistory(historyRef.current)),
    [update],
  );
  const redo = useCallback(
    () => update(redoHistory(historyRef.current)),
    [update],
  );
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        busy ||
        isTypingTarget(event.target) ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey)
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        if (key === "y" || event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [busy, redo, undo]);

  const perform = async (kind: ImageSaveMode | "download" | "restore") => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(kind);
    setError("");
    setMessage("");
    try {
      if (kind === "restore") {
        const revision = await getRevision(revisionId);
        if (controller.signal.aborted) return;
        if (!revision)
          throw new Error("That saved image is no longer in this browser.");
        update(commitMarks(historyRef.current, revision.marks));
        setMessage(
          "Saved marks restored. Undo returns to your previous draft.",
        );
      } else {
        // Both save choices and downloads use the same original plus editable marks.
        const snapshot = historyRef.current;
        const png = await flattenImage(
          image.source,
          snapshot.present,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (kind === "download") {
          downloadPng(png, image.source.name);
          setMessage(
            "PNG downloaded. Keep marking up this image for your next version.",
          );
        } else {
          const saved = await onSave(
            {
              sourceId: image.source.id,
              history: snapshot,
              png,
            },
            kind,
            controller.signal,
          );
          if (!controller.signal.aborted) {
            setRevisionId(saved.saved?.id ?? "");
            if (kind === "update")
              setMessage(
                "Image updated in this browser. Previous saves are kept in history.",
              );
          }
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(null);
    }
  };

  const disabled = !ready || !!busy;
  return (
    <Dialog
      title="Annotate image"
      description={image.source.name}
      onClose={onClose}
      wide
      closeDisabled={!!busy}
    >
      <div className="editor-body">
        <AnnotationToolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          width={width}
          setWidth={setWidth}
          text={text}
          setText={setText}
          fontSize={fontSize}
          setFontSize={setFontSize}
          disabled={disabled}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          canClear={history.present.length > 0}
          undo={undo}
          redo={redo}
          clear={() => update(commitMarks(historyRef.current, []))}
          placeText={() =>
            add({
              id: crypto.randomUUID(),
              kind: "text",
              at: { x: image.source.width / 4, y: image.source.height / 2 },
              text: text.trim(),
              color,
              width,
              fontSize,
            })
          }
        />
        <AnnotationCanvas
          source={image.source}
          marks={history.present}
          tool={tool}
          color={color}
          width={width}
          text={text}
          fontSize={fontSize}
          zoom={zoom}
          disabled={disabled}
          onAdd={add}
          onReady={setReady}
          onError={setError}
        />
        <div className="canvas-status">
          <span>
            {image.source.width.toLocaleString()} ×{" "}
            {image.source.height.toLocaleString()} px{" "}
            <span className="status-separator">/</span>{" "}
            <span data-testid="mark-count">
              {history.present.length}{" "}
              {history.present.length === 1 ? "mark" : "marks"}
            </span>
          </span>
          <div className="row">
            <span className="muted">
              {tool === "text"
                ? "Click to place a label"
                : tool === "pen"
                  ? "Draw directly on your image"
                  : "Drag to draw a shape"}
            </span>
            <SelectField
              label="Canvas zoom"
              className="zoom-field"
              value={zoom}
              onChange={(event) =>
                setZoom(
                  event.target.value === "fit"
                    ? "fit"
                    : Number(event.target.value),
                )
              }
            >
              <option value="fit">Fit image</option>
              <option value={0.5}>50%</option>
              <option value={1}>100%</option>
              <option value={2}>200%</option>
            </SelectField>
          </div>
        </div>
        {(error || storageError) && (
          <div className="editor-notice">
            <Notice tone="error">{error || storageError}</Notice>
          </div>
        )}
        {message && (
          <div className="editor-notice">
            <Notice tone="success">{message}</Notice>
          </div>
        )}
        <details className="revision-details">
          <summary>
            Source & saved history <span>{image.revisions.length}</span>
          </summary>
          <div className="revision-content">
            <dl>
              <div>
                <dt>Image ID</dt>
                <dd data-testid="source-id">{image.source.id}</dd>
              </div>
              <div>
                <dt>Saved in this browser</dt>
                <dd>{new Date(image.source.createdAt).toLocaleString()}</dd>
              </div>
              {image.source.lineage && (
                <div>
                  <dt>Copied from image</dt>
                  <dd>{image.source.lineage.parentSourceId}</dd>
                </div>
              )}
            </dl>
            {image.source.model && (
              <ModelSourceContext model={image.source.model} />
            )}
            {image.revisions.length ? (
              <div className="revision-picker">
                <SelectField
                  label="Saved image history"
                  value={revisionId}
                  onChange={(event) => setRevisionId(event.target.value)}
                >
                  <option value="">Choose a saved image</option>
                  {image.revisions.map((revision, index) => (
                    <option key={revision.id} value={revision.id}>
                      Save {index + 1} ·{" "}
                      {new Date(revision.createdAt).toLocaleTimeString()}
                    </option>
                  ))}
                </SelectField>
                <Button
                  onClick={() => void perform("restore")}
                  disabled={disabled || !revisionId}
                >
                  Restore marks
                </Button>
                {revisionId && (
                  <code data-testid="revision-id">{revisionId}</code>
                )}
              </div>
            ) : (
              <p>
                No saved changes yet. Your draft is kept automatically. Save a
                new image, update this image, or download at any time.
              </p>
            )}
            <Button
              disabled={disabled || history.present.length === 0}
              onClick={() => {
                update(commitMarks(historyRef.current, []));
                setMessage(
                  "Original pixels restored to your draft. Undo brings back the marks.",
                );
              }}
            >
              Restore original
            </Button>
          </div>
        </details>
      </div>
      <footer className="editor-footer">
        <div className="editor-save-status">
          <Badge tone={storageError ? "neutral" : "success"}>
            {storageError
              ? "Draft not saved"
              : pending
                ? "Saving draft…"
                : "Draft saved locally"}
          </Badge>
          <p>Drafts stay local. Save to change the gallery image.</p>
        </div>
        <div className="editor-actions image-save-actions">
          <Button
            variant="primary"
            onClick={() => void perform("copy")}
            disabled={disabled}
          >
            {busy === "copy" ? "Saving copy…" : "Save as new image"}
          </Button>
          <Button onClick={() => void perform("update")} disabled={disabled}>
            {busy === "update" ? "Updating…" : "Update this image"}
          </Button>
          <Button
            icon="download"
            onClick={() => void perform("download")}
            disabled={disabled}
          >
            {busy === "download" ? "Exporting…" : "Download PNG"}
          </Button>
        </div>
      </footer>
    </Dialog>
  );
}
