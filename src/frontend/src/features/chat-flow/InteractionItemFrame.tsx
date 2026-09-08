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
  const tool = "tool" in item ? item.tool : null;
  return (
    <article className="chat-interaction" aria-label={item.title} data-item-type={item.type} data-tool-call-id={tool?.toolCallId} data-tool-status={tool?.status}
      data-streaming={item.type === "thought" && item.streaming || undefined}>
      <button type="button" className="chat-interaction-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle}>
        <span className="chat-interaction-icon">{item.type === "thought" && item.streaming
          ? <span className="spinner" aria-hidden="true" /> : <Icon name={icon} size={16} />}</span>
        <span className="chat-interaction-name"><span className="sr-only">{label}</span><strong>{item.title}</strong></span>
        <span className="chat-interaction-summary">{item.summary}</span>
        <span className="chat-disclosure"><Icon name="right" size={16} /></span>
      </button>
      <div id={bodyId} hidden={!expanded} className="chat-interaction-body">
        {expanded && <>
          {children}
          {tool && <details className="chat-tool-details">
            <summary>Tool details <span>{statusLabels[tool.status]}</span></summary>
            <dl><dt>Tool</dt><dd>{tool.name}</dd><dt>Call</dt><dd>{tool.toolCallId}</dd></dl>
            <p>Input</p><pre>{JSON.stringify(tool.rawInput, null, 2) ?? "Not supplied"}</pre>
            <p>Result</p><pre>{JSON.stringify(tool.rawOutput, null, 2) ?? "Not supplied"}</pre>
          </details>}
        </>}
      </div>
    </article>
  );
}
