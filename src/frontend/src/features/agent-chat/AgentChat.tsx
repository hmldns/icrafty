import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Notice } from "../../components/ui/primitives";
import { AgentConversation } from "./AgentConversation";
import { agentClient, type AgentClient } from "./client";
import { SessionSidebar } from "./SessionSidebar";
import type { AgentDraft, AgentSession } from "./types";

const emptyDraft: AgentDraft = { text: "", imageIds: [] };

export function AgentChat({ client = agentClient }: { client?: AgentClient }) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const selectionKey = `crafty:agent:selected:${client.base}`;
  const [selected, setSelected] = useState<string | null>(() => {
    try { return localStorage.getItem(selectionKey); } catch { return null; }
  });
  const [drafts, setDrafts] = useState<Record<string, AgentDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const updateSession = useCallback((session: AgentSession) => setSessions(current =>
    [...current.filter(item => item.id !== session.id), session].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))), []);
  const refresh = useCallback(async () => {
    try {
      const result = await client.list();
      setSessions(result.sessions); setError(null);
      setSelected(current => current && result.sessions.some(item => item.id === current) ? current : result.sessions[0]?.id ?? null);
    } catch (error) { setError(error instanceof Error ? error.message : "Agent service unavailable"); }
  }, [client]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    try { if (selected) localStorage.setItem(selectionKey, selected); } catch { /* Storage can be disabled. */ }
  }, [selected, selectionKey]);
  async function create() {
    setCreating(true); setError(null);
    try { const snapshot = await client.create(); updateSession(snapshot.session); setSelected(snapshot.session.id); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setCreating(false); }
  }
  return <>
    {error && <Notice tone="error" title="Agent connection" action={<Button size="small" onClick={() => void refresh()}>Retry</Button>}>{error}</Notice>}
    <div className="agent-chat">
      <SessionSidebar sessions={sessions} selected={selected} creating={creating} onCreate={() => void create()} onSelect={setSelected} onRefresh={() => void refresh()} />
      {selected ? <AgentConversation key={selected} client={client} id={selected} draft={drafts[selected] ?? emptyDraft} onSessionChange={updateSession}
        onDraftChange={change => setDrafts(current => ({ ...current, [selected]: change(current[selected] ?? emptyDraft) }))} />
        : <Card className="agent-start"><EmptyState title="Your next idea starts here" icon="text"
          action={<Button variant="primary" disabled={creating} onClick={() => void create()}>{creating ? "Starting Codex…" : "Start a chat"}</Button>}>
          Create a Codex conversation, share an image, and explore a new draft together.
        </EmptyState></Card>}
    </div>
  </>;
}
