import { Badge } from "../components/ui/primitives";
import { WorkspaceHeader } from "../components/ui/WorkspaceHeader";
import { ChatFlow } from "../features/chat-flow/ChatFlow";
import { mugCapFixture } from "../features/chat-flow/fixtures";

export function ChatDebugPage() {
  return (
    <div className="chat-page debug-workspace">
      <WorkspaceHeader
        title={mugCapFixture.title}
        context={<Badge tone="accent">Local mock</Badge>}
      >
        <p>
          Mug cap repair · sample conversation. The conversation resets on
          refresh. Images and annotations stay in this browser. This mock does
          not contact an agent.
        </p>
      </WorkspaceHeader>
      <ChatFlow fixture={mugCapFixture} />
    </div>
  );
}
