import { useId, type ReactNode } from "react";
import { Icon, type IconName } from "../../components/ui/Icon";
import type { HistoryItem } from "./historyTypes";

const statusLabels = { pending: "Ready", in_progress: "In progress", completed: "Done", failed: "Failed" } as const;

/** Shared item chrome; concrete item types and their commands stay in registered views. */
export function InteractionItemFrame({ item, icon, label, expanded, onToggle, children }: {
  item: Exclude<HistoryItem, { type: "message" }>;
  icon: IconName;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <article className="chat-interaction" aria-label={item.title} data-item-type={item.type} data-tool-call-id={item.tool.toolCallId} data-tool-status={item.tool.status}>
      <button type="button" className="chat-interaction-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle}>
        <span className="chat-interaction-icon"><Icon name={icon} size={19} /></span>
        <span className="chat-interaction-name"><span>{label}</span><strong>{item.title}</strong></span>
        <span className="chat-interaction-summary">{item.summary}</span>
        <span className="chat-disclosure"><Icon name="right" size={16} /></span>
      </button>
      <div id={bodyId} hidden={!expanded} className="chat-interaction-body">
        {expanded && <>
          {children}
          <details className="chat-tool-details">
            <summary>Tool details <span>{statusLabels[item.tool.status]}</span></summary>
            <dl><dt>Tool</dt><dd>{item.tool.name}</dd><dt>Call</dt><dd>{item.tool.toolCallId}</dd></dl>
            <p>Input</p><pre>{JSON.stringify(item.tool.rawInput, null, 2) ?? "Not supplied"}</pre>
            <p>Result</p><pre>{JSON.stringify(item.tool.rawOutput, null, 2) ?? "Not supplied"}</pre>
          </details>
        </>}
      </div>
    </article>
  );
}
