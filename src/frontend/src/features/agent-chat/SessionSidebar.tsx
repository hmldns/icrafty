import { Button, cx } from "../../components/ui/primitives";
import type { AgentSession } from "./types";

export function SessionSidebar({ sessions, selected, creating, onCreate, onSelect, onRefresh, product = false, sample }: {
  sessions: AgentSession[]; selected: string | null; creating: boolean;
  onCreate: () => void; onSelect: (id: string) => void; onRefresh: () => void;
  product?: boolean; sample?: ReactNode;
}) {
  return <aside className="agent-sidebar" aria-label={product ? "Repairs" : "Chats"}>
    <div className="agent-sidebar-heading"><h2>{product ? "Your repairs" : "Your chats"}</h2><Button size="small" variant="ghost" onClick={onRefresh}>Refresh</Button></div>
    <Button variant="primary" icon="plus" disabled={creating} onClick={onCreate}>{creating ? "Starting…" : product ? "New repair" : "New chat"}</Button>
    <ul className="agent-session-list">
      {sessions.map(session => <li key={session.id}>
        <button type="button" className={cx("agent-session", selected === session.id && "agent-session--selected")}
          aria-pressed={selected === session.id} disabled={creating} onClick={() => onSelect(session.id)}>
          <strong>{session.title}</strong>
          <span>{session.activeTurnId ? "Working" : session.runtime === "ready" ? "Ready" : session.runtime === "failed" ? "Needs attention" : "Saved"}
            <span aria-hidden="true"> · </span><time dateTime={session.updatedAt}>{new Date(session.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></span>
        </button>
      </li>)}
    </ul>
    {!sessions.length && <p className="agent-sidebar-note">Start a chat to describe a repair or explore an image.</p>}
    <p className="agent-sidebar-note">{product ? "One repair. Its photos, measurements, and every draft." : "Each chat keeps its own conversation and images on this machine."}</p>
    {sample}
  </aside>;
}
import type { ReactNode } from "react";
