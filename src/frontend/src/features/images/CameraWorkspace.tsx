import { useState } from "react";
import { CameraPanel } from "../camera/CameraPanel";
import { ImageIntake } from "./ImageIntake";
import { ImageWorkspace, type ImageWorkspaceIntake } from "./ImageWorkspace";

function CameraIntake({ addImage, loading }: ImageWorkspaceIntake) {
  const [cameraOpen, setCameraOpen] = useState(false);
  return (
    <>
      <ImageIntake
        onAdd={addImage}
        onCamera={() => setCameraOpen(true)}
        disabled={loading}
      />
      {cameraOpen && (
        <CameraPanel
          onCapture={(source) => addImage(source, false)}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}

export function CameraWorkspace() {
  return (
    <ImageWorkspace>{(intake) => <CameraIntake {...intake} />}</ImageWorkspace>
  );
}
