import { defineItemRenderer, type ItemActions } from "../ItemRendererRegistry";
import { PhotoStrip } from "../PhotoStrip";
import { ChatMarkdown } from "../ChatMarkdown";
import type { MessageItem } from "../historyTypes";

function MessageItemView({ item, actions }: { item: MessageItem; actions: ItemActions }) {
  return (
    <article
      className={`chat-message chat-message--${item.author}`}
      data-streaming={item.streaming || undefined}
      aria-busy={item.streaming || undefined}
      aria-label={`${item.origin === "agent" ? "Live" : item.origin === "local" ? "Local" : "Sample"} message from ${item.author === "you" ? "you" : "icrafty"}`}
    >
      <div className="chat-message-heading">
        <span className="chat-avatar" aria-hidden="true">{item.author === "you" ? "Y" : "c"}</span>
        <strong>{item.author === "you" ? "You" : "icrafty"}</strong>
        {item.streaming && <span className="chat-streaming-label">Writing…</span>}
      </div>
      <div className="chat-message-body">
        {item.text && <ChatMarkdown text={item.text} streaming={item.streaming} />}
        {item.attachments.length > 0 && (
          <PhotoStrip photos={item.attachments} label="Submitted image versions" onInspect={actions.inspect} />
        )}
      </div>
    </article>
  );
}

export const messageItemEntry = defineItemRenderer(
  { type: "message", label: "Message", icon: "text", variant: "message", initiallyExpanded: true },
  (item, actions) => <MessageItemView item={item} actions={actions} />,
);
