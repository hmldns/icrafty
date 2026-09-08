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
  type Mark,
  type Revision,
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

export function AnnotationEditor({
  image,
  onClose,
  onChange,
  onSave,
  pending,
  storageError,
  mode = "collection",
}: {
  image: CollectionImage;
  onClose: () => void;
  onChange: (sourceId: string, history: EditHistory) => void;
  onSave: (revision: Revision) => Promise<void>;
  pending: boolean;
  storageError: string;
  /** Composer attachments are edited in place, without the collection inventory. */
  mode?: "collection" | "attachment";
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
  const [busy, setBusy] = useState<"download" | "save" | "restore" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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

  const perform = async (kind: "save" | "download" | "restore") => {
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
          throw new Error("That revision is no longer in this browser.");
        update(commitMarks(historyRef.current, revision.marks));
        setMessage(
          "Saved marks restored. Undo returns to your previous draft.",
        );
      } else {
        // Snapshot the current editable marks; saved revisions never gate downloads.
        const marks = historyRef.current.present;
        const png = await flattenImage(image.source, marks, controller.signal);
        if (controller.signal.aborted) return;
        if (kind === "download") {
          downloadPng(png, image.source.name);
          setMessage(
            "PNG downloaded. Keep marking up this image for your next version.",
          );
        } else {
          const revision: Revision = {
            id: crypto.randomUUID(),
            sourceId: image.source.id,
            createdAt: new Date().toISOString(),
            marks,
            png,
          };
          await onSave(revision);
          if (!controller.signal.aborted) {
            setRevisionId(revision.id);
            setMessage(
              `Revision ${image.revisions.length + 1} saved in this browser.`,
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
        {mode === "collection" && <details className="revision-details">
          <summary>
            Source & saved revisions <span>{image.revisions.length}</span>
          </summary>
          <div className="revision-content">
            <dl>
              <div>
                <dt>Original source ID</dt>
                <dd data-testid="source-id">{image.source.id}</dd>
              </div>
              <div>
                <dt>Saved in this browser</dt>
                <dd>{new Date(image.source.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
            {image.source.model && (
              <ModelSourceContext model={image.source.model} />
            )}
            {image.revisions.length ? (
              <div className="revision-picker">
                <SelectField
                  label="Saved revision"
                  value={revisionId}
                  onChange={(event) => setRevisionId(event.target.value)}
                >
                  <option value="">Choose a revision</option>
                  {image.revisions.map((revision, index) => (
                    <option key={revision.id} value={revision.id}>
                      Revision {index + 1} ·{" "}
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
                No saved revisions yet. Your editable draft is saved
                automatically. Download at any time.
              </p>
            )}
          </div>
        </details>}
      </div>
      <footer className="editor-footer">
        <div className="editor-save-status">
          <Badge tone={mode === "attachment" || storageError ? "neutral" : "success"}>
            {mode === "attachment" ? "Editable until you send" : storageError
              ? "Draft not saved"
              : pending
                ? "Saving draft…"
                : "Draft saved locally"}
          </Badge>
          <p>{mode === "attachment" ? "Save replaces this attachment in your message" : "Original preserved · PNG includes your current marks"}</p>
        </div>
        <div className="editor-actions">
          <Button variant={mode === "attachment" ? "primary" : "secondary"} onClick={() => void perform("save")} disabled={disabled}>
            {busy === "save" ? "Saving…" : mode === "attachment" ? "Save image" : "Save revision"}
          </Button>
          {mode === "collection" && <Button
            variant="primary"
            icon="download"
            onClick={() => void perform("download")}
            disabled={disabled}
          >
            {busy === "download" ? "Exporting…" : "Download PNG"}
          </Button>}
        </div>
      </footer>
    </Dialog>
  );
}
