/** Remains visible while the runtime works, including before its first text chunk. */
export function AgentActivity({ status }: { status: string | null | undefined }) {
  const waiting = status === "waiting_permission";
  return <div className="agent-activity" role="status" aria-live="polite">
    {!waiting && <span className="agent-working-dots" aria-hidden="true"><i /><i /><i /></span>}
    <span>{waiting ? "Waiting for your approval" : status === "cancelling" ? "Stopping Codex…" : "Codex is working…"}</span>
  </div>;
}
