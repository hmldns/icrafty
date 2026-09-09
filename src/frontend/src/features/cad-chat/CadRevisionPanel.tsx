import { lazy, Suspense, useId, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Icon } from "../../components/ui/Icon";
import { Badge, Button } from "../../components/ui/primitives";
import type { ItemActions } from "../chat-flow/ItemRendererRegistry";
import type { ModelSnapshot } from "../models/types";
import { revisionAvailability, type CadRevision } from "./revisions";

const InlineModelPreview = lazy(() => import("../chat-flow/items/InlineModelPreview").then(module => ({ default: module.InlineModelPreview })));

export function CadRevisionPanel({ revisions, actions, onShowHistory }: {
  revisions: readonly CadRevision[];
  actions: ItemActions;
  onShowHistory: (itemId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(revisions[0]?.id);
  const [enlarged, setEnlarged] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const bodyId = useId();
  const selected = revisions.find(revision => revision.id === selectedId) ?? revisions[0];
  if (!selected) return null;
  const model = selected.model;
  const snapshot = (view: ModelSnapshot) => {
    if (model) actions.snapshot({ ...selected.item, type: "model", model, caption: `Revision ${selected.number}` }, view);
  };
  const preview = model && <Suspense fallback={<p className="cad-output-state" role="status">Opening the model…</p>}>
    <InlineModelPreview model={model} onSnapshot={snapshot} />
  </Suspense>;
  const download = model && <a className="button button--small" href={model.downloadUrl} download={model.name}>
    <Icon name="download" size={16} /> Download {model.format.toUpperCase()}
  </a>;
  return <>
    <aside className="cad-revisions" aria-label="Model revisions">
      <header className="cad-revisions-heading">
        <div><Icon name="cube" size={18} /><h2>Models</h2><Badge>{revisions.length}</Badge></div>
        <Button className="cad-revisions-toggle" size="small" variant="ghost" aria-controls={bodyId}
          aria-expanded={mobileExpanded} onClick={() => setMobileExpanded(value => !value)}>{mobileExpanded ? "Hide revisions" : "Show revisions"}</Button>
      </header>
      <div id={bodyId} className="cad-revisions-body" data-expanded={mobileExpanded}>
        <ol className="cad-revision-list" aria-label="Saved model revisions">
          {revisions.map((revision, index) => <li key={revision.id}>
            <button type="button" className="cad-revision-choice" aria-pressed={selected.id === revision.id}
              onClick={() => setSelectedId(revision.id)}>
              <span className="cad-revision-label"><strong>Revision {revision.number}</strong>{index === 0 && <span>Latest</span>}</span>
              <span className="cad-revision-title">{revision.title}</span>
              <span className="cad-revision-availability">{revisionAvailability(revision)}</span>
            </button>
          </li>)}
        </ol>
        <section className="cad-revision-preview" aria-label={`Revision ${selected.number} preview`} data-artifact-id={model?.id}>
          <div className="cad-revision-preview-heading"><h3>Revision {selected.number}</h3>
            <Button size="small" variant="ghost" icon="fit" disabled={!model} onClick={() => setEnlarged(true)}>Enlarge preview</Button>
          </div>
          {enlarged ? <p className="cad-output-state">Open in the larger preview.</p> : preview ?? <p className="cad-output-state">
            {revisionAvailability(selected) === "Preparing" ? "This revision is being prepared." : "This revision has no viewable 3D export yet."}
          </p>}
          <div className="cad-revision-actions">{download}<Button size="small" variant="ghost" icon="text"
            onClick={() => onShowHistory(selected.item.id)}>Show in chat</Button></div>
        </section>
      </div>
    </aside>
    {enlarged && model && <Dialog title="3D model preview" description={`${selected.title} · Revision ${selected.number}`} wide onClose={() => setEnlarged(false)}>
      <div className="cad-model-dialog" data-artifact-id={model.id}>
        <div className="cad-model-dialog-toolbar">
          <label>Revision <select aria-label="Preview revision" value={selected.id} onChange={event => setSelectedId(event.target.value)}>
            {revisions.map(revision => <option key={revision.id} value={revision.id} disabled={!revision.model}>
              Revision {revision.number} · {revision.title}
            </option>)}
          </select></label>
          {download}
        </div>
        {preview}
      </div>
    </Dialog>}
  </>;
}
