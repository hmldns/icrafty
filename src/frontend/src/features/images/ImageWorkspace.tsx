import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnnotationEditor } from "../annotation/AnnotationEditor";
import { Button, LoadingState, Notice } from "../../components/ui/primitives";
import { ImageCollection } from "./ImageCollection";
import { useCollection } from "./useCollection";
import type { ImageSave, ImageSaveMode, SourceImage } from "./types";

export interface ImageWorkspaceIntake {
  addImage: (source: SourceImage, openEditor: boolean) => Promise<void>;
  loading: boolean;
}

/** Shared source intake → collection → editor orchestration for every capture source. */
export function ImageWorkspace({
  children,
}: {
  children: (intake: ImageWorkspaceIntake) => ReactNode;
}) {
  const collection = useCollection();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorMessage, setEditorMessage] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const editing = collection.images.find(
    (image) => image.source.id === editingId,
  );
  const addImage = useCallback(
    async (source: SourceImage, openEditor: boolean) => {
      await collection.add(source);
      if (openEditor && mounted.current) {
        setEditorMessage("");
        setEditingId(source.id);
      }
    },
    [collection.add],
  );
  const saveImage = async (
    input: ImageSave,
    mode: ImageSaveMode,
    signal: AbortSignal,
  ) => {
    const saved = await collection.saveImage(input, mode, signal);
    if (mode === "copy" && mounted.current) {
      setEditorMessage(
        "Saved as a new image. You are editing the copy; the source image is unchanged.",
      );
      setEditingId(saved.source.id);
    }
    return saved;
  };
  return (
    <div className="workspace">
      {children({ addImage, loading: collection.loading })}
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
          onEdit={(id) => {
            setEditorMessage("");
            setEditingId(id);
          }}
          onDelete={collection.remove}
        />
      )}
      {editing && (
        <AnnotationEditor
          key={editing.source.id}
          image={editing}
          onClose={() => setEditingId(null)}
          onChange={collection.updateDraft}
          onSave={saveImage}
          initialMessage={editorMessage}
          pending={collection.pending > 0}
          storageError={collection.error}
        />
      )}
    </div>
  );
}
