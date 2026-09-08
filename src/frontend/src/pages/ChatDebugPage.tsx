import { Icon } from "../components/ui/Icon";
import { ChatFlow } from "../features/chat-flow/ChatFlow";
import { mugCapFixture } from "../features/chat-flow/fixtures";

export function ChatDebugPage() {
  return (
    <div className="chat-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow">04 / Gather the story</p>
          <h1>A little more context.</h1>
          <p>Choose a view. Keep the version. Add it to the conversation.</p>
        </div>
        <div className="local-note">
          <Icon name="info" size={18} />
          <p>
            <strong>A local chat mock</strong>Fixed illustrative assets and sample
            history. Inputs last until you leave or refresh.
          </p>
        </div>
      </header>
      <ChatFlow fixture={mugCapFixture} />
    </div>
  );
}
