import { useId, useRef, useState, type ReactNode } from "react";
import { Brand } from "../../components/Brand";
import { Button, cx } from "../../components/ui/primitives";
import type { AgentSession } from "./types";

export function SessionSidebar({ sessions, selected, creating, onCreate, onSelect, onRefresh, product = false, sample }: {
  sessions: AgentSession[]; selected: string | null; creating: boolean;
  onCreate: () => void; onSelect: (id: string) => void; onRefresh: () => void;
  product?: boolean; sample?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  function closeMenu() {
    setExpanded(false);
    if (toggle.current?.getClientRects().length) toggle.current.focus();
  }
  return <aside className="agent-sidebar" aria-label={product ? "Repairs" : "Chats"}>
    {product && <div className="repair-sidebar-brand">
      <Brand />
      <button ref={toggle} type="button" className="button button--small button--ghost repair-sidebar-toggle"
        aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)}>
        {expanded ? "Hide repairs" : "Show repairs"}
      </button>
    </div>}
    <div id={contentId} className="agent-sidebar-content" data-expanded={expanded}
      onKeyDown={event => { if (product && expanded && event.key === "Escape") { event.preventDefault(); closeMenu(); } }}>
    <div className="agent-sidebar-heading"><h2>{product ? "Your repairs" : "Your chats"}</h2><Button size="small" variant="ghost" onClick={onRefresh}>Refresh</Button></div>
    <Button variant="primary" icon="plus" disabled={creating} onClick={() => { onCreate(); closeMenu(); }}>{creating ? "Starting…" : product ? "New repair" : "New chat"}</Button>
    <ul className="agent-session-list">
      {sessions.map(session => <li key={session.id}>
        <button type="button" className={cx("agent-session", selected === session.id && "agent-session--selected")}
          aria-pressed={selected === session.id} disabled={creating} onClick={() => { onSelect(session.id); closeMenu(); }}>
          <strong>{session.title}</strong>
          <span>{session.activeTurnId ? "Working" : session.runtime === "ready" ? "Ready" : session.runtime === "failed" ? "Needs attention" : "Saved"}
            <span aria-hidden="true"> · </span><time dateTime={session.updatedAt}>{new Date(session.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></span>
        </button>
      </li>)}
    </ul>
    {!sessions.length && <p className="agent-sidebar-note">Start a chat to describe a repair or explore an image.</p>}
    <p className="agent-sidebar-note">{product ? "One repair. Its photos, measurements, and every draft." : "Each chat keeps its own conversation and images on this machine."}</p>
    {sample}
    </div>
  </aside>;
}
