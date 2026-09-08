import { createItemRenderer } from "./ItemRendererRegistry";
import { cameraItemEntry } from "./CameraRunCard";
import { imageItemEntry } from "./items/ImageItemView";
import { modelItemEntry } from "./items/ModelItemView";
import { messageItemEntry } from "./items/MessageItemView";
import { genericToolItemEntry } from "./items/GenericToolItemView";

export const chatItemRenderer = createItemRenderer([
  messageItemEntry, cameraItemEntry, imageItemEntry, modelItemEntry, genericToolItemEntry,
]);
