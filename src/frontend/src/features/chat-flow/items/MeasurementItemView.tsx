import { useRef, useState } from "react";
import { Button, Notice } from "../../../components/ui/primitives";
import { defineItemRenderer, type ItemActions } from "../ItemRendererRegistry";
import type { MeasurementItem } from "../historyTypes";

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
  return <div className="chat-measurements">
    <p className="muted">{item.caption}</p>
    {!!item.photos.length && <ul className="measurement-photos" aria-label="Measurement reference photos">
      {item.photos.map(photo => <li key={`${photo.assetId}:${photo.versionId}`}><button type="button" onClick={() => actions.inspect(photo)}>
        <img src={photo.imageSrc} alt={photo.imageAlt} /><span>{photo.assetTitle}</span>
      </button></li>)}
    </ul>}
    {complete ? <>
      <p className="measurement-confirmation">Measurements sent</p>
      <dl className="measurement-answers">{item.fields.map(field => <div key={field.id}>
        <dt>{field.label}</dt><dd>{item.answers[field.id] === undefined ? "Not measured" : <>{item.answers[field.id]}{field.kind === "number" && field.unit ? ` ${field.unit}` : ""}</>}</dd>
      </div>)}</dl>
    </> : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="measurement-fields">{item.fields.map(field => {
        const id = `${item.requestId}-${field.id}`;
        return <div className="measurement-field" key={field.id}>
          <label htmlFor={id}>{field.label}{field.kind === "number" && field.unit && <span> · {field.unit}</span>}</label>
          <input id={id} type={field.kind === "number" ? "number" : "text"} step={field.kind === "number" ? "any" : undefined}
            min={field.kind === "number" ? 0 : undefined} max={field.kind === "number" ? 100000 : undefined} maxLength={2000}
            inputMode={field.kind === "number" ? "decimal" : "text"} placeholder={field.kind === "number" ? "Not measured yet" : "Your answer"}
            value={answers[field.id] ?? ""} disabled={submitting} aria-describedby={field.hint ? `${id}-hint` : undefined}
            onChange={event => setAnswers(current => ({ ...current, [field.id]: event.target.value }))} />
          {field.hint && <p id={`${id}-hint`}>{field.hint}</p>}
        </div>;
      })}</div>
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
