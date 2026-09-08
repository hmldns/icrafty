import { useRef } from "react";
import { Button } from "../../components/ui/primitives";
import { PhotoStrip } from "./PhotoStrip";
import type { PhotoAttachment, VersionRef } from "./types";

export function ChatComposer({ text, attachments, onTextChange, onInspect, onRemove, onBrowseAssets, onSubmit,
  disabled = false, hint = "Local preview · Shift + Enter for a new line", onCancel, onPasteImages, attachmentActionLabel }: {
  text: string;
  attachments: readonly PhotoAttachment[];
  onTextChange: (text: string) => void;
  onInspect: (ref: VersionRef) => void;
  onRemove: (ref: VersionRef) => void;
  onBrowseAssets: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  hint?: string;
  onCancel?: () => void;
  onPasteImages?: (files: File[]) => void;
  attachmentActionLabel?: string;
}) {
  const messageField = useRef<HTMLTextAreaElement>(null);
  const canSubmit = !disabled && (!!text.trim() || attachments.length > 0);
  const submit = () => { if (canSubmit) onSubmit(); messageField.current?.focus({ preventScroll: true }); };
  return (
    <form id="chat-composer" tabIndex={-1} className="chat-composer" aria-label="Message composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <div className="chat-compose-box">
        <h3 id="chat-attachments-title" className="sr-only" tabIndex={-1}>Message images · {attachments.length} attached</h3>
        {attachments.length > 0 && <PhotoStrip photos={attachments} label="Selected attachments" actionLabel={attachmentActionLabel} onInspect={onInspect} onRemove={onRemove} />}
        <label htmlFor="chat-message-text" className="sr-only">Message (optional)</label>
        <textarea
          ref={messageField} id="chat-message-text" className="chat-textarea" rows={2}
          placeholder="Add a note or ask about the cap…" value={text}
          onChange={(event) => onTextChange(event.target.value)} aria-describedby="chat-submit-note"
          onPaste={(event) => {
            if (!onPasteImages) return;
            const files = [...event.clipboardData.files].filter(file => file.type.startsWith("image/"));
            if (files.length) { event.preventDefault(); onPasteImages(files); }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && canSubmit) {
              event.preventDefault(); submit();
            }
          }}
        />
        <div className="chat-composer-footer">
          <Button size="small" variant="ghost" icon="plus" onClick={onBrowseAssets}>Photos</Button>
          <span id="chat-submit-note">{hint}</span>
          {onCancel && <Button size="small" variant="danger" onClick={onCancel}>Stop</Button>}
          <Button type="submit" variant="primary" size="small" icon="right" disabled={!canSubmit}>Send</Button>
        </div>
      </div>
    </form>
  );
}
