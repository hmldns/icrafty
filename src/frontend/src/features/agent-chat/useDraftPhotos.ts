import { useEffect, useState } from "react";
import { attachment } from "./projection";
import type { AgentDraft, AgentImage } from "./types";

/** Object URLs belong to the mounted composer, while editable blobs survive chat switches. */
export function useDraftPhotos(images: AgentImage[], draft: AgentDraft) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    const urls = Object.fromEntries(Object.values(draft.edits ?? {}).map(edit => [edit.id, URL.createObjectURL(edit.png)]));
    setPreviews(urls);
    return () => Object.values(urls).forEach(url => URL.revokeObjectURL(url));
  }, [draft.edits]);
  return draft.imageIds.flatMap(id => {
    const image = images.find(item => item.id === id);
    if (!image) return [];
    const edit = draft.edits?.[id];
    return [{ ...attachment(image), imageSrc: (edit && previews[edit.id]) || image.url,
      versionLabel: edit ? "Edited draft" : "Draft" }];
  });
}
