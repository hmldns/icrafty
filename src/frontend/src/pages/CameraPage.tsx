import { Icon } from "../components/ui/Icon";
import { CameraWorkspace } from "../features/images/CameraWorkspace";

export function CameraPage() {
  return (
    <div className="camera-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow">01 / Observe & explain</p>
          <h1>A clearer picture.</h1>
          <p>Capture the detail. Add your notes. Download and keep going.</p>
        </div>
        <div className="local-note">
          <Icon name="lock" size={18} />
          <p>
            <strong>Saved in this browser</strong>Your images stay here. Nothing
            is uploaded or sent to an agent.
          </p>
        </div>
      </header>
      <CameraWorkspace />
    </div>
  );
}
