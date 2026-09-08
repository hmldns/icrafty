import { Button, SelectField } from "../../components/ui/primitives";
import { WorkspaceHelp } from "../../components/ui/WorkspaceHeader";

export interface GalleryEntry {
  path: string;
  format: "step" | "stl";
  size: number;
}

export function ModelGalleryTools({
  selected,
  fileName,
  entries,
  compare,
  showPrimary,
  onSelect,
  onCompare,
  onTogglePrimary,
}: {
  selected: string;
  fileName?: string;
  entries: GalleryEntry[];
  compare: boolean;
  showPrimary: boolean;
  onSelect: (id: string) => void;
  onCompare: (enabled: boolean) => void;
  onTogglePrimary: () => void;
}) {
  return (
    <WorkspaceHelp label="Gallery tools" className="model-gallery-tools">
      <SelectField
        label="Model source"
        value={selected}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="sample">Supplied STEP sample · rounded cube</option>
        <option value="solid-demo">Solid block + inner sphere demo</option>
        {fileName && <option value="file">Chosen file · {fileName}</option>}
        {entries.map((entry) => (
          <option key={entry.path} value={`folder:${entry.path}`}>
            {entry.path} · {(entry.size / 1024).toFixed(1)} KB
          </option>
        ))}
        {selected.startsWith("folder:") &&
          !entries.some((entry) => `folder:${entry.path}` === selected) && (
            <option value={selected}>Unavailable · {selected.slice(7)}</option>
          )}
      </SelectField>
      <p>
        Drop a STEP / STL file here, or select a model tile. Previews appear
        after opening a model. Side placement becomes a horizontal strip on
        narrow screens.
      </p>
      <p>
        Local files default to frontend/tooling/models. Start Vite with
        CRAFTY_MODEL_ROOT to choose another folder; refresh discovers and
        reloads current bytes.
      </p>
      <p>
        Supplied FreeCAD STEP fixture: occt-import-js (LGPL-2.1).{" "}
        <a
          className="text-link"
          href="https://github.com/kovacsv/occt-import-js/tree/41e470890ae0f9dc69ac50ffd5fc73e03576f4eb/test/testfiles/rounded-cube"
          target="_blank"
          rel="noreferrer"
        >
          Sample source
        </a>
      </p>
      <label>
        <input
          type="checkbox"
          checked={compare}
          onChange={(event) => {
            onCompare(event.target.checked);
          }}
        />{" "}
        Compare independent viewers
      </label>
      {compare && (
        <Button size="small" onClick={onTogglePrimary}>
          {showPrimary ? "Hide primary viewer" : "Show primary viewer"}
        </Button>
      )}
      {selected === "solid-demo" && (
        <p>
          The gold sphere is a demo reference inside the solid block. Move the
          X/Z planes to inspect its filled cross-sections. Turn off Fill cut
          faces to see its curved surface. Snapshots record the reference
          geometry.
        </p>
      )}
    </WorkspaceHelp>
  );
}
