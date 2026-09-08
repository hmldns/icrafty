import { ModelGallery } from "../features/models/ModelGallery";
import { WorkspaceHeader } from "../components/ui/WorkspaceHeader";

export function ModelGalleryPage() {
  return (
    <div className="model-page debug-workspace">
      <WorkspaceHeader title="Another perspective." context="STEP / STL">
        <p>
          Explore a model, section the view, then freeze it to annotate. Model
          tiles select one active view. Move the tiles without losing your view
          or sections.
        </p>
        <p>
          STEP reads file units; STL assumes millimeters and Z-up. Visual fills
          and hatching help show solid material, but do not verify solidity or
          export cut geometry.
        </p>
      </WorkspaceHeader>
      <ModelGallery />
    </div>
  );
}
