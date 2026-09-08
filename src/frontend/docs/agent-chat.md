# Live agent chat

`/debug/agent` mounts the application component `AgentChat`, backed by the
Python/uv [agent module](../../../agent/README.md). `/debug/chat` remains the
existing local fixture route. Follow the [module specification](../../../docs/M-ACP.md)
and [state contract](../../../docs/ACP-AGENT-STATE.md) for integration boundaries.

The page only composes the feature. `AgentChat` selects sessions and owns drafts;
`AgentConversation` binds a selected session to the shared `ChatHistory`, item
registry, composer, camera, and image components. `useAgentSession` owns snapshot
loading and stream cleanup. `AgentClient` owns HTTP commands and WebSocket
reconnect. `projection.ts` adapts normalized records and immutable image references
into existing domain views. No browser component interprets raw ACP frames.

Mount the same component inside another application page:

```tsx
import { AgentChat } from "./features/agent-chat/AgentChat";
import { AgentClient } from "./features/agent-chat/client";

const client = new AgentClient("/api/agent");
export function RepairConversation() {
  return <AgentChat client={client} />;
}
```

Use a stable client instance. A selected conversation can also mount
`AgentConversation` directly with the session ID, controlled draft, and session
metadata callback. Its current caller keys the component by session ID; switching
sessions therefore disposes the old stream and any camera. Production authentication
belongs in the host API/client boundary, not individual image cards.

Image upload, paste, drop, and explicit camera capture all create backend assets.
Attachments select immutable versions. Sending snapshots their references and
uses an idempotency key retained across uncertain HTTP retries while the draft
is unchanged. Drafts survive session switches in this mount; submitted history
and assets survive refresh. Unsent drafts are not persisted across page reload.
During a turn the user can edit the next draft or press Stop. Queueing multiple
turns is not implemented.

Click a composer thumbnail to annotate that image directly. `DraftImageEditor`
reuses the shared drawing editor with a **Save image** action, without an image
inventory. Save replaces the draft preview and retains editable history; opening
it again supports Undo/Redo. `useDraftPhotos` owns preview URLs and revokes them on
replacement or unmount. Send uploads selected edited PNGs before dispatching
immutable image references, retaining the same upload and command on retry.
The source blob and drawing history remain browser draft state; the backend
currently stores flattened images. Earlier message attachments cannot change.

The backend snapshot supplies a cursor; reconnect continues after the last event,
without reloading or spawning ACP. Typed image and camera results reuse existing
components. Unknown tools retain expandable details. Local tool titles are
shortened in the conversation while the original record remains inspectable.
Text events update the same visible message as they arrive, with a writing
indicator and blinking inline cursor until that segment ends. The live route uses
the available page width.
Adapter-provided thought records use compact **Thinking** disclosures, separate
from assistant reply records. They expand while streaming unless the user closes
them, and remain available after a reload. `ChatMarkdown` uses
[`react-markdown`](https://github.com/remarkjs/react-markdown) with `remark-gfm`
for messages and thoughts, without enabling raw HTML. `AgentActivity` shows
animated dots while the turn runs, including before its first output; permission
waits have a distinct label. Pending/running tools show a spinner and waiting or
working status in their own card; native image generation says **Generating
image…** until the tool finishes. Published image cards show **Loading preview…**
until the browser loads the image, and report a preview error only if loading
fails. Progress is indeterminate; the adapter supplies no percentage.
Reduced-motion settings disable the dots and keep the cursor steadily visible.
**Open camera** requests browser permission and starts the floating camera in one
action. `ChatCamera` owns that widget outside individual disclosures, while
`CameraWidget` reuses `useCamera` and `CameraView`. Card collapse minimizes it;
Capture stays available and resizing preserves the same video element and stream.
Drag the handle or use its arrow keys; resize keeps it inside the viewport.
Close/Stop, navigation, request removal, and session switch release tracks,
including a permission response that arrives after closing. Reopening stored
history never starts the camera. Disclosure animations release other item bodies
when their height/fade exit animations finish, with collapsed content inert
immediately. Reversing a collapse retains its content; reduced motion releases it
immediately. Expansion, collapse, and the disclosure arrow share the same easing.

For a sample MCP inspection, send `Call crafty_images.list_images.`, expand
**List chat images**, and open **Tool details**. Use
`Call crafty_images.request_camera.` to inspect an interactive camera result.

Run the backend with `make agent-dev` and frontend with `make mf` from the root.
Vite proxies HTTP and WebSocket `/api/agent` to localhost:8787, configurable with
`CRAFTY_AGENT_URL`. Browser tests explicitly fake that application API:

```sh
npm test -- tests/agent-chat.spec.ts tests/chat-flow.spec.ts tests/chat-flow-projection.spec.ts
```

These tests prove UI/state integration and camera cleanup. Actual Codex image
input, native image generation, MCP publication, download digests, and native
session recovery are recorded separately in the module's live acceptance.
