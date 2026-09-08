import { snapshotVersion, type ChatAsset, type VersionRef } from "./types";
import type {
  ChatModel, HistoryItem, HistoryRecord, ToolCallRecord,
} from "./historyTypes";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Only decode the result. Missing output must never be invented from call arguments. */
export function readToolResult(value: unknown): ObjectValue | null {
  try {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    if (!object(parsed)) return null;
    if (object(parsed.structuredContent)) return parsed.structuredContent;
    return parsed;
  } catch {
    return null;
  }
}

function imageRef(value: unknown): VersionRef | null {
  return object(value) && typeof value.assetId === "string" && typeof value.versionId === "string"
    ? { assetId: value.assetId, versionId: value.versionId }
    : null;
}

export interface ProjectionCatalog {
  readonly assets: readonly ChatAsset[];
  readonly models: readonly ChatModel[];
}

type ToolProjector = (
  call: ToolCallRecord,
  result: ObjectValue,
  catalog: ProjectionCatalog,
) => HistoryItem | null;

const base = (call: ToolCallRecord) => ({
  id: `tool-${call.toolCallId}`,
  title: call.title,
  tool: call,
});

const toolProjectors: Readonly<Record<string, ToolProjector>> = {
  "camera.capture": (call, result, catalog) => {
    if (result.view !== "camera" || !Array.isArray(result.photos) || typeof result.caption !== "string") return null;
    const refs = result.photos.map(imageRef);
    if (refs.some((ref) => ref === null)) return null;
    const photos = refs.map((ref) => snapshotVersion(catalog.assets, ref!));
    return { ...base(call), type: "camera", summary: `${photos.length} photos`, caption: result.caption, photos };
  },
  "images.show": (call, result, catalog) => {
    const ref = imageRef(result.image);
    if (result.view !== "image" || !ref || typeof result.caption !== "string") return null;
    const photo = snapshotVersion(catalog.assets, ref);
    return { ...base(call), type: "image", summary: `${photo.assetTitle} · v${photo.versionNumber}`, caption: result.caption, photo };
  },
  "models.show": (call, result, catalog) => {
    if (result.view !== "model" || typeof result.caption !== "string") return null;
    const model = catalog.models.find((item) => item.id === result.modelId);
    if (!model) return null;
    return { ...base(call), type: "model", summary: "Interactive 3D", caption: result.caption, model };
  },
};

export function projectToolCall(call: ToolCallRecord, catalog: ProjectionCatalog): HistoryItem {
  const result = readToolResult(call.rawOutput);
  try {
    const projected = result && toolProjectors[call.name]?.(call, result, catalog);
    if (projected) return projected;
  } catch {
    // A missing resource retains the tool's place and status in the conversation.
  }
  return {
    ...base(call),
    type: "tool",
    summary: call.status === "failed"
      ? "Could not complete"
      : result && typeof result.summary === "string"
        ? result.summary
        : "Preview unavailable",
  };
}

/** Call updates replace an item at its original position; identity survives status changes. */
export function projectHistory(records: readonly HistoryRecord[], catalog: ProjectionCatalog): HistoryItem[] {
  const items = new Map<string, HistoryItem>();
  for (const record of records) {
    const item = record.type === "message"
      ? { ...record, id: `message-${record.id}` }
      : projectToolCall(record, catalog);
    items.set(item.id, item);
  }
  return [...items.values()];
}
