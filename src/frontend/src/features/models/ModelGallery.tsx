import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Notice, SelectField } from "../../components/ui/primitives";
import {
  ImageWorkspace,
  type ImageWorkspaceIntake,
} from "../images/ImageWorkspace";
import { imageFromModelSnapshot } from "../images/modelSnapshot";
import { errorMessage } from "../images/imageIO";
import { ModelViewer, type ModelViewerProps } from "./ModelViewer";
import { ModelGalleryTools, type GalleryEntry } from "./ModelGalleryTools";
import {
  ModelTiles,
  useModelPreviews,
  useTilePlacement,
  type ModelTile,
  type TilePlacement,
} from "./ModelTiles";
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

function GalleryIntake({ addImage, loading }: ImageWorkspaceIntake) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [selected, setSelected] = useState("sample");
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState(0);
  const [catalogError, setCatalogError] = useState("");
  const [fileError, setFileError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [compare, setCompare] = useState(false);
  const [showPrimary, setShowPrimary] = useState(true);
  const [placement, setPlacement] = useTilePlacement();
  const { previews, recordPreview, clearPreviews } = useModelPreviews();
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setCatalogError("");
    clearPreviews();
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
        entries?: GalleryEntry[];
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
  }, [clearPreviews]);
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
  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    setFileError("");
    if (!/\.(step|stp|stl)$/i.test(next.name)) {
      setFileError("Choose a .step, .stp, or .stl file.");
      return;
    }
    setFile(next);
    setSelected("file");
    setVersion((current) => current + 1);
  };
  const tiles: ModelTile[] = [
    { id: "sample", name: "rounded-cube.step · supplied", format: "step" },
    {
      id: "solid-demo",
      name: "Solid block + inner sphere demo",
      format: "stl",
    },
    ...(file
      ? [
          {
            id: "file",
            name: file.name,
            format: /\.stl$/i.test(file.name)
              ? ("stl" as const)
              : ("step" as const),
          },
        ]
      : []),
    ...entries.map((entry) => ({
      id: `folder:${entry.path}`,
      name: entry.path,
      format: entry.format,
    })),
  ];
  if (!tiles.some((tile) => tile.id === selected))
    tiles.push({
      id: selected,
      name: selected.slice(7),
      format: source.format,
    });
  const viewerProps: ModelViewerProps = {
    source,
    layout: "workspace",
    snapshotLabel: "Snapshot & annotate",
    snapshotDisabled: loading,
    initialSections: selected === "solid-demo" ? demoSections : undefined,
    referenceObjects: selected === "solid-demo" ? demoReferences : undefined,
    onSnapshot: async (snapshot) =>
      addImage(await imageFromModelSnapshot(snapshot), true),
  };
  return (
    <div
      className="model-workbench"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        chooseFile(event.dataTransfer.files[0]);
      }}
    >
      <section
        className="model-catalog card"
        aria-label="Model gallery sources"
      >
        <div className="model-catalog-fields">
          <Button
            icon="upload"
            onClick={() => fileInput.current?.click()}
            title="Choose or drop a STEP / STL file"
          >
            Import model
          </Button>
          <Button onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh & reload"}
          </Button>
          <SelectField
            label="Tile placement"
            value={placement}
            onChange={(event) =>
              setPlacement(event.target.value as TilePlacement)
            }
          >
            <option value="side">Beside viewer</option>
            <option value="top">Above viewer</option>
            <option value="bottom">Below viewer</option>
          </SelectField>
          <ModelGalleryTools
            selected={selected}
            fileName={file?.name}
            entries={entries}
            compare={compare}
            showPrimary={showPrimary}
            onSelect={setSelected}
            onCompare={(enabled) => {
              setCompare(enabled);
              setShowPrimary(true);
            }}
            onTogglePrimary={() => setShowPrimary((show) => !show)}
          />
          <input
            ref={fileInput}
            className="sr-only"
            aria-label="Choose model file"
            type="file"
            accept=".step,.stp,.stl"
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {catalogError && <Notice>{catalogError}</Notice>}
        {fileError && <Notice tone="error">{fileError}</Notice>}
      </section>
      <div className="model-dock" data-placement={placement}>
        <ModelTiles
          tiles={tiles}
          selected={selected}
          previews={previews}
          onSelect={setSelected}
        />
        <div
          className={
            compare && showPrimary ? "model-viewer-grid" : "model-viewer-single"
          }
        >
          {showPrimary && (
            <ModelViewer
              {...viewerProps}
              onLoad={(event) => {
                if (event.source === source) recordPreview(selected, event);
              }}
              label="Model viewer"
            />
          )}
          {compare && (
            <ModelViewer
              {...viewerProps}
              label="Comparison viewer"
              onLoad={
                !showPrimary
                  ? (event) => {
                      if (event.source === source)
                        recordPreview(selected, event);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function ModelGallery() {
  const [imagesOpen, setImagesOpen] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!imagesOpen) return;
    const frame = requestAnimationFrame(() => {
      workspace.current
        ?.querySelector<HTMLButtonElement>(".collection-section button")
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [imagesOpen]);
  return (
    <div
      ref={workspace}
      className={`model-gallery-workspace${imagesOpen ? " model-gallery-workspace--images-open" : ""}`}
      onKeyDown={(event) => {
        if (
          imagesOpen &&
          event.key === "Escape" &&
          !(event.target as HTMLElement).closest("dialog")
        ) {
          setImagesOpen(false);
          toggle.current?.focus({ preventScroll: true });
        }
      }}
    >
      <ImageWorkspace>
        {(intake) => <GalleryIntake {...intake} />}
      </ImageWorkspace>
      <Button
        className="model-images-toggle"
        size="small"
        icon="image"
        aria-expanded={imagesOpen}
        onClick={(event) => {
          toggle.current = event.currentTarget;
          setImagesOpen((open) => !open);
        }}
      >
        {imagesOpen ? "Close image collection" : "Image collection"}
      </Button>
    </div>
  );
}
