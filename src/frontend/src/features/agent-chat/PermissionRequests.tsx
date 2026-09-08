import { Button } from "../../components/ui/primitives";
import type { AgentPermission } from "./types";

export function PermissionRequests({ requests, onAnswer }: { requests: AgentPermission[]; onAnswer: (id: string, option: string | null) => void }) {
  return <>{requests.map(request => <section key={request.id} className="agent-permission" aria-label="Agent permission request">
    <strong>Codex needs your permission</strong>
    <p>{request.toolCall.title ?? "Review the requested action"}</p>
    {request.toolCall.rawInput != null && <details><summary>Action details</summary><pre>{JSON.stringify(request.toolCall.rawInput, null, 2)}</pre></details>}
    <div className="row">{request.options.map(option => <Button key={option.optionId} size="small"
      variant={option.kind.startsWith("reject") ? "secondary" : "primary"} onClick={() => onAnswer(request.id, option.optionId)}>{option.name}</Button>)}
      <Button size="small" variant="ghost" onClick={() => onAnswer(request.id, null)}>Cancel request</Button></div>
  </section>)}</>;
}
