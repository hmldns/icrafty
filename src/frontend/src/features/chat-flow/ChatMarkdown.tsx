import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Shared Markdown rendering for streaming replies and adapter-provided thoughts. */
export function ChatMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return <div className="chat-markdown">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml
      components={{ table: props => <div className="chat-markdown-table"><table>{props.children}</table></div> }}>
      {text}
    </Markdown>
    {streaming && <span className="chat-streaming-caret" aria-hidden="true" />}
  </div>;
}
