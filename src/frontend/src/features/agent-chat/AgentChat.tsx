import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, LoadingState, Notice } from "../../components/ui/primitives";
import { AgentConversation } from "./AgentConversation";
import { agentClient, type AgentClient } from "./client";
import { SessionSidebar } from "./SessionSidebar";
import type { AgentDraft, AgentSession } from "./types";
import { RepairSampleCard, type RepairSample } from "./RepairSample";

const emptyDraft: AgentDraft = { text: "", imageIds: [] };

export function AgentChat({ client = agentClient, product = false }: { client?: AgentClient; product?: boolean }) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const selectionKey = `crafty:agent:selected:${client.base}`;
  const [selected, setSelected] = useState<string | null>(() => {
    try { return localStorage.getItem(selectionKey); } catch { return null; }
  });
  const [drafts, setDrafts] = useState<Record<string, AgentDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sample, setSample] = useState<RepairSample | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
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
    if (!product) return;
    let disposed = false;
    void client.request<{ samples: RepairSample[] }>("/samples").then(result => {
      if (!disposed) setSample(result.samples[0] ?? null);
    }).catch(() => { /* The main connection notice provides retry if the service is down. */ });
    return () => { disposed = true; };
  }, [client, product]);
  useEffect(() => {
    try { if (selected) localStorage.setItem(selectionKey, selected); } catch { /* Storage can be disabled. */ }
  }, [selected, selectionKey]);
  async function create() {
    setCreating(true); setError(null);
    try { const snapshot = await client.create(); updateSession(snapshot.session); setSelected(snapshot.session.id); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setCreating(false); }
  }
  async function startSample(sample: RepairSample) {
    setCreating(true); setPreparing("Preparing the mug photos…"); setError(null);
    let repairId: string | null = null;
    const imageIds: string[] = [];
    const commandId = crypto.randomUUID();
    const preparedDraft = () => ({ text: sample.prompt, imageIds: [...imageIds], submission: { id: commandId, text: sample.prompt, imageIds: [...imageIds] } });
    try {
      const files = await Promise.all(sample.photos.map(async photo => {
        const response = await fetch(photo.url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error("Could not load the sample photos. Please retry.");
        return { photo, blob: await response.blob() };
      }));
      const snapshot = await client.create();
      repairId = snapshot.session.id;
      updateSession(snapshot.session); setSelected(repairId);
      setPreparing("Adding the photos to your repair…");
      for (const { photo, blob } of files) imageIds.push((await client.upload(repairId, blob, photo.title)).id);
      setDrafts(current => ({ ...current, [repairId!]: preparedDraft() }));
      setPreparing("Opening the conversation…");
      await client.send(repairId, commandId, sample.prompt, imageIds);
      setDrafts(current => ({ ...current, [repairId!]: emptyDraft }));
    } catch (error) {
      if (repairId) setDrafts(current => ({ ...current, [repairId!]: preparedDraft() }));
      setError(error instanceof Error ? error.message : "Could not open the sample repair");
    } finally { setCreating(false); setPreparing(null); }
  }
  return <>
    {error && <Notice tone="error" title="Agent connection" action={<Button size="small" onClick={() => void refresh()}>Retry</Button>}>{error}</Notice>}
    <div className="agent-chat">
      <SessionSidebar sessions={sessions} selected={selected} creating={creating} product={product} onCreate={() => void create()} onSelect={setSelected} onRefresh={() => void refresh()}
        sample={sample && <RepairSampleCard sample={sample} disabled={creating} onStart={() => void startSample(sample)} />} />
      {preparing ? <Card className="agent-start"><LoadingState>{preparing}</LoadingState></Card> : selected ? <AgentConversation key={selected} client={client} id={selected} product={product} draft={drafts[selected] ?? emptyDraft} onSessionChange={updateSession}
        onDraftChange={change => setDrafts(current => ({ ...current, [selected]: change(current[selected] ?? emptyDraft) }))} />
        : <Card className="agent-start"><EmptyState title="Your next idea starts here" icon="text"
          action={<Button variant="primary" disabled={creating} onClick={() => void create()}>{creating ? "Starting…" : product ? "Start a repair" : "Start a chat"}</Button>}>
          {product ? "Show us what needs fixing. A photo and a few measurements are a good place to begin." : "Create a Codex conversation, share an image, and explore a new draft together."}
        </EmptyState></Card>}
    </div>
  </>;
}
