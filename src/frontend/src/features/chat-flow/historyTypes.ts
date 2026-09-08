import type { ChatInput, PhotoAttachment } from "./types";

export interface MessageRecord extends ChatInput {
  readonly type: "message";
  readonly id: string;
  readonly author: "you" | "crafty";
  readonly origin: "fixture" | "local";
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

export type HistoryRecord = MessageRecord | ToolCallRecord;

export interface ChatModel {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly format: "stl" | "step";
}

export interface MessageItem extends MessageRecord {}

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

export type HistoryItem = MessageItem | CameraItem | ImageItem | ModelItem | GenericToolItem;
