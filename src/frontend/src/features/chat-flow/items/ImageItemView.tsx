import { useState } from "react";
import { Button } from "../../../components/ui/primitives";
import { defineItemRenderer, type ItemActions } from "../ItemRendererRegistry";
import type { ImageItem } from "../historyTypes";
import { sameVersion } from "../types";

export function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  return <span className="chat-image-preview" data-state={status} aria-busy={status === "loading"}>
    <img src={src} alt={alt} width="640" height="480"
      onLoad={() => setStatus("ready")} onError={() => setStatus("failed")} />
    {status !== "ready" && <span className="chat-image-preview-status" role="status">
      {status === "loading" && <span className="spinner" aria-hidden="true" />}
      {status === "loading" ? "Loading preview…" : "Preview unavailable · open image to inspect"}
    </span>}
  </span>;
}

function ImageItemView({ item, actions }: { item: ImageItem; actions: ItemActions }) {
  const attached = actions.attachments.some((photo) => sameVersion(photo, item.photo));
  return (
    <div className="chat-image-item">
      <button type="button" className="chat-inline-image" onClick={() => actions.inspect(item.photo)} aria-label={`Inspect ${item.photo.assetTitle}, v${item.photo.versionNumber}`}>
        <ImagePreview key={item.photo.imageSrc} src={item.photo.imageSrc} alt={item.photo.imageAlt} />
      </button>
      <div className="chat-item-caption">
        <p>{item.caption}</p>
        <div className="row">
          <Button size="small" icon={attached ? "check" : "plus"} disabled={attached} onClick={() => actions.attach(item.photo)}>
            {attached ? "Attached" : "Attach image"}
          </Button>
          <Button size="small" variant="ghost" onClick={() => actions.inspect(item.photo)}>Versions & details</Button>
        </div>
      </div>
    </div>
  );
}

export const imageItemEntry = defineItemRenderer(
  { type: "image", label: "Image", icon: "image", variant: "interaction", initiallyExpanded: true },
  (item, actions) => <ImageItemView item={item} actions={actions} />,
);
