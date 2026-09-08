import { useCallback, useEffect, useRef, useState } from "react";
import {
  addSource,
  deleteSource,
  loadCollection,
  putDraft,
  saveImage as persistImageSave,
} from "./storage";
import { errorMessage } from "./imageIO";
import type {
  CollectionImage,
  EditHistory,
  ImageDraft,
  ImageSave,
  ImageSaveMode,
  SourceImage,
} from "./types";

export function useCollection() {
  const [images, setImages] = useState<CollectionImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const mounted = useRef(false);
  const draftsToSave = useRef(new Map<string, ImageDraft>());
  const draftWrites = useRef(new Map<string, Promise<void>>());
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
    const writing = putDraft(draft);
    draftWrites.current.set(draft.sourceId, writing);
    try {
      await writing;
      if (draftsToSave.current.get(draft.sourceId) === draft)
        draftsToSave.current.delete(draft.sourceId);
      if (mounted.current && draftsToSave.current.size === 0) setError("");
    } catch (cause) {
      if (mounted.current)
        setError(`Edits are in memory only. ${errorMessage(cause)}`);
    } finally {
      if (draftWrites.current.get(draft.sourceId) === writing)
        draftWrites.current.delete(draft.sourceId);
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
  const saveImage = useCallback(
    async (input: ImageSave, mode: ImageSaveMode, signal?: AbortSignal) => {
      saving.current += 1;
      if (mounted.current) setPending(saving.current);
      try {
        // Finish older autosaves before an atomic save can restore a parent draft.
        await draftWrites.current.get(input.sourceId)?.catch(() => undefined);
        const saved = await persistImageSave(input, mode, signal);
        draftsToSave.current.delete(input.sourceId);
        if (mounted.current) {
          setImages((current) => {
            const updated = current.map((image) => {
              if (image.source.id === saved.image.source.id) return saved.image;
              if (image.source.id === saved.parentDraft?.sourceId)
                return { ...image, draft: saved.parentDraft };
              return image;
            });
            return mode === "copy" ? [saved.image, ...updated] : updated;
          });
          if (!draftsToSave.current.size) setError("");
        }
        return saved.image;
      } finally {
        saving.current -= 1;
        if (mounted.current) setPending(saving.current);
      }
    },
    [],
  );

  return {
    images,
    loading,
    error,
    pending,
    add,
    remove,
    updateDraft,
    saveImage,
    reload,
    retryDrafts,
    unsaved: draftsToSave.current.size > 0,
  };
}
