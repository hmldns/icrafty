import type { HistoryRecord } from "../chat-flow/historyTypes";
import { projectHistory } from "../chat-flow/projectHistory";
import { snapshotVersion, type ChatAsset, type PhotoAttachment } from "../chat-flow/types";
import type { AgentEvent, AgentImage, AgentSnapshot } from "./types";

export function asChatAsset(image: AgentImage): ChatAsset {
  return { id: image.id, title: image.title, source: { kind: image.origin }, currentVersionId: image.versionId,
    versions: [{ id: image.versionId, number: 1, label: image.origin === "generated" ? "Generated image" : "Uploaded image",
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
    : record);
  return projectHistory(records, { assets, models: [] }).map(item => {
    if (item.type === "message") return item;
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
    case "record": return { ...next, records: upsert(snapshot.records, event.payload, record => record.type === "message" ? record.id : record.toolCallId) };
  }
}
