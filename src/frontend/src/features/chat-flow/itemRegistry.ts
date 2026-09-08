import { createItemRenderer } from "./ItemRendererRegistry";
import { cameraItemEntry } from "./CameraRunCard";
import { imageItemEntry } from "./items/ImageItemView";
import { modelItemEntry } from "./items/ModelItemView";
import { messageItemEntry } from "./items/MessageItemView";
import { genericToolItemEntry } from "./items/GenericToolItemView";
import { thoughtItemEntry } from "./items/ThoughtItemView";

export const chatItemRenderer = createItemRenderer([
  messageItemEntry, thoughtItemEntry, cameraItemEntry, imageItemEntry, modelItemEntry, genericToolItemEntry,
]);
