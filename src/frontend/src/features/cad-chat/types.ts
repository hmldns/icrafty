import type { ChatModel } from "../chat-flow/historyTypes";
import type { PhotoAttachment, VersionRef } from "../chat-flow/types";

export type CadStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export interface CadFile {
  id: string; url: string; downloadUrl: string; filename: string;
  format: string; mediaType: string; sizeBytes: number; sha256: string;
}
export interface CadMetric {
  id: string; kind: string; target: Record<string, unknown>; unit: string;
  status: "measured" | "pass" | "fail" | "unavailable" | "error";
  value: unknown; method: string; frame: string; axis?: string;
  criterion?: unknown; difference?: unknown;
}
export interface CadOutput {
  id: string; kind: "png" | "step";
  status: "pending" | "ready" | "unavailable" | "error";
  image: VersionRef | null; file: CadFile | null;
  photo: PhotoAttachment | null;
  annotations: { inline: boolean; file: CadFile | null };
  views: unknown[];
  reason: string | null;
}
/** Browser projection of the versioned backend-owned cad.result record. */
export interface CadResult {
  operationId: string; operationVersion: number; operationKind: "model" | "evidence" | "restore";
  status: CadStatus; phase: string;
  revision: { id: string; number: number; parentRevisionId: string | null } | null;
  geometry: { digest: string; availability: "live" | "snapshot" | "unavailable" } | null;
  evaluationId: string | null; publicationId: string | null;
  outputs: CadOutput[]; images: VersionRef[];
  model: (ChatModel & { downloadUrl: string; sha256: string; sizeBytes: number }) | null;
  downloads: CadFile[]; metrics: CadMetric[];
  interpretation: string; error: string | null;
  budget: { evaluations: number; maxEvaluations: number | null; elapsedSeconds: number; maxSeconds: number | null } | null;
  reuse: Record<string, number>;
  presentation: { messageMode: "together" | "per_image"; index: number; count: number };
}

export const cadStatusLabels: Record<CadStatus, string> = {
  queued: "Queued", running: "Working", completed: "Completed", failed: "Failed",
  cancelled: "Cancelled", interrupted: "Interrupted",
};
