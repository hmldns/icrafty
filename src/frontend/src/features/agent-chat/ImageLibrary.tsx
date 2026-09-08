import { useRef } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Button, EmptyState } from "../../components/ui/primitives";
import type { AgentImage } from "./types";

export function ImageLibrary({ images, selected, attached, uploading, onSelect, onAttach, onUpload, onClose }: {
  images: AgentImage[]; selected: string | null; attached: string[]; uploading: boolean;
  onSelect: (id: string) => void; onAttach: (image: AgentImage) => void;
  onUpload: (files: File[]) => void; onClose: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const image = images.find(item => item.id === selected) ?? images.at(-1);
  return <Dialog title="Images in this chat" description="Inspect, download, or attach an image version." wide onClose={onClose}>
    <div className="dialog-body agent-library">
      <div className="row">
        <Button icon="plus" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? "Uploading…" : "Upload images"}</Button>
        <span>PNG, JPEG or WebP · up to 20 MiB each</span>
        <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload chat images"
          onChange={event => { onUpload([...event.target.files ?? []]); event.target.value = ""; }} />
      </div>
      {image ? <div className="agent-library-layout">
        <ul className="agent-image-list" aria-label="Saved chat images">
          {images.map(item => <li key={item.id}><button type="button" aria-pressed={image.id === item.id} onClick={() => onSelect(item.id)}>
            <img src={item.url} alt="" /><span>{item.title}</span>
          </button></li>)}
        </ul>
        <section className="agent-image-detail" aria-label="Selected image">
          <h3>{image.title}</h3><img src={image.url} alt={image.title} />
          <p>{image.width} × {image.height} · {image.origin === "generated" ? "Published by Codex" : "Uploaded image"} · v{image.versionId}</p>
          <div className="row">
            <Button variant="primary" disabled={attached.includes(image.id)} onClick={() => { onAttach(image); onClose(); }}>{attached.includes(image.id) ? "Attached" : "Attach image"}</Button>
            <a className="button button--secondary" href={`${image.url}?download=true`} download>Download image</a>
            <Button variant="ghost" onClick={onClose}>Back to chat</Button>
          </div>
        </section>
      </div> : <EmptyState title="No images yet">Upload a photo, paste one into your message, or ask Codex to generate a sketch.</EmptyState>}
    </div>
  </Dialog>;
}
