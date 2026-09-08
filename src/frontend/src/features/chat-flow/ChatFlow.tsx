import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Card } from "../../components/ui/primitives";
import { AssetView } from "./AssetView";
import { ChatComposer } from "./ChatComposer";
import { ChatHistory } from "./ChatHistory";
import { chatItemRenderer } from "./itemRegistry";
import { sameVersion, snapshotVersion, type ChatFlowFixture, type VersionRef } from "./types";
import { useChatFlow } from "./useChatFlow";

export function ChatFlow({ fixture }: { fixture: ChatFlowFixture }) {
  const flow = useChatFlow(fixture);
  const [inspector, setInspector] = useState<"browse" | "detail" | null>(null);
  const [focusRequest, requestDetailFocus] = useState(0);
  const assetsHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (inspector !== "detail") return;
    // Wait for the shared dialog's modal focus setup, including StrictMode replay.
    const frame = requestAnimationFrame(() => detailHeading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [inspector, focusRequest]);
  function inspect(ref: VersionRef) {
    flow.selectVersion(ref);
    setInspector("detail");
    requestDetailFocus((value) => value + 1);
  }

  return (
    <div className="chat-flow">
      <Card className="chat-surface">
        <ChatHistory items={flow.items} itemRenderer={chatItemRenderer} actions={{
          attachments: flow.attachments, inspect, attach: flow.attach, capture: flow.capture, snapshot: flow.snapshot,
        }} />
        <ChatComposer text={flow.text} attachments={flow.attachments} onTextChange={flow.setText}
          onInspect={inspect} onRemove={flow.removeAttachment} onBrowseAssets={() => setInspector("browse")} onSubmit={flow.submit} />
        <p className="sr-only" role="status" aria-live="polite">{flow.announcement}</p>
      </Card>
      {inspector && (
        <Dialog title="Image versions" description="Choose an image version to attach to your message." wide onClose={() => setInspector(null)}>
          <div className="dialog-body chat-image-dialog">
            <AssetView assets={flow.assets} selection={flow.selection}
              attached={flow.attachments.some((photo) => sameVersion(photo, flow.selection))}
              attachmentCount={flow.attachments.length} onSelect={flow.selectVersion} onInspect={inspect}
              onAttach={() => flow.attach(snapshotVersion(flow.assets, flow.selection))}
              onReturnToInput={() => setInspector(null)} headingRef={assetsHeading} detailHeadingRef={detailHeading} />
          </div>
        </Dialog>
      )}
    </div>
  );
}
