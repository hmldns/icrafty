import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, LoadingState, Notice } from "../../components/ui/primitives";
import { ChatComposer } from "../chat-flow/ChatComposer";
import { ChatHistory } from "../chat-flow/ChatHistory";
import { chatItemRenderer } from "../chat-flow/itemRegistry";
import type { ItemActions } from "../chat-flow/ItemRendererRegistry";
import type { AgentClient } from "./client";
import { DraftImageEditor } from "./DraftImageEditor";
import { ImageLibrary } from "./ImageLibrary";
import { PermissionRequests } from "./PermissionRequests";
import { projectAgentSnapshot } from "./projection";
import type { AgentDraft, AgentImage, AgentSession } from "./types";
import { useAgentSession } from "./useAgentSession";
import { useDraftPhotos } from "./useDraftPhotos";
import { AgentActivity } from "./AgentActivity";

/** Real application component. The route supplies the client and selected session. */
export function AgentConversation({ client, id, draft, onDraftChange, onSessionChange, product = false }: {
  client: AgentClient; id: string; draft: AgentDraft;
  product?: boolean;
  onDraftChange: (change: (draft: AgentDraft) => AgentDraft) => void;
  onSessionChange: (session: AgentSession) => void;
}) {
  const flow = useAgentSession(client, id);
  const [library, setLibrary] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<AgentImage | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [controlling, setControlling] = useState(false);
  const submission = useRef<{ input: string; id: string } | null>(null);
  const publishedEdits = useRef(new Map<string, string>());
  const state = flow.snapshot?.session;
  useEffect(() => { if (state) onSessionChange(state); }, [state, onSessionChange]);
  const items = useMemo(() => flow.snapshot ? projectAgentSnapshot(flow.snapshot) : [], [flow.snapshot]);
  const images = flow.snapshot?.assets ?? [];
  const photos = useDraftPhotos(images, draft);
  const busy = !!state?.activeTurnId;

  const attach = (image: AgentImage) => onDraftChange(current => ({ ...current,
    imageIds: current.imageIds.includes(image.id) ? current.imageIds : [...current.imageIds, image.id].slice(0, 8) }));
  async function upload(files: File[]) {
    setUploading(true); flow.setError(null);
    try {
      for (const file of files.slice(0, 8)) attach(await client.upload(id, file, file.name));
    } catch (error) { flow.setError(error instanceof Error ? error.message : String(error)); }
    finally { setUploading(false); }
  }
  async function send() {
    if (sending || busy || uploading || editingImage) return;
    const submitted = { ...draft, imageIds: [...draft.imageIds] };
    const input = JSON.stringify(submitted);
    const prepared = submitted.submission;
    const preparedMatches = prepared && prepared.text === submitted.text && !Object.keys(submitted.edits ?? {}).length
      && JSON.stringify(prepared.imageIds) === JSON.stringify(submitted.imageIds);
    if (submission.current?.input !== input) submission.current = { input, id: preparedMatches ? prepared.id : crypto.randomUUID() };
    setSending(true); flow.setError(null);
    try {
      const imageIds: string[] = [];
      for (const imageId of submitted.imageIds) {
        const edit = submitted.edits?.[imageId];
        if (!edit) { imageIds.push(imageId); continue; }
        let assetId = publishedEdits.current.get(edit.id);
        if (!assetId) {
          const asset = await client.upload(id, edit.png, edit.source.name);
          assetId = asset.id;
          publishedEdits.current.set(edit.id, assetId);
        }
        imageIds.push(assetId);
      }
      await client.send(id, submission.current.id, submitted.text, imageIds);
      onDraftChange(current => JSON.stringify(current) === input ? { text: "", imageIds: [] } : current);
      submission.current = null;
    } catch (error) { flow.setError(error instanceof Error ? error.message : String(error)); }
    finally { setSending(false); }
  }
  async function control(action: () => Promise<unknown>, reload = false) {
    setControlling(true); flow.setError(null);
    try { await action(); if (reload) flow.reload(); }
    catch (error) { flow.setError(error instanceof Error ? error.message : String(error)); }
    finally { setControlling(false); }
  }
  const actions: ItemActions = {
    attachments: photos,
    measurementsBusy: busy || sending || controlling,
    answerMeasurements: async (requestId, commandId, answers) => { await client.answerMeasurements(id, requestId, commandId, answers); },
    inspect: ref => { setSelectedImage(ref.assetId); setLibrary(true); },
    attach: photo => { const image = images.find(item => item.id === photo.assetId); if (image) attach(image); },
    capture: async (item, image) => {
      try {
        const asset = await client.upload(id, image.blob, image.name);
        await client.capture(id, item.tool.toolCallId, asset.id);
        attach(asset);
      } catch (error) { flow.setError(error instanceof Error ? error.message : String(error)); throw error; }
    },
    snapshot: async () => { flow.setError("CAD model publication is a later integration."); },
  };
  if (!flow.snapshot) return <Card className="agent-conversation">{flow.error
    ? <Notice tone="error" title="Could not open chat" action={<Button onClick={flow.reload}>Retry</Button>}>{flow.error}</Notice>
    : <LoadingState>Opening saved chat…</LoadingState>}</Card>;
  return <div className="agent-conversation" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
    onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); void upload([...event.dataTransfer.files]); } }}>
    <div className="agent-conversation-heading">
      <div><h2>{state?.title}</h2><p>{product ? "Photos, measurements, and each new draft stay together." : <>{state?.model ?? "Codex"} <span aria-hidden="true">·</span> {flow.connected ? "Connected" : "Reconnecting…"}</>}</p></div>
      <div className="row"><Badge tone={busy ? "accent" : "neutral"}>{busy ? state?.turnStatus === "waiting_permission" ? "Awaiting permission" : "Working" : state?.runtime === "ready" ? "Ready" : "Saved"}</Badge>
        {!product && (state?.runtime !== "ready" ? <Button size="small" disabled={controlling} onClick={() => void control(() => client.open(id))}>Resume chat</Button>
          : <Button size="small" variant="ghost" disabled={busy || controlling} onClick={() => void control(() => client.stop(id))}>Suspend</Button>)}</div>
    </div>
    {(flow.error || state?.error) && <Notice tone="error">{flow.error || state?.error}</Notice>}
    {state?.turnStatus === "interrupted" && !state.error && <Notice>The previous turn was interrupted. Send a new message to continue.</Notice>}
    <PermissionRequests requests={state?.permissions ?? []} onAnswer={(pid, option) => void control(() => client.permission(id, pid, option))} />
    <Card className="chat-surface">
      {items.length === 0 && <div className="agent-welcome"><p className="eyebrow">A fresh conversation</p><h3>Show it. Describe it. Make a draft.</h3>
        <p>{product ? "Show the part you want to fix. We’ll work out the shape and measurements together." : "Attach a photo or ask Codex for an image. Generated images become part of this chat."}</p>
        <div className="row"><Button size="small" onClick={() => setLibrary(true)}>Add a photo</Button><Button size="small" variant="ghost"
          onClick={() => onDraftChange(current => ({ ...current, text: "Generate a simple concept sketch of a replacement mug cap and publish the image here." }))}>Start with a cap sketch</Button></div></div>}
      <ChatHistory items={items} itemRenderer={chatItemRenderer} actions={actions} />
      {busy && <AgentActivity status={state?.turnStatus} />}
      <ChatComposer text={draft.text} attachments={photos} disabled={busy || sending || uploading || controlling || !!editingImage}
        hint={busy ? "You can prepare your next message while we work" : uploading ? "Saving images…" : product ? "Share a photo, a measurement, or an idea · Shift + Enter for a new line" : "Images are sent to Codex · Shift + Enter for a new line"}
        onTextChange={text => onDraftChange(current => ({ ...current, text }))}
        attachmentActionLabel="Annotate"
        onInspect={ref => { const image = images.find(item => item.id === ref.assetId); if (image) setEditingImage(image); }}
        onRemove={ref => onDraftChange(current => {
          const edits = { ...current.edits }; delete edits[ref.assetId];
          return { ...current, edits, imageIds: current.imageIds.filter(id => id !== ref.assetId) };
        })}
        onBrowseAssets={() => setLibrary(true)} onSubmit={() => void send()} onPasteImages={files => void upload(files)}
        onCancel={busy && !controlling ? () => void control(() => client.cancel(id)) : undefined} />
    </Card>
    {editingImage && <DraftImageEditor key={editingImage.id} image={editingImage} edit={draft.edits?.[editingImage.id]}
      onClose={() => setEditingImage(null)} onSave={edit => onDraftChange(current => ({ ...current,
        edits: { ...current.edits, [editingImage.id]: edit } }))} />}
    {library && <ImageLibrary images={images} selected={selectedImage} attached={draft.imageIds} uploading={uploading}
      onSelect={setSelectedImage} onAttach={attach} onUpload={files => void upload(files)} onClose={() => setLibrary(false)} />}
  </div>;
}
