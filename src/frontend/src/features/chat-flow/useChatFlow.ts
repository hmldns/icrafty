import { useState } from "react";
import {
  sameVersion,
  snapshotVersion,
  type ChatFlowFixture,
  type HistoryEntry,
  type MessageEntry,
  type PhotoAttachment,
  type VersionRef,
} from "./types";

/** State belongs to this rehearsal and is discarded when the surface unmounts. */
export function useChatFlow(fixture: ChatFlowFixture) {
  const [selection, selectVersion] = useState(fixture.initialSelection);
  const [history, setHistory] = useState<readonly HistoryEntry[]>(fixture.history);
  const [attachments, setAttachments] = useState<readonly PhotoAttachment[]>([]);
  const [text, setText] = useState("");
  const [announcement, setAnnouncement] = useState("");

  function attachSelection() {
    const attachment = snapshotVersion(fixture.assets, selection);
    setAttachments((current) =>
      current.some((item) => sameVersion(item, attachment))
        ? current
        : [...current, attachment],
    );
    setAnnouncement(
      `${attachment.assetTitle}, v${attachment.versionNumber} attached. Ready in the composer.`,
    );
  }

  function removeAttachment(ref: VersionRef) {
    setAttachments((current) => current.filter((item) => !sameVersion(item, ref)));
    setAnnouncement("Attachment removed from the composer.");
  }

  function submit() {
    if (!text.trim() && attachments.length === 0) return;
    // Copy the chosen display values at submission; later browsing cannot retarget them.
    const input: MessageEntry = {
      kind: "message",
      id: `local-${crypto.randomUUID()}`,
      author: "you",
      origin: "local",
      text: text.trim(),
      attachments: attachments.map((attachment) => ({ ...attachment })),
    };
    setHistory((current) => [...current, input]);
    setAttachments([]);
    setText("");
    setAnnouncement(
      "Mock input added to the history. Its image versions are fixed.",
    );
  }

  return {
    selection,
    selectVersion,
    history,
    attachments,
    text,
    setText,
    announcement,
    attachSelection,
    removeAttachment,
    submit,
  };
}
