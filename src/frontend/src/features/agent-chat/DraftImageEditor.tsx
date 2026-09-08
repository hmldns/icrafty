import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { LoadingState, Notice } from "../../components/ui/primitives";
import { AnnotationEditor } from "../annotation/AnnotationEditor";
import { prepareImage } from "../images/imageIO";
import { emptyHistory, type CollectionImage, type SourceImage } from "../images/types";
import type { AgentImage, DraftImageEdit } from "./types";

/** Owns just the clicked attachment; unsaved changes never alter chat history. */
export function DraftImageEditor({ image, edit, onSave, onClose }: {
  image: AgentImage;
  edit?: DraftImageEdit;
  onSave: (edit: DraftImageEdit) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<SourceImage | null>(edit?.source ?? null);
  const [error, setError] = useState("");
  const history = useRef(edit?.history ?? emptyHistory());
  useEffect(() => {
    if (edit) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(image.url, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load this image. Close the editor and try again.");
        const prepared = await prepareImage(await response.blob(), image.title, "file", controller.signal);
        if (!controller.signal.aborted) setSource({ ...prepared, id: image.id });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    void load();
    return () => controller.abort();
  }, [image.id, image.title, image.url, edit]);
  if (!source) return <Dialog title="Annotate image" description={image.title} onClose={onClose} wide>
    {error ? <Notice tone="error">{error}</Notice> : <LoadingState>Opening image…</LoadingState>}
  </Dialog>;
  const collectionImage: CollectionImage = {
    source, draft: { sourceId: source.id, history: history.current, updatedAt: source.createdAt }, revisions: [], saved: null,
  };
  return <AnnotationEditor mode="attachment" pending={false} storageError="" onClose={onClose}
    image={collectionImage}
    onChange={(_, next) => { history.current = next; }}
    onSave={async input => {
      onSave({ id: crypto.randomUUID(), source, history: input.history, png: input.png });
      onClose();
      return collectionImage;
    }} />;
}
