import { useCallback, useState } from "react";
import { AnnotationEditor } from "../annotation/AnnotationEditor";
import { CameraPanel } from "../camera/CameraPanel";
import { Button, LoadingState, Notice } from "../../components/ui/primitives";
import { ImageCollection } from "./ImageCollection";
import { ImageIntake } from "./ImageIntake";
import { useCollection } from "./useCollection";
import type { SourceImage } from "./types";

export function CameraWorkspace() {
  const collection = useCollection();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = collection.images.find(
    (image) => image.source.id === editingId,
  );
  const addImage = useCallback(
    async (source: SourceImage, openEditor: boolean) => {
      await collection.add(source);
      if (openEditor) setEditingId(source.id);
    },
    [collection.add],
  );
  return (
    <div className="workspace">
      <ImageIntake
        onAdd={addImage}
        onCamera={() => setCameraOpen(true)}
        disabled={collection.loading}
      />
      {cameraOpen && (
        <CameraPanel
          onCapture={collection.add}
          onClose={() => setCameraOpen(false)}
        />
      )}
      {collection.error && (
        <Notice
          tone="error"
          action={
            <Button
              size="small"
              onClick={() =>
                collection.unsaved
                  ? collection.retryDrafts()
                  : void collection.reload()
              }
            >
              {collection.unsaved ? "Retry saving" : "Retry loading"}
            </Button>
          }
        >
          {collection.error}
        </Notice>
      )}
      {collection.loading ? (
        <LoadingState>Opening your local image collection…</LoadingState>
      ) : (
        <ImageCollection
          images={collection.images}
          onEdit={setEditingId}
          onDelete={collection.remove}
        />
      )}
      {editing && (
        <AnnotationEditor
          key={editing.source.id}
          image={editing}
          onClose={() => setEditingId(null)}
          onChange={collection.updateDraft}
          onSave={collection.saveRevision}
          pending={collection.pending > 0}
          storageError={collection.error}
        />
      )}
    </div>
  );
}
