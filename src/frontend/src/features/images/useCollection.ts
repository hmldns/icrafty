import { useCallback, useEffect, useRef, useState } from "react";
import {
  addRevision,
  addSource,
  deleteSource,
  loadCollection,
  putDraft,
} from "./storage";
import { errorMessage } from "./imageIO";
import type {
  CollectionImage,
  EditHistory,
  ImageDraft,
  Revision,
  SourceImage,
} from "./types";

export function useCollection() {
  const [images, setImages] = useState<CollectionImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const mounted = useRef(false);
  const draftsToSave = useRef(new Map<string, ImageDraft>());
  const saving = useRef(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const records = await loadCollection();
      if (mounted.current) setImages(records);
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (draftsToSave.current.size || saving.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const add = useCallback(async (source: SourceImage) => {
    const record = await addSource(source);
    if (mounted.current) setImages((current) => [record, ...current]);
    return record;
  }, []);
  const remove = useCallback(async (id: string) => {
    await deleteSource(id);
    draftsToSave.current.delete(id);
    if (mounted.current)
      setImages((current) => current.filter((image) => image.source.id !== id));
  }, []);

  const persistDraft = useCallback(async (draft: ImageDraft) => {
    saving.current += 1;
    if (mounted.current) setPending(saving.current);
    try {
      await putDraft(draft);
      if (draftsToSave.current.get(draft.sourceId) === draft)
        draftsToSave.current.delete(draft.sourceId);
      if (mounted.current && draftsToSave.current.size === 0) setError("");
    } catch (cause) {
      if (mounted.current)
        setError(`Edits are in memory only. ${errorMessage(cause)}`);
    } finally {
      saving.current -= 1;
      if (mounted.current) setPending(saving.current);
    }
  }, []);
  const updateDraft = useCallback(
    (sourceId: string, history: EditHistory) => {
      const draft: ImageDraft = {
        sourceId,
        history,
        updatedAt: new Date().toISOString(),
      };
      draftsToSave.current.set(sourceId, draft);
      setImages((current) =>
        current.map((image) =>
          image.source.id === sourceId ? { ...image, draft } : image,
        ),
      );
      void persistDraft(draft);
    },
    [persistDraft],
  );
  const retryDrafts = useCallback(() => {
    for (const draft of draftsToSave.current.values()) void persistDraft(draft);
  }, [persistDraft]);
  const saveRevision = useCallback(async (revision: Revision) => {
    await addRevision(revision);
    if (mounted.current)
      setImages((current) =>
        current.map((image) =>
          image.source.id === revision.sourceId
            ? {
                ...image,
                revisions: [
                  ...image.revisions,
                  {
                    id: revision.id,
                    sourceId: revision.sourceId,
                    createdAt: revision.createdAt,
                  },
                ],
              }
            : image,
        ),
      );
  }, []);

  return {
    images,
    loading,
    error,
    pending,
    add,
    remove,
    updateDraft,
    saveRevision,
    reload,
    retryDrafts,
    unsaved: draftsToSave.current.size > 0,
  };
}
