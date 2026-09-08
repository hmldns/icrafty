import { Badge } from "../components/ui/primitives";
import { AgentChat } from "../features/agent-chat/AgentChat";

export function AgentDebugPage() {
  return <div className="agent-page">
    <header className="chat-page-intro"><div><p className="eyebrow">The next draft</p><h1>A conversation that makes things.</h1></div>
      <div className="chat-preview-note"><Badge tone="success">Live Codex</Badge><p>Saved chats · images · tools</p></div></header>
    <AgentChat />
  </div>;
}
