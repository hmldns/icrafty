import type { ChatInput, PhotoAttachment } from "./types";

export interface MessageRecord extends ChatInput {
  readonly type: "message";
  readonly id: string;
  readonly author: "you" | "crafty";
  readonly origin: "fixture" | "local" | "agent";
  readonly streaming?: boolean;
}

/** Small presentation input for a future adapter, not an ACP/session implementation. */
export interface ToolCallRecord {
  readonly type: "tool_call";
  readonly toolCallId: string;
  readonly name: string;
  readonly title: string;
  readonly status: "pending" | "in_progress" | "completed" | "failed";
  readonly rawInput?: unknown;
  readonly rawOutput?: unknown;
}

/** Reasoning text explicitly supplied by the adapter, separate from assistant replies. */
export interface ThoughtRecord {
  readonly type: "thought";
  readonly id: string;
  readonly text: string;
  readonly turnId: string;
  readonly streaming?: boolean;
}

export type HistoryRecord = MessageRecord | ThoughtRecord | ToolCallRecord;

export interface ChatModel {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly format: "stl" | "step";
}

export interface MessageItem extends MessageRecord {}

export interface ThoughtItem extends ThoughtRecord {
  readonly title: string;
  readonly summary: string;
}

interface ToolItemBase {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly tool: ToolCallRecord;
}

export interface CameraItem extends ToolItemBase {
  readonly type: "camera";
  readonly caption: string;
  readonly photos: readonly PhotoAttachment[];
}

export interface ImageItem extends ToolItemBase {
  readonly type: "image";
  readonly caption: string;
  readonly photo: PhotoAttachment;
}

export interface ModelItem extends ToolItemBase {
  readonly type: "model";
  readonly caption: string;
  readonly model: ChatModel;
}

export interface GenericToolItem extends ToolItemBase {
  readonly type: "tool";
}

export interface DimensionField {
  readonly id: string;
  readonly label: string;
  readonly kind: "number" | "text";
  readonly unit?: "mm" | "cm" | "in" | "degrees" | null;
  readonly hint?: string;
}

export interface MeasurementItem extends ToolItemBase {
  readonly type: "measurements";
  readonly requestId: string;
  readonly caption: string;
  readonly fields: readonly DimensionField[];
  readonly photos: readonly PhotoAttachment[];
  readonly status: "awaiting_answers" | "answered";
  readonly answers: Readonly<Record<string, string | number>>;
}

export type HistoryItem = MessageItem | ThoughtItem | CameraItem | ImageItem | ModelItem | GenericToolItem | MeasurementItem;
