import { useState } from "react";
import { Button } from "../../components/ui/primitives";
import { CameraPanel } from "../camera/CameraPanel";
import { defineItemRenderer, type ItemActions } from "./ItemRendererRegistry";
import type { CameraItem } from "./historyTypes";
import { sameVersion, versionKey } from "./types";

/** A camera request is an inline history item; its capture lifetime ends on collapse. */
export function CameraRunCard({ item, actions }: { item: CameraItem; actions: ItemActions }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const illustrationCount = item.photos.filter((photo) => photo.illustrative).length;
  return (
    <div className="chat-camera-item">
      <p className="chat-item-intro">{item.caption}</p>
      {cameraOpen && (
        <div className="chat-inline-camera">
          <CameraPanel onCapture={(image) => actions.capture(item, image)} onClose={() => setCameraOpen(false)} />
        </div>
      )}
      <ul className="chat-capture-grid" aria-label="Camera photos">
        {item.photos.map((photo) => {
          const attached = actions.attachments.some((selected) => sameVersion(selected, photo));
          return (
            <li key={versionKey(photo)}>
              <button type="button" className="chat-capture-preview" onClick={() => actions.inspect(photo)} aria-label={`Inspect ${photo.assetTitle}, v${photo.versionNumber}`}>
                <img src={photo.imageSrc} alt={photo.imageAlt} width="640" height="480" />
              </button>
              <div>
                <span>{photo.assetTitle}</span>
                <Button size="small" icon={attached ? "check" : "plus"} disabled={attached} aria-label={`${attached ? "Attached" : "Attach"} ${photo.assetTitle}, v${photo.versionNumber}`} onClick={() => actions.attach(photo)}>
                  {attached ? "Attached" : "Attach"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {!cameraOpen && (
        <Button size="small" icon="camera" onClick={() => setCameraOpen(true)}>Open camera</Button>
      )}
      <p className="chat-fixture-note">
        {illustrationCount > 0 && `Includes ${illustrationCount} illustrative photos. `}
        New captures stay in this conversation.
      </p>
    </div>
  );
}

export const cameraItemEntry = defineItemRenderer(
  { type: "camera", label: "Camera session", icon: "camera", variant: "interaction", initiallyExpanded: true },
  (item, actions) => <CameraRunCard item={item} actions={actions} />,
);
