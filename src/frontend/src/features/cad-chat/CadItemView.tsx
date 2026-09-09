import { lazy, Suspense, useState } from "react";
import { Button, Notice } from "../../components/ui/primitives";
import { ChatMarkdown } from "../chat-flow/ChatMarkdown";
import { defineItemRenderer, type ItemActions } from "../chat-flow/ItemRendererRegistry";
import type { CadItem } from "../chat-flow/historyTypes";
import { ImagePreview } from "../chat-flow/items/ImageItemView";
import { sameVersion } from "../chat-flow/types";
import { CadMetrics } from "./CadMetrics";
import { cadStatusLabels, type CadFile, type CadOutput } from "./types";

const InlineModelPreview = lazy(() => import("../chat-flow/items/InlineModelPreview").then(module => ({ default: module.InlineModelPreview })));
const sizeText = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const phaseText = (phase: string) => phase.replaceAll(/[_-]/g, " ");

function Download({ file, label }: { file: CadFile; label?: string }) {
  return <a className="button button--small" href={file.downloadUrl} download={file.filename}>
    {label ?? `Download ${file.filename}`} <span className="cad-file-size">{sizeText(file.sizeBytes)}</span>
  </a>;
}

function CadImage({ output, actions }: { output: CadOutput; actions: ItemActions }) {
  const photo = output.photo;
  const attached = photo && actions.attachments.some(item => sameVersion(photo, item));
  return <figure className={`cad-image${output.views.length > 1 ? " cad-image--grid" : ""}`}>
    <div className="cad-view-title">{output.id}{output.annotations.inline && <span>Labels on image</span>}</div>
    {photo ? <button type="button" className="chat-inline-image" onClick={() => actions.inspect(photo)} aria-label={`Inspect ${photo.assetTitle}`}>
      <ImagePreview key={photo.imageSrc} src={photo.imageSrc} alt={photo.imageAlt} />
    </button> : <p className="cad-output-state" role="status">
      {(output.status === "pending" || output.status === "ready") && <span className="spinner" aria-hidden="true" />}
      {output.status === "pending" ? "Rendering view…" : output.status === "ready" ? "Loading image reference…" : output.reason ?? "View unavailable"}
    </p>}
    <figcaption>
      {photo && <Button size="small" variant="ghost" icon={attached ? "check" : "plus"} disabled={!!attached}
        onClick={() => actions.attach(photo)}>{attached ? "Attached" : "Attach view"}</Button>}
      {output.annotations.file && <Download file={output.annotations.file} label="Annotations JSON" />}
      {output.views.length > 0 && <details className="cad-view-details"><summary>Camera setup</summary><pre>{JSON.stringify(output.views, null, 2)}</pre></details>}
    </figcaption>
  </figure>;
}

function CadItemView({ item, actions }: { item: CadItem; actions: ItemActions }) {
  const { result } = item;
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModel, setShowModel] = useState(true);
  const active = result.status === "queued" || result.status === "running";
  const first = result.presentation.index === 0;
  const images = result.outputs.filter(output => output.kind === "png");
  const model = result.model;
  async function cancel() {
    if (!actions.cancelCad || cancelling) return;
    setCancelling(true); setError(null);
    try { await actions.cancelCad(result.operationId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not stop CAD work."); }
    finally { setCancelling(false); }
  }
  return <div className="cad-result" data-operation-id={result.operationId} data-operation-status={result.status}>
    <div className="cad-progress" role="status">
      {active && <span className="spinner" aria-hidden="true" />}
      <span><strong>{cadStatusLabels[result.status]}</strong> · {phaseText(result.phase)}
        {result.budget && <span className="cad-budget"> · {result.budget.evaluations} / {result.budget.maxEvaluations} evaluations</span>}</span>
      {active && actions.cancelCad && <Button size="small" variant="ghost" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? "Stopping…" : "Stop CAD"}</Button>}
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {result.error && <Notice tone="error">{result.error}</Notice>}
    {first && model && <div className="cad-model">
      <div className="cad-downloads">
        <Button size="small" icon="cube" aria-expanded={showModel} onClick={() => setShowModel(value => !value)}>{showModel ? "Close 3D preview" : "Open 3D preview"}</Button>
        <a className="button button--small button--primary" href={model.downloadUrl} download={model.name}>Download STEP <span className="cad-file-size">{sizeText(model.sizeBytes)}</span></a>
      </div>
      {showModel && <Suspense fallback={<p className="cad-output-state" role="status">Opening the 3D viewer…</p>}>
        <InlineModelPreview model={model} onSnapshot={snapshot => actions.snapshot({ ...item, type: "model", model, caption: `CAD revision ${result.revision?.number}` }, snapshot)} />
      </Suspense>}
    </div>}
    {!!images.length && <div className="cad-images">{images.map(output => <CadImage key={output.id} output={output} actions={actions} />)}</div>}
    {first && <>
      {result.outputs.filter(output => output.kind === "step" && (output.status !== "ready" || !output.file)).map(output =>
        <p key={output.id} className="cad-output-state">STEP · {output.status === "pending" ? "Preparing export…" : output.reason ?? "Export unavailable"}</p>)}
      <CadMetrics metrics={result.metrics} />
      {result.interpretation && <section className="cad-interpretation" aria-label="CAD agent interpretation"><h3>CAD agent notes</h3><ChatMarkdown text={result.interpretation} /></section>}
      {result.downloads.some(file => file.id !== model?.id) && <div className="cad-downloads">{result.downloads.filter(file => file.id !== model?.id).map(file => <Download key={file.id} file={file} />)}</div>}
      {(result.revision || result.geometry) && <details className="cad-provenance"><summary>Revision & geometry details</summary>
        <dl>
          {result.revision && <><dt>Revision {result.revision.number}</dt><dd>{result.revision.id}</dd>
            {result.revision.parentRevisionId && <><dt>Previous revision</dt><dd>{result.revision.parentRevisionId}</dd></>}</>}
          {result.geometry && <><dt>Geometry</dt><dd>{result.geometry.availability} · {result.geometry.digest}</dd></>}
          {result.evaluationId && <><dt>Evaluation</dt><dd>{result.evaluationId}</dd></>}
          {result.publicationId && <><dt>Publication</dt><dd>{result.publicationId}</dd></>}
          {Object.entries(result.reuse).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
          {model && <><dt>STEP SHA-256</dt><dd>{model.sha256}</dd></>}
        </dl>
      </details>}
    </>}
    {result.presentation.messageMode === "per_image" && <p className="cad-publication-part">View {result.presentation.index + 1} of {result.presentation.count}</p>}
  </div>;
}

export const cadItemEntry = defineItemRenderer(
  { type: "cad", label: "CAD result", icon: "cube", variant: "interaction", initiallyExpanded: true },
  (item, actions) => <CadItemView item={item} actions={actions} />,
);
