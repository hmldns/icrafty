import { useRef, useState } from "react";
import { Button, Notice } from "../../../components/ui/primitives";
import { defineItemRenderer, type ItemActions } from "../ItemRendererRegistry";
import type { DimensionField, MeasurementGuide, MeasurementItem } from "../historyTypes";
import { ImagePreview } from "./ImageItemView";

function GuideFigure({ guide, number, inspect }: { guide: MeasurementGuide; number: number; inspect: ItemActions["inspect"] }) {
  return <figure className="measurement-guide">
    <figcaption><span>Sketch {number}</span>{guide.photo && <span>Open larger</span>}</figcaption>
    {guide.photo ? <button type="button" className="measurement-guide-image" onClick={() => inspect(guide.image)}
      aria-label={`Enlarge sketch ${number}: ${guide.photo.assetTitle}`}>
      <ImagePreview key={guide.photo.imageSrc} src={guide.photo.imageSrc} alt={guide.photo.imageAlt} />
    </button> : <div className="measurement-guide-loading" role="status">
      <span className="spinner" aria-hidden="true" />Loading measurement sketch…
    </div>}
  </figure>;
}

function MeasurementFields({ item, fields, answers, submitting, onChange }: {
  item: MeasurementItem;
  fields: readonly DimensionField[];
  answers: Readonly<Record<string, string>>;
  submitting: boolean;
  onChange: (id: string, value: string) => void;
}) {
  if (!fields.length) return null;
  if (item.status === "answered") return <dl className="measurement-answers">{fields.map(field => <div key={field.id}>
    <dt>{field.label}</dt><dd>{item.answers[field.id] === undefined ? "Not measured" : <>{item.answers[field.id]}{field.kind === "number" && field.unit ? ` ${field.unit}` : ""}</>}</dd>
  </div>)}</dl>;
  return <div className="measurement-fields">{fields.map(field => {
    const id = `${item.requestId}-${field.id}`;
    return <div className="measurement-field" key={field.id}>
      <label htmlFor={id}>{field.label}{field.kind === "number" && field.unit && <span> · {field.unit}</span>}</label>
      <input id={id} type={field.kind === "number" ? "number" : "text"} step={field.kind === "number" ? "any" : undefined}
        min={field.kind === "number" ? 0 : undefined} max={field.kind === "number" ? 100000 : undefined} maxLength={2000}
        inputMode={field.kind === "number" ? "decimal" : "text"} placeholder={field.kind === "number" ? "Not measured yet" : "Your answer"}
        value={answers[field.id] ?? ""} disabled={submitting} aria-describedby={field.hint ? `${id}-hint` : undefined}
        onChange={event => onChange(field.id, event.target.value)} />
      {field.hint && <p id={`${id}-hint`}>{field.hint}</p>}
    </div>;
  })}</div>;
}

function MeasurementItemView({ item, actions }: { item: MeasurementItem; actions: ItemActions }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const command = useRef<{ input: string; id: string } | null>(null);
  const complete = item.status === "answered";
  async function submit() {
    if (!actions.answerMeasurements || actions.measurementsBusy || submitting || complete) return;
    const input = JSON.stringify(answers);
    if (command.current?.input !== input) command.current = { input, id: crypto.randomUUID() };
    setSubmitting(true); setError(null);
    try { await actions.answerMeasurements(item.requestId, command.current.id, answers); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not send measurements"); }
    finally { setSubmitting(false); }
  }
  // A second view can explain the same measurement without creating a second input.
  const placed = new Set<string>();
  const groups = item.guides.map(guide => ({ guide, fields: item.fields.filter(field => {
    if (!guide.fieldIds.includes(field.id) || placed.has(field.id)) return false;
    placed.add(field.id); return true;
  }) }));
  const renderFields = (fields: readonly DimensionField[]) => <MeasurementFields item={item} fields={fields}
    answers={answers} submitting={submitting} onChange={(id, value) => setAnswers(current => ({ ...current, [id]: value }))} />;
  const questions = <>
    {groups.map(({ guide, fields }, index) => <div className="measurement-guide-group" key={`${guide.image.assetId}:${guide.image.versionId}:${index}`}>
      <GuideFigure guide={guide} number={index + 1} inspect={actions.inspect} />
      {renderFields(fields)}
    </div>)}
    {renderFields(item.fields.filter(field => !placed.has(field.id)))}
  </>;

  return <div className="chat-measurements">
    <p className="muted">{item.caption}</p>
    {!!item.photos.length && <div className="measurement-references"><span>Source photos</span>
      <ul className="measurement-photos" aria-label="Measurement reference photos">
        {item.photos.map(photo => <li key={`${photo.assetId}:${photo.versionId}`}><button type="button"
          onClick={() => actions.inspect(photo)} aria-label={`Inspect source photo: ${photo.assetTitle}`}>
          {photo.assetTitle}
        </button></li>)}
      </ul>
    </div>}
    {complete ? <>
      <p className="measurement-confirmation">Measurements sent</p>
      {questions}
    </> : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      {questions}
      <p className="measurement-note">Leave anything you cannot measure blank. You can also reply in chat.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="row"><Button variant="primary" type="submit" disabled={submitting || actions.measurementsBusy || !actions.answerMeasurements || !Object.values(answers).some(value => value.trim())}>
        {submitting ? "Sending measurements…" : "Send measurements"}
      </Button>{actions.measurementsBusy && <span className="small muted">Available when the current reply finishes</span>}</div>
    </form>}
  </div>;
}

export const measurementItemEntry = defineItemRenderer(
  { type: "measurements", label: "Measurements", icon: "pen", variant: "interaction", initiallyExpanded: true, retainContent: true },
  (item, actions) => <MeasurementItemView item={item} actions={actions} />,
);
