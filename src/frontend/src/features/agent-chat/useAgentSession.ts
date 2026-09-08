import { useCallback, useEffect, useState } from "react";
import type { AgentClient } from "./client";
import { applyAgentEvent } from "./projection";
import type { AgentSnapshot } from "./types";

export function useAgentSession(client: AgentClient, id: string) {
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;
    setSnapshot(null);
    setError(null);
    void client.snapshot(id).then(value => {
      if (!live) return;
      setSnapshot(value);
      unsubscribe = client.subscribe(id, value.cursor,
        event => { if (live) setSnapshot(current => current && applyAgentEvent(current, event)); },
        value => { if (live) setConnected(value); });
    }).catch(reason => { if (live) setError(String(reason.message ?? reason)); });
    return () => { live = false; unsubscribe?.(); };
  }, [client, id, revision]);
  const reload = useCallback(() => refresh(value => value + 1), []);
  return { snapshot, error, setError, connected, reload };
}
