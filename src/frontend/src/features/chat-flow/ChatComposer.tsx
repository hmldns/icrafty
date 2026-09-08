import { useRef } from "react";
import { Button } from "../../components/ui/primitives";
import { PhotoStrip } from "./PhotoStrip";
import type { PhotoAttachment, VersionRef } from "./types";

export function ChatComposer({
  text,
  attachments,
  onTextChange,
  onInspect,
  onRemove,
  onBrowseAssets,
  onSubmit,
}: {
  text: string;
  attachments: readonly PhotoAttachment[];
  onTextChange: (text: string) => void;
  onInspect: (ref: VersionRef) => void;
  onRemove: (ref: VersionRef) => void;
  onBrowseAssets: () => void;
  onSubmit: () => void;
}) {
  const messageField = useRef<HTMLTextAreaElement>(null);
  return (
    <form
      id="chat-composer"
      tabIndex={-1}
      className="chat-composer"
      aria-label="Mock input composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
        messageField.current?.focus({ preventScroll: true });
      }}
    >
      <div className="chat-composer-heading">
        <h3 id="chat-attachments-title" tabIndex={-1}>
          Next input <span>· {attachments.length} attached</span>
        </h3>
        <Button size="small" variant="ghost" icon="plus" onClick={onBrowseAssets}>
          Browse assets
        </Button>
      </div>
      {attachments.length > 0 ? (
        <PhotoStrip
          photos={attachments}
          label="Selected attachments"
          onInspect={onInspect}
          onRemove={onRemove}
        />
      ) : (
        <p className="chat-empty-strip">
          Choose an image version from the assets to attach it here.
        </p>
      )}
      <div className="field">
        <label htmlFor="chat-message-text">
          Message <span className="muted">(optional)</span>
        </label>
        <textarea
          ref={messageField}
          id="chat-message-text"
          className="input chat-textarea"
          placeholder="What should we look at next?"
          rows={2}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          aria-describedby="chat-submit-note"
        />
      </div>
      <div className="chat-composer-footer">
        <p id="chat-submit-note">Added here only. Refresh to start over.</p>
        <Button
          type="submit"
          variant="primary"
          icon="right"
          disabled={!text.trim() && attachments.length === 0}
        >
          Add mock input
        </Button>
      </div>
    </form>
  );
}
