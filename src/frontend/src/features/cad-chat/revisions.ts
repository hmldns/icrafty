import type { CadItem, HistoryItem } from "../chat-flow/historyTypes";
import type { CadResult } from "./types";

export interface CadRevision {
  id: string;
  number: number;
  title: string;
  item: CadItem;
  model: CadResult["model"];
}

/** Evidence/export operations share a revision; only a design change adds one. */
export function collectCadRevisions(items: readonly HistoryItem[]): CadRevision[] {
  const revisions = new Map<string, CadRevision>();
  for (const item of items) {
    if (item.type !== "cad" || !item.result.revision || item.result.presentation.index !== 0) continue;
    const { revision } = item.result;
    const previous = revisions.get(revision.id);
    const model = item.result.status === "completed" ? item.result.model : null;
    revisions.set(revision.id, {
      id: revision.id, number: revision.number,
      title: item.result.operationKind === "model" || !previous ? item.title : previous.title,
      // A later PNG-only or failed query must not discard an already usable STEP.
      item: model || !previous?.model ? item : previous.item,
      model: model ?? previous?.model ?? null,
    });
  }
  return [...revisions.values()].sort((a, b) => b.number - a.number || a.id.localeCompare(b.id));
}

export function revisionAvailability(revision: CadRevision): string {
  if (revision.model) return revision.model.format.toUpperCase();
  if (["queued", "running"].includes(revision.item.result.status)) return "Preparing";
  if (revision.item.result.status === "completed") return "No 3D export";
  return "Unavailable";
}
