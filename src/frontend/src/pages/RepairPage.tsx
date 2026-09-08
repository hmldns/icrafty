import { AgentChat } from "../features/agent-chat/AgentChat";

export function RepairPage() {
  return <div className="repair-page">
    <h1 className="sr-only">Your repair workspace</h1>
    <AgentChat product />
  </div>;
}
