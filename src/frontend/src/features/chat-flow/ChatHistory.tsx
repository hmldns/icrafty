import { useEffect, useRef } from "react";
import { Badge } from "../../components/ui/primitives";
import { CameraRunCard } from "./CameraRunCard";
import { PhotoStrip } from "./PhotoStrip";
import type { HistoryEntry, VersionRef } from "./types";

export function ChatHistory({
  entries,
  onInspect,
}: {
  entries: readonly HistoryEntry[];
  onInspect: (ref: VersionRef) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const latest = entries.at(-1);
    if (latest?.kind === "message" && latest.origin === "local" && list.current) {
      list.current.scrollTop = list.current.scrollHeight;
    }
  }, [entries]);
  return (
    <section className="chat-history" aria-labelledby="chat-history-title">
      <div className="section-heading">
        <div>
          <h2 id="chat-history-title">The conversation</h2>
          <p>A few observations, kept in order.</p>
        </div>
        <Badge>{entries.length} entries</Badge>
      </div>
      <ol
        ref={list}
        tabIndex={0}
        className="chat-history-list"
        aria-label="Chat history"
      >
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.kind === "camera-run" ? (
              <CameraRunCard run={entry} onInspect={onInspect} />
            ) : (
              <article
                className={`chat-message chat-message--${entry.author}`}
                aria-label={`${entry.origin === "local" ? "Local mock" : "Fixture"} input from ${entry.author === "you" ? "you" : "icrafty"}`}
              >
                <div className="chat-message-heading">
                  <span className="chat-avatar" aria-hidden="true">
                    {entry.author === "you" ? "Y" : "c"}
                  </span>
                  <strong>{entry.author === "you" ? "You" : "icrafty"}</strong>
                  <span>
                    {entry.origin === "local" ? "Local mock input" : "Fixture"}
                  </span>
                </div>
                {entry.text && <p className="chat-message-text">{entry.text}</p>}
                {entry.attachments.length > 0 && (
                  <>
                    <PhotoStrip
                      photos={entry.attachments}
                      label="Submitted image versions"
                      onInspect={onInspect}
                    />
                    <p className="chat-fixture-note">
                      Attached versions stay with this input.
                    </p>
                  </>
                )}
              </article>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
