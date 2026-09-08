import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Field, Notice } from "../../components/ui/primitives";
import { Icon } from "../../components/ui/Icon";
import { Tabs } from "../../components/ui/Tabs";
import {
  errorMessage,
  imageFromUrl,
  isTypingTarget,
  prepareImage,
} from "./imageIO";
import { LIMITS, type SourceImage } from "./types";

export function ImageIntake({
  onAdd,
  onCamera,
  disabled,
}: {
  onAdd: (source: SourceImage, openEditor: boolean) => Promise<void>;
  onCamera: () => void;
  disabled: boolean;
}) {
  const [method, setMethod] = useState<"files" | "url">("files");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  const run = useCallback(
    async (work: (signal: AbortSignal) => Promise<string>) => {
      if (controller.current || disabled) return;
      const current = new AbortController();
      controller.current = current;
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const result = await work(current.signal);
        if (alive.current && !current.signal.aborted) setMessage(result);
      } catch (cause) {
        if (alive.current && !current.signal.aborted)
          setError(errorMessage(cause));
      } finally {
        controller.current = null;
        if (alive.current) setBusy(false);
      }
    },
    [disabled],
  );

  const addFiles = useCallback(
    (files: File[], origin: "file" | "paste" = "file") => {
      void run(async (signal) => {
        if (files.length > LIMITS.images)
          throw new Error("Add up to 40 images at a time.");
        let added = 0;
        const errors: string[] = [];
        for (const file of files) {
          if (signal.aborted) break;
          try {
            const source = await prepareImage(
              file,
              file.name || "Pasted image.png",
              origin,
              signal,
            );
            if (!signal.aborted) {
              await onAdd(source, files.length === 1);
              added += 1;
            }
          } catch (cause) {
            if (!signal.aborted)
              errors.push(`${file.name || "Image"}: ${errorMessage(cause)}`);
          }
        }
        if (errors.length)
          throw new Error(
            `${added ? `Added ${added} ${added === 1 ? "image" : "images"}. ` : ""}${errors.slice(0, 3).join(" ")}${errors.length > 3 ? ` ${errors.length - 3} more files could not be added.` : ""}`,
          );
        return `Added ${added} ${added === 1 ? "image" : "images"} to this browser.`;
      });
    },
    [onAdd, run],
  );
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (
        disabled ||
        controller.current ||
        isTypingTarget(event.target) ||
        document.querySelector("dialog[open]")
      )
        return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) {
        event.preventDefault();
        addFiles(files, "paste");
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [addFiles, disabled]);

  return (
    <Card className="intake-card">
      <div className="section-heading">
        <div>
          <h2>Add a perspective</h2>
          <p>A photo, a detail, a quick sketch.</p>
        </div>
        <Button icon="camera" onClick={onCamera} disabled={disabled || busy}>
          Open camera
        </Button>
      </div>
      <Tabs
        label="Import method"
        value={method}
        onChange={setMethod}
        options={[
          {
            value: "files",
            label: "Files & clipboard",
            content: (
              <div
                className={`dropzone${dragging ? " dropzone--active" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!disabled && !busy) setDragging(true);
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  )
                    setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (!disabled && !busy)
                    addFiles(Array.from(event.dataTransfer.files));
                }}
              >
                <span className="dropzone-icon">
                  <Icon name="upload" size={24} />
                </span>
                <div>
                  <h3>Drop images here</h3>
                  <p>or paste an image from your clipboard</p>
                </div>
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled || busy}
                >
                  Choose images
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  className="sr-only"
                  aria-label="Choose image files"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  disabled={disabled || busy}
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
                <p className="dropzone-note">
                  PNG, JPEG, WebP · up to 12 MB / 16 MP each
                </p>
              </div>
            ),
          },
          {
            value: "url",
            label: "Image URL",
            content: (
              <form
                className="url-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async (signal) => {
                    const source = await imageFromUrl(url, signal);
                    if (!signal.aborted) {
                      await onAdd(source, true);
                      if (alive.current) setUrl("");
                    }
                    return "Web image added to this browser.";
                  });
                }}
              >
                <Field
                  label="Web image URL"
                  type="url"
                  placeholder="https://example.com/photo.jpg"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  required
                  disabled={disabled || busy}
                  hint="Use a direct link to a public image. Its host must allow cross-origin access (CORS)."
                />
                <Button
                  type="submit"
                  variant="primary"
                  icon="link"
                  disabled={disabled || busy || !url.trim()}
                >
                  Add from URL
                </Button>
              </form>
            ),
          },
        ]}
      />
      {busy && (
        <Notice
          action={
            <Button
              size="small"
              onClick={() => {
                controller.current?.abort();
                setMessage("Import cancelled.");
              }}
            >
              Cancel import
            </Button>
          }
        >
          Reading and saving image…
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {message && (
        <p className="intake-status" role="status">
          {message}
        </p>
      )}
    </Card>
  );
}
