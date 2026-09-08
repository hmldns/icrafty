import { Button } from "../../components/ui/primitives";
import { useChatCamera } from "./ChatCamera";
import { defineItemRenderer, type ItemActions } from "./ItemRendererRegistry";
import type { CameraItem } from "./historyTypes";
import { sameVersion, versionKey } from "./types";

/** A request owns capture references; the conversation owns the active floating camera. */
export function CameraRunCard({ item, actions }: { item: CameraItem; actions: ItemActions }) {
  const camera = useChatCamera();
  const cameraOpen = camera?.activeId === item.id;
  const illustrationCount = item.photos.filter((photo) => photo.illustrative).length;
  return (
    <div className="chat-camera-item">
      <p className="chat-item-intro">{item.caption}</p>
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
      <Button size="small" icon="camera" onClick={() => camera?.open(item)}>{cameraOpen ? "Show camera" : "Open camera"}</Button>
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
