import { ChatMarkdown } from "../ChatMarkdown";
import { defineItemRenderer } from "../ItemRendererRegistry";

export const thoughtItemEntry = defineItemRenderer(
  { type: "thought", label: "Reasoning", icon: "text", variant: "interaction", initiallyExpanded: false },
  item => <div className="chat-thought-text"><ChatMarkdown text={item.text} streaming={item.streaming} /></div>,
);
