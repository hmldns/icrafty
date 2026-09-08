import { Icon } from "../../components/ui/Icon";
import { Badge, Card } from "../../components/ui/primitives";
import { PhotoStrip } from "./PhotoStrip";
import type { CameraRunEntry, VersionRef } from "./types";

export function CameraRunCard({
  run,
  onInspect,
}: {
  run: CameraRunEntry;
  onInspect: (ref: VersionRef) => void;
}) {
  return (
    <Card className="chat-camera-run">
      <div className="chat-camera-heading">
        <span className="chat-camera-icon">
          <Icon name="camera" size={20} />
        </span>
        <div>
          <h3>Camera run</h3>
          <p className="small">{run.title}</p>
        </div>
        <Badge>{run.captures.length} captures</Badge>
      </div>
      <p className="chat-camera-caption">{run.caption}</p>
      <PhotoStrip
        photos={run.captures}
        label="Camera run captures"
        onInspect={onInspect}
      />
      <p className="chat-fixture-note">Fixture history · illustrative captures</p>
    </Card>
  );
}
