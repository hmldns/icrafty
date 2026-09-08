import type { AgentEvent, AgentImage, AgentSession, AgentSnapshot } from "./types";

/** Application transport only; no ACP/App Server wire parsing in browser components. */
export class AgentClient {
  constructor(readonly base = "/api/agent") {}

  async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(this.base + path, { ...options, signal: options?.signal ?? AbortSignal.timeout(120_000) });
    let value;
    try { value = await response.json(); } catch { throw new Error("Agent service is unavailable. Start the local agent backend and retry."); }
    if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : `Request failed (${response.status})`);
    return value as T;
  }

  list = () => this.request<{ sessions: AgentSession[] }>("/sessions");
  create = () => this.request<AgentSnapshot>("/sessions", { method: "POST" });
  snapshot = (id: string) => this.request<AgentSnapshot>(`/sessions/${id}`);
  open = (id: string) => this.request<AgentSnapshot>(`/sessions/${id}/open`, { method: "POST" });
  stop = (id: string) => this.request<AgentSnapshot>(`/sessions/${id}/stop`, { method: "POST" });
  cancel = (id: string) => this.request<AgentSnapshot>(`/sessions/${id}/cancel`, { method: "POST" });
  cancelCad = (id: string, operationId: string) => this.request(`/sessions/${id}/cad/operations/${encodeURIComponent(operationId)}/cancel`, { method: "POST" });

  send(id: string, clientMessageId: string, text: string, imageIds: string[]) {
    return this.request(`/sessions/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId, text, imageIds }) });
  }
  upload(id: string, file: Blob, title: string) {
    return this.request<AgentImage>(`/sessions/${id}/images?title=${encodeURIComponent(title)}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file,
    });
  }
  capture(id: string, callId: string, assetId: string) {
    return this.request<AgentSnapshot>(`/sessions/${id}/captures/${encodeURIComponent(callId)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId }),
    });
  }
  answerMeasurements(id: string, requestId: string, clientMessageId: string, answers: Record<string, string>) {
    return this.request(`/sessions/${id}/measurements/${encodeURIComponent(requestId)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientMessageId, answers }),
    });
  }
  permission(id: string, permissionId: string, optionId: string | null) {
    return this.request(`/sessions/${id}/permissions/${permissionId}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optionId }),
    });
  }

  subscribe(id: string, initialCursor: number, onEvent: (event: AgentEvent) => void, onConnection: (connected: boolean) => void) {
    let stopped = false;
    let cursor = initialCursor;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (stopped) return;
      const url = new URL(this.base + `/sessions/${id}/events?after=${cursor}`, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      socket.onopen = () => { if (!stopped) onConnection(true); };
      socket.onmessage = (message) => {
        if (stopped) return;
        try {
          const event = JSON.parse(message.data) as AgentEvent;
          if (typeof event.seq !== "number" || event.seq <= cursor || !["session", "record", "asset", "interaction"].includes(event.kind)) return;
          onEvent(event);
          cursor = event.seq;
        } catch { socket?.close(); }
      };
      socket.onclose = () => {
        if (!stopped) { onConnection(false); retry = setTimeout(connect, 1000); }
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => { stopped = true; clearTimeout(retry); socket?.close(); };
  }
}

export const agentClient = new AgentClient();
