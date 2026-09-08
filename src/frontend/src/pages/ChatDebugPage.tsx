import { Badge } from "../components/ui/primitives";
import { ChatFlow } from "../features/chat-flow/ChatFlow";
import { mugCapFixture } from "../features/chat-flow/fixtures";

export function ChatDebugPage() {
  return (
    <div className="chat-page">
      <header className="chat-page-intro">
        <div><p className="eyebrow">Mug cap repair</p><h1>{mugCapFixture.title}</h1></div>
        <div className="chat-preview-note"><Badge tone="accent">Local mock</Badge><p>Sample conversation · resets on refresh</p></div>
      </header>
      <ChatFlow fixture={mugCapFixture} />
    </div>
  );
}
