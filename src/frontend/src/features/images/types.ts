export interface Point {
  x: number;
  y: number;
}
interface MarkBase {
  id: string;
  color: string;
  width: number;
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
  origin: "file" | "paste" | "camera" | "url";
  createdAt: string;
  width: number;
  height: number;
  blob: Blob;
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
