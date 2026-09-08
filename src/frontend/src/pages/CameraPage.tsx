import { WorkspaceHeader } from "../components/ui/WorkspaceHeader";
import { CameraWorkspace } from "../features/images/CameraWorkspace";

export function CameraPage() {
  return (
    <div className="camera-page debug-workspace">
      <WorkspaceHeader title="A clearer picture." context="Camera & images">
        <p>Capture the detail. Add your notes. Download and keep going.</p>
        <p>
          Images and edits stay in this browser. Nothing is sent to an agent.
          Choose a frame before capture; the saved image matches the preview.
        </p>
        <p>Drop or paste PNG, JPEG or WebP images, up to 12 MB / 16 MP each.</p>
      </WorkspaceHeader>
      <CameraWorkspace />
    </div>
  );
}
