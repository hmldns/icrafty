import { Button } from "../../components/ui/primitives";
import { versionKey, type PhotoAttachment, type VersionRef } from "./types";

export function PhotoStrip({
  photos,
  label,
  onInspect,
  onRemove,
  actionLabel = "Inspect",
}: {
  photos: readonly PhotoAttachment[];
  label: string;
  onInspect: (ref: VersionRef) => void;
  onRemove?: (ref: VersionRef) => void;
  actionLabel?: string;
}) {
  return (
    <ul className="chat-photo-strip" aria-label={label}>
      {photos.map((photo) => (
        <li className="chat-photo" key={versionKey(photo)}>
          <a
            className="chat-photo-link"
            href="#chat-asset-detail"
            aria-label={`${actionLabel} ${photo.assetTitle}, v${photo.versionNumber} · ${photo.versionLabel}`}
            onClick={(event) => {
              event.preventDefault();
              onInspect(photo);
            }}
          >
            <img
              src={photo.imageSrc}
              alt={photo.imageAlt}
              width="640"
              height="480"
            />
            <span className="chat-photo-title">{photo.assetTitle}</span>
            <span className="chat-photo-version">
              v{photo.versionNumber} · {photo.versionLabel}
            </span>
          </a>
          {onRemove && (
            <Button
              className="chat-photo-remove"
              size="small"
              icon="close"
              aria-label={`Remove ${photo.assetTitle}, v${photo.versionNumber}`}
              onClick={(event) => {
                // Keep keyboard focus in the strip, or return to the message field.
                const item = event.currentTarget.closest("li");
                const next = item?.nextElementSibling ?? item?.previousElementSibling;
                const target = next?.querySelector<HTMLElement>("a")
                  ?? document.getElementById("chat-message-text");
                target?.focus();
                onRemove(photo);
              }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
