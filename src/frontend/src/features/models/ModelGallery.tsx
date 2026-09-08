import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Field,
  Notice,
  SelectField,
} from "../../components/ui/primitives";
import {
  ImageWorkspace,
  type ImageWorkspaceIntake,
} from "../images/ImageWorkspace";
import { imageFromModelSnapshot } from "../images/modelSnapshot";
import { errorMessage } from "../images/imageIO";
import { ModelViewer } from "./ModelViewer";
import type { ModelSource, ReferenceSphere, SectionPlane } from "./types";
import sampleUrl from "../../../tooling/models/rounded-cube.step?url";
import blockUrl from "../../../tooling/models/solid-block.stl?url&no-inline";

const demoReferences: ReferenceSphere[] = [
  {
    kind: "sphere",
    label: "Inner sphere (demo reference)",
    center: [0, 0, 0],
    radius: 10,
  },
];
const demoSections: SectionPlane[] = [
  { axis: "x", position: 0, enabled: true, flipped: true },
  { axis: "z", position: 0, enabled: true, flipped: true },
];

interface Entry {
  path: string;
  format: "step" | "stl";
  size: number;
}

function GalleryIntake({ addImage, loading }: ImageWorkspaceIntake) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState("sample");
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState(0);
  const [catalogError, setCatalogError] = useState("");
  const [fileError, setFileError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [compare, setCompare] = useState(false);
  const [showPrimary, setShowPrimary] = useState(true);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setCatalogError("");
    setVersion((current) => current + 1);
    try {
      const response = await fetch("/__model_gallery/catalog", {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10_000),
        ]),
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "Local folder discovery is available with the development server. Use the supplied sample or choose a file here.",
        );
      const data = (await response.json()) as {
        entries?: Entry[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(data.entries))
        throw new Error(
          data.error ?? "Could not read the local model catalog.",
        );
      if (!controller.signal.aborted) setEntries(data.entries);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setEntries([]);
        setCatalogError(errorMessage(cause));
      }
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, [refresh]);
  const source = useMemo<ModelSource>(() => {
    if (selected === "solid-demo")
      return {
        data: blockUrl,
        format: "stl",
        identity: {
          id: "synthetic:solid-block-with-reference",
          name: "Solid block + inner sphere demo",
        },
        stlUnits: "mm",
        upAxis: "z",
      };
    if (selected === "file" && file)
      return {
        data: file,
        format: /\.stl$/i.test(file.name) ? "stl" : "step",
        identity: {
          id: `local:${file.name}:${file.lastModified}`,
          name: file.name,
        },
        stlUnits: "mm",
        upAxis: "z",
      };
    if (selected.startsWith("folder:")) {
      const path = selected.slice(7);
      return {
        data: `/__model_gallery/file?path=${encodeURIComponent(path)}&reload=${version}`,
        format: /\.stl$/i.test(path) ? "stl" : "step",
        identity: { id: `gallery:${path}`, name: path, uri: `gallery:${path}` },
        stlUnits: "mm",
        upAxis: "z",
      };
    }
    return {
      data: sampleUrl,
      format: "step",
      identity: {
        id: "occt-import-js:41e470890ae0f9dc69ac50ffd5fc73e03576f4eb:rounded-cube",
        name: "rounded-cube.step",
        uri: "https://github.com/kovacsv/occt-import-js/blob/41e470890ae0f9dc69ac50ffd5fc73e03576f4eb/test/testfiles/rounded-cube/rounded-cube.step",
      },
      upAxis: "z",
    };
  }, [selected, file, version]);
  return (
    <>
      <section
        className="model-catalog card"
        aria-label="Model gallery sources"
      >
        <div className="model-catalog-fields">
          <SelectField
            label="Model source"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="sample">Supplied STEP sample · rounded cube</option>
            <option value="solid-demo">Solid block + inner sphere demo</option>
            {file && <option value="file">Chosen file · {file.name}</option>}
            {entries.map((entry) => (
              <option key={entry.path} value={`folder:${entry.path}`}>
                {entry.path} · {(entry.size / 1024).toFixed(1)} KB
              </option>
            ))}
            {selected.startsWith("folder:") &&
              !entries.some((entry) => `folder:${entry.path}` === selected) && (
                <option value={selected}>
                  Unavailable · {selected.slice(7)}
                </option>
              )}
          </SelectField>
          <Field
            label="Choose model file"
            type="file"
            accept=".step,.stp,.stl"
            onChange={(event) => {
              const next = event.target.files?.[0];
              event.target.value = "";
              if (!next) return;
              setFileError("");
              if (!/\.(step|stp|stl)$/i.test(next.name)) {
                setFileError("Choose a .step, .stp, or .stl file.");
                return;
              }
              setFile(next);
              setSelected("file");
              setVersion((current) => current + 1);
            }}
          />
          <Button onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh & reload"}
          </Button>
        </div>
        <p className="small">
          STEP reads file units; STL assumes millimeters and Z-up. The supplied
          FreeCAD STEP fixture is from occt-import-js (LGPL-2.1).{" "}
          <a
            className="text-link"
            href="https://github.com/kovacsv/occt-import-js/tree/41e470890ae0f9dc69ac50ffd5fc73e03576f4eb/test/testfiles/rounded-cube"
            target="_blank"
            rel="noreferrer"
          >
            Sample source
          </a>
        </p>
        {catalogError && <Notice>{catalogError}</Notice>}
        {fileError && <Notice tone="error">{fileError}</Notice>}
        {selected === "solid-demo" && (
          <Notice>
            The gold sphere is a demo reference inside the solid block. Move the
            X/Z planes to inspect its filled cross-sections. Turn off Fill cut
            faces to see its curved surface. Reference geometry is recorded with
            snapshots.
          </Notice>
        )}
        <details>
          <summary>Gallery tools</summary>
          <p className="small">
            Local files default to frontend/tooling/models. Start Vite with
            CRAFTY_MODEL_ROOT to choose another folder; refresh discovers and
            reloads current bytes.
          </p>
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={compare}
                onChange={(event) => {
                  setCompare(event.target.checked);
                  setShowPrimary(true);
                }}
              />{" "}
              Compare independent viewers
            </label>
            {compare && (
              <Button
                size="small"
                onClick={() => setShowPrimary((show) => !show)}
              >
                {showPrimary ? "Hide primary viewer" : "Show primary viewer"}
              </Button>
            )}
          </div>
        </details>
      </section>
      <div
        className={
          compare && showPrimary ? "model-viewer-grid" : "model-viewer-single"
        }
      >
        {showPrimary && (
          <ModelViewer
            source={source}
            referenceObjects={
              selected === "solid-demo" ? demoReferences : undefined
            }
            initialSections={
              selected === "solid-demo" ? demoSections : undefined
            }
            label="Model viewer"
            snapshotLabel="Snapshot & annotate"
            snapshotDisabled={loading}
            onSnapshot={async (snapshot) =>
              addImage(await imageFromModelSnapshot(snapshot), true)
            }
          />
        )}
        {compare && (
          <ModelViewer
            source={source}
            referenceObjects={
              selected === "solid-demo" ? demoReferences : undefined
            }
            initialSections={
              selected === "solid-demo" ? demoSections : undefined
            }
            label="Comparison viewer"
            snapshotLabel="Snapshot & annotate"
            snapshotDisabled={loading}
            onSnapshot={async (snapshot) =>
              addImage(await imageFromModelSnapshot(snapshot), true)
            }
          />
        )}
      </div>
    </>
  );
}

export function ModelGallery() {
  return (
    <ImageWorkspace>{(intake) => <GalleryIntake {...intake} />}</ImageWorkspace>
  );
}
