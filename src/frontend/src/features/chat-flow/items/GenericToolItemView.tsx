import { defineItemRenderer } from "../ItemRendererRegistry";

export const genericToolItemEntry = defineItemRenderer(
  { type: "tool", label: "Activity", icon: "check", variant: "interaction", initiallyExpanded: false },
  (item) => <p className="chat-item-intro">{item.summary}</p>,
);
