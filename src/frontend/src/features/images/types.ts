import type { ModelProvenance } from "../models/types";

export interface Point {
  x: number;
  y: number;
}
interface MarkBase {
  id: string;
  color: string;
  width: number;
  /** Optional persisted contrast edge; earlier marks keep their original appearance. */
  outline?: { color: string; width: number };
}
export type Mark =
  | (MarkBase & { kind: "pen"; points: Point[] })
  | (MarkBase & { kind: "arrow" | "rectangle"; from: Point; to: Point })
  | (MarkBase & { kind: "text"; at: Point; text: string; fontSize: number });

export interface EditHistory {
  past: Mark[][];
  present: Mark[];
  future: Mark[][];
}
export const emptyHistory = (): EditHistory => ({
  past: [],
  present: [],
  future: [],
});
export interface SourceImage {
  id: string;
  name: string;
  origin: "file" | "paste" | "camera" | "url" | "model";
  createdAt: string;
  width: number;
  height: number;
  blob: Blob;
  /** Optional additive metadata: existing IndexedDB v1 images remain readable. */
  model?: ModelProvenance;
  /** Copies keep the original pixels and a durable link to their parent image. */
  lineage?: {
    rootSourceId: string;
    parentSourceId: string;
    parentRevisionId?: string;
  };
}
export interface ImageDraft {
  sourceId: string;
  history: EditHistory;
  updatedAt: string;
}
export interface Revision {
  id: string;
  sourceId: string;
  createdAt: string;
  marks: Mark[];
  png: Blob;
}
export type RevisionInfo = Omit<Revision, "png" | "marks">;
export interface CollectionImage {
  source: SourceImage;
  draft: ImageDraft;
  revisions: RevisionInfo[];
  /** Latest explicit save. Draft autosaves never replace this appearance. */
  saved: Revision | null;
}

export type ImageSaveMode = "copy" | "update";
export interface ImageSave {
  sourceId: string;
  history: EditHistory;
  png: Blob;
}
export interface SavedImageResult {
  image: CollectionImage;
  /** Saving a copy transfers the working draft and resets its parent to its saved marks. */
  parentDraft?: ImageDraft;
}

export const LIMITS = {
  fileBytes: 12 * 1024 * 1024,
  pixels: 16_000_000,
  dimension: 8192,
  images: 40,
  revisions: 20,
  storageBytes: 250 * 1024 * 1024,
  marks: 300,
  points: 2048,
  history: 30,
} as const;
