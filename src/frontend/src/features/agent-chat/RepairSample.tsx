import { Button } from "../../components/ui/primitives";

export interface RepairSample {
  id: string;
  title: string;
  description: string;
  prompt: string;
  photos: { id: string; title: string; url: string; digest: string }[];
}

export function RepairSampleCard({ sample, disabled, onStart }: { sample: RepairSample; disabled: boolean; onStart: () => void }) {
  return <section className="repair-sample" aria-label="Mug cap sample">
    <div className="repair-sample-photos">{sample.photos.slice(0, 3).map(photo => <img key={photo.id} src={photo.url} alt={photo.title} />)}</div>
    <p className="eyebrow">Try a repair</p><h3>{sample.title}</h3><p>{sample.description}</p>
    <Button size="small" disabled={disabled} onClick={onStart}>Try the mug cap</Button>
    <p className="repair-sample-note">Opens a new repair with these four photos.</p>
  </section>;
}
