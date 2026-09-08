import { useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  Notice,
} from "../../components/ui/primitives";
import { Dialog } from "../../components/ui/Dialog";
import { Icon } from "../../components/ui/Icon";
import { errorMessage } from "./imageIO";
import type { CollectionImage } from "./types";
import { useObjectUrl } from "./useObjectUrl";

function ImageCard({
  image,
  onEdit,
  onDelete,
}: {
  image: CollectionImage;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const url = useObjectUrl(image.source.blob);
  const marks = image.draft.history.present.length;
  return (
    <article
      className="image-card"
      data-testid="collection-image"
      data-source-id={image.source.id}
    >
      <button
        type="button"
        className="image-card-preview"
        onClick={onEdit}
        aria-label={`Annotate ${image.source.name}`}
      >
        <img src={url} alt="" loading="lazy" />
        <span className="image-card-edit">
          <Icon name="pen" size={16} />
          Annotate
        </span>
      </button>
      <div className="image-card-body">
        <div className="image-card-title">
          <h3 title={image.source.name}>{image.source.name}</h3>
          <Button
            variant="ghost"
            size="small"
            icon="trash"
            aria-label={`Delete ${image.source.name}`}
            onClick={onDelete}
          />
        </div>
        <p>
          {image.source.width.toLocaleString()} ×{" "}
          {image.source.height.toLocaleString()}{" "}
          <span>
            ·{" "}
            {image.source.origin === "url"
              ? "Web image"
              : image.source.origin === "file"
                ? "Local file"
                : image.source.origin === "paste"
                  ? "Clipboard"
                  : "Camera"}
          </span>
        </p>
        <div className="row">
          <Badge tone={marks ? "accent" : "neutral"}>
            {marks ? `${marks} ${marks === 1 ? "mark" : "marks"}` : "Original"}
          </Badge>
          {image.revisions.length > 0 && (
            <Badge>
              {image.revisions.length} saved{" "}
              {image.revisions.length === 1 ? "revision" : "revisions"}
            </Badge>
          )}
        </div>
      </div>
    </article>
  );
}

export function ImageCollection({
  images,
  onEdit,
  onDelete,
}: {
  images: CollectionImage[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState<CollectionImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="collection-section" aria-labelledby="collection-title">
      <div className="section-heading">
        <div className="row">
          <h2 id="collection-title">Your image collection</h2>
          <Badge>{images.length} / 40</Badge>
        </div>
        <p>Choose an image to annotate</p>
      </div>
      {images.length ? (
        <div className="image-grid">
          {images.map((image) => (
            <ImageCard
              key={image.source.id}
              image={image}
              onEdit={() => onEdit(image.source.id)}
              onDelete={() => {
                setDeleting(image);
                setError("");
              }}
            />
          ))}
        </div>
      ) : (
        <div className="collection-empty">
          <EmptyState title="Every fix starts with a closer look." icon="image">
            Add your first image above. Originals and edits stay together in
            this browser.
          </EmptyState>
          <div className="empty-image-stack" aria-hidden="true">
            <div />
            <div />
            <div>
              <Icon name="image" size={42} />
            </div>
          </div>
        </div>
      )}
      {deleting && (
        <Dialog
          title="Delete image?"
          description="This removes the original, its editable marks, and all saved revisions from this browser."
          onClose={() => setDeleting(null)}
          closeDisabled={busy}
        >
          <div className="dialog-body">
            <p className="truncate">{deleting.source.name}</p>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="dialog-actions">
              <Button onClick={() => setDeleting(null)} disabled={busy}>
                Keep image
              </Button>
              <Button
                variant="danger"
                icon="trash"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void onDelete(deleting.source.id)
                    .then(() => setDeleting(null))
                    .catch((cause) => setError(errorMessage(cause)))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? "Deleting…" : "Delete image"}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
