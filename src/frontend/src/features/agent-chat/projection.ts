import type { HistoryItem, HistoryRecord } from "../chat-flow/historyTypes";
import { projectHistory, readToolResult } from "../chat-flow/projectHistory";
import { snapshotVersion, type ChatAsset, type PhotoAttachment } from "../chat-flow/types";
import type { AgentEvent, AgentImage, AgentSnapshot } from "./types";

export function asChatAsset(image: AgentImage): ChatAsset {
  return { id: image.id, title: image.title, source: { kind: image.origin }, currentVersionId: image.versionId,
    versions: [{ id: image.versionId, number: 1, label: image.origin === "cad" ? "CAD render" : image.origin === "generated" ? "Generated image" : "Uploaded image",
      imageSrc: image.url, imageAlt: image.title, note: "Immutable image saved with this chat.", marks: [] }] };
}

export function attachment(image: AgentImage): PhotoAttachment {
  return snapshotVersion([asChatAsset(image)], { assetId: image.id, versionId: image.versionId });
}

export function projectAgentSnapshot(snapshot: AgentSnapshot) {
  const assets = snapshot.assets.map(asChatAsset);
  const last = snapshot.records.at(-1);
  const records: HistoryRecord[] = snapshot.records.map(record => record.type === "message"
    ? { ...record, streaming: record === last && record.author === "crafty" && !!snapshot.session.activeTurnId,
      attachments: (record.imageRefs ?? record.imageIds.map(id => ({ assetId: id, versionId: "1" }))).flatMap(ref => {
      const image = snapshot.assets.find(asset => asset.id === ref.assetId && asset.versionId === ref.versionId);
      return image ? [attachment(image)] : [];
    }) }
    : record.type === "thought" ? { ...record, streaming: record === last && record.turnId === snapshot.session.activeTurnId } : record);
  const items: HistoryItem[] = projectHistory(records, { assets, models: [], sessionId: snapshot.session.id }).map(item => {
    if (item.type === "message" || item.type === "thought") return item;
    // Keep original tool details in the record inspector; use domain titles in chat.
    if (item.type === "image") return { ...item, title: item.photo.assetTitle };
    if (item.type === "camera") return { ...item, title: "Camera request" };
    const title = item.title.startsWith("View Image ") ? "Inspect image"
      : item.title.startsWith("Read file ") ? "Read a file"
      : item.title === "mcp.crafty_images.list_images" ? "List chat images"
      : item.title === "Guardian Review" ? "Permission review"
      : item.title.length > 100 ? "Local tool activity" : item.title;
    return { ...item, title };
  });
  const reply = items.at(-1);
  const latest = [...items].reverse().find(item => item.type === "cad" && item.result.status === "completed" && item.result.model);
  // Keep native evidence in its original place, and expose its validated model
  // beside the final reply. This is a view of the existing artifact, not a tool call.
  if (reply?.type === "message" && reply.author === "crafty" && !reply.streaming && latest?.type === "cad" && latest.result.model) {
    items.push({ type: "model", id: `current-model-${latest.result.model.id}`, title: "3D model",
      summary: `Revision ${latest.result.revision?.number} · Interactive STEP`,
      caption: latest.result.model.name, model: latest.result.model, tool: latest.tool });
  }
  return items;
}

function upsert<T>(values: T[], value: T, key: (value: T) => string) {
  const index = values.findIndex(item => key(item) === key(value));
  return index < 0 ? [...values, value] : values.map((item, position) => position === index ? value : item);
}

export function applyAgentEvent(snapshot: AgentSnapshot, event: AgentEvent): AgentSnapshot {
  if (event.seq <= snapshot.cursor) return snapshot;
  const next = { ...snapshot, cursor: event.seq };
  switch (event.kind) {
    case "session": return { ...next, session: event.payload };
    case "asset": return { ...next, assets: upsert(snapshot.assets, event.payload, image => image.id) };
    case "interaction": return { ...next, interactions: upsert(snapshot.interactions ?? [], event.payload, item => item.id) };
    case "record": {
      const record = event.payload;
      if (record.type === "tool_call" && record.name === "cad.result") {
        const previous = snapshot.records.find(item => item.type === "tool_call" && item.toolCallId === record.toolCallId);
        const before = previous?.type === "tool_call" ? readToolResult(previous.rawOutput) : null;
        const after = readToolResult(record.rawOutput);
        if (typeof before?.operationVersion === "number" && typeof after?.operationVersion === "number"
          && after.operationVersion < before.operationVersion) return next;
      }
      return { ...next, records: upsert(snapshot.records, record, item => item.type === "tool_call" ? item.toolCallId : item.id) };
    }
  }
}
