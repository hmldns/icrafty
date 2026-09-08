import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/primitives";
import type { ItemActions, ItemRendererResolver } from "./ItemRendererRegistry";
import { InteractionItemFrame } from "./InteractionItemFrame";
import type { HistoryItem } from "./historyTypes";

/** Timeline knows order and expansion, while the injected registry owns item presentation. */
export function ChatHistory({ items, itemRenderer, actions }: {
  items: readonly HistoryItem[];
  itemRenderer: ItemRendererResolver;
  actions: ItemActions;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const lastId = useRef(items.at(-1)?.id);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const jumpToEnd = () => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  };
  useEffect(() => {
    const latest = items.at(-1);
    if (latest?.id !== lastId.current && latest?.type === "message" && latest.origin === "local") jumpToEnd();
    lastId.current = latest?.id;
  }, [items]);

  function expandAll(value: boolean) {
    setExpanded(Object.fromEntries(items.map((item) => [item.id, value])));
  }

  return (
    <section className="chat-history" aria-labelledby="chat-history-title">
      <div className="chat-history-heading">
        <h2 id="chat-history-title">Conversation</h2>
        <div className="row">
          <Button size="small" variant="ghost" onClick={() => expandAll(false)}>Collapse items</Button>
          <Button size="small" variant="ghost" onClick={() => expandAll(true)}>Expand items</Button>
        </div>
      </div>
      <div
        className="chat-history-scroll" ref={scroll} tabIndex={0} role="region" aria-label="Conversation timeline"
        onScroll={() => {
          const el = scroll.current;
          if (el) setAwayFromEnd(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
        }}
      >
        <ol className="chat-history-list" aria-label="Chat history">
          {items.map((item) => {
            const renderer = itemRenderer(item);
            if (!renderer) return <li key={item.id}>This item has no registered view.</li>;
            const content = renderer.render(item, actions);
            return (
              <li key={item.id} className={`chat-entry chat-entry--${renderer.variant}`}>
                {renderer.variant === "interaction" && "tool" in item ? (
                  <InteractionItemFrame
                    item={item} icon={renderer.icon} label={renderer.label}
                    expanded={expanded[item.id] ?? renderer.initiallyExpanded}
                    onToggle={() => setExpanded((current) => ({ ...current, [item.id]: !(current[item.id] ?? renderer.initiallyExpanded) }))}
                  >{content}</InteractionItemFrame>
                ) : content}
              </li>
            );
          })}
        </ol>
      </div>
      {awayFromEnd && <Button className="chat-jump" size="small" icon="right" onClick={jumpToEnd}>Latest</Button>}
    </section>
  );
}
