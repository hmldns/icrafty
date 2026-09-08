import type { ThoughtRecord, ToolCallRecord } from "../chat-flow/historyTypes";
import type { EditHistory, SourceImage } from "../images/types";

export interface AgentImage {
  id: string;
  versionId: string;
  title: string;
  width: number;
  height: number;
  mimeType: string;
  size: number;
  digest: string;
  origin: "upload" | "generated";
  url: string;
}

export interface AgentPermission {
  id: string;
  toolCall: { title?: string; rawInput?: unknown };
  options: { optionId: string; name: string; kind: string }[];
}

export interface AgentSession {
  id: string;
  title: string;
  updatedAt: string;
  runtime: "stopped" | "starting" | "ready" | "failed";
  activeTurnId: string | null;
  turnStatus: string | null;
  error: string | null;
  model: string | null;
  permissions: AgentPermission[];
}

export interface AgentMessage {
  type: "message";
  id: string;
  author: "you" | "crafty";
  origin: "agent";
  text: string;
  imageIds: string[];
  imageRefs?: { assetId: string; versionId: string }[];
}

export type AgentRecord = AgentMessage | ThoughtRecord | ToolCallRecord;
export interface AgentInteraction {
  id: string;
  kind: "camera" | "permission";
  status: string;
  turnId: string;
  generation: number;
  toolCallId?: string | null;
}
export interface AgentSnapshot {
  schemaVersion: 1;
  session: AgentSession;
  records: AgentRecord[];
  assets: AgentImage[];
  interactions: AgentInteraction[];
  cursor: number;
}
export type AgentEvent =
  | { seq: number; kind: "session"; payload: AgentSession }
  | { seq: number; kind: "record"; payload: AgentRecord }
  | { seq: number; kind: "interaction"; payload: AgentInteraction }
  | { seq: number; kind: "asset"; payload: AgentImage };

/** Editable browser state; only the selected PNG is published when Send is pressed. */
export interface DraftImageEdit {
  id: string;
  source: SourceImage;
  history: EditHistory;
  png: Blob;
}

export interface AgentDraft {
  text: string;
  imageIds: string[];
  edits?: Record<string, DraftImageEdit>;
}
