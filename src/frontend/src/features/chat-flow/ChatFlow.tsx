import { useEffect, useRef, useState } from "react";
import { Badge, Card } from "../../components/ui/primitives";
import { AssetView } from "./AssetView";
import { ChatComposer } from "./ChatComposer";
import { ChatHistory } from "./ChatHistory";
import { sameVersion, type ChatFlowFixture, type VersionRef } from "./types";
import { useChatFlow } from "./useChatFlow";

/** Fixture in; local rehearsal inside. No camera, storage, or transport dependencies. */
export function ChatFlow({ fixture }: { fixture: ChatFlowFixture }) {
  const flow = useChatFlow(fixture);
  const assetsHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const [focusRequest, setFocusRequest] = useState<{
    target: "assets" | "detail";
  } | null>(null);

  useEffect(() => {
    if (!focusRequest) return;
    const element = focusRequest.target === "assets"
      ? assetsHeading.current
      : detailHeading.current;
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: "nearest" });
  }, [focusRequest]);

  function inspect(ref: VersionRef) {
    flow.selectVersion(ref);
    setFocusRequest({ target: "detail" });
  }

  return (
    <div className="chat-flow">
      <div className="chat-project-heading">
        <div>
          <p className="eyebrow">One repair / fixture story</p>
          <h2>{fixture.title}</h2>
        </div>
        <Badge tone="accent">Local mock</Badge>
      </div>
      <div className="chat-flow-layout">
        <Card className="chat-conversation">
          <ChatHistory entries={flow.history} onInspect={inspect} />
          <ChatComposer
            text={flow.text}
            attachments={flow.attachments}
            onTextChange={flow.setText}
            onInspect={inspect}
            onRemove={flow.removeAttachment}
            onBrowseAssets={() => setFocusRequest({ target: "assets" })}
            onSubmit={flow.submit}
          />
          <p className="chat-status" role="status" aria-live="polite">
            {flow.announcement}
          </p>
        </Card>
        <AssetView
          assets={fixture.assets}
          selection={flow.selection}
          attached={flow.attachments.some((photo) =>
            sameVersion(photo, flow.selection),
          )}
          attachmentCount={flow.attachments.length}
          onSelect={flow.selectVersion}
          onInspect={inspect}
          onAttach={flow.attachSelection}
          headingRef={assetsHeading}
          detailHeadingRef={detailHeading}
        />
      </div>
    </div>
  );
}
