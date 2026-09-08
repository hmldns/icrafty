import type { ReactNode } from "react";
import type { IconName } from "../../components/ui/Icon";
import type { SourceImage } from "../images/types";
import type { ModelSnapshot } from "../models/types";
import type { CameraItem, HistoryItem, ModelItem } from "./historyTypes";
import type { PhotoAttachment, VersionRef } from "./types";

export interface ItemActions {
  readonly attachments: readonly PhotoAttachment[];
  inspect: (ref: VersionRef) => void;
  attach: (photo: PhotoAttachment) => void;
  capture: (item: CameraItem, image: SourceImage) => Promise<void>;
  snapshot: (item: ModelItem, snapshot: ModelSnapshot) => void;
}

export interface ItemRendererEntry {
  readonly type: HistoryItem["type"];
  readonly label: string;
  readonly icon: IconName;
  readonly variant: "message" | "interaction";
  readonly initiallyExpanded: boolean;
  render: (item: HistoryItem, actions: ItemActions) => ReactNode;
}

/** The discriminator check is the sole narrowing boundary for registered components. */
export function defineItemRenderer<K extends HistoryItem["type"]>(
  config: Omit<ItemRendererEntry, "type" | "render"> & { type: K },
  render: (item: Extract<HistoryItem, { type: K }>, actions: ItemActions) => ReactNode,
): ItemRendererEntry {
  return {
    ...config,
    render: (item, actions) => item.type === config.type
      ? render(item as Extract<HistoryItem, { type: K }>, actions)
      : null,
  };
}

export type ItemRendererResolver = (item: HistoryItem) => ItemRendererEntry | undefined;

export function createItemRenderer(entries: readonly ItemRendererEntry[]): ItemRendererResolver {
  const registry = new Map(entries.map((entry) => [entry.type, entry]));
  return (item) => registry.get(item.type);
}
