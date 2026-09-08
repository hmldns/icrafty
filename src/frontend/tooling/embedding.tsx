import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ModelViewer } from "../src/features/models/ModelViewer";
import type { ModelSnapshot, ModelSource } from "../src/features/models/types";
import { useObjectUrl } from "../src/features/images/useObjectUrl";
import "../src/styles/index.css";
import modelUrl from "./models/bracket.stl?url";

function Snapshot({ snapshot }: { snapshot: ModelSnapshot }) {
  const url = useObjectUrl(snapshot.png);
  return (
    <section aria-label="Standalone snapshot">
      <img src={url} alt="Frozen standalone view" />
      <pre data-testid="snapshot-context">
        {JSON.stringify(snapshot.provenance)}
      </pre>
    </section>
  );
}

function Example() {
  const [source, setSource] = useState<ModelSource | null>(null);
  const [snapshot, setSnapshot] = useState<ModelSnapshot | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(modelUrl, { signal: controller.signal })
      .then((response) => response.blob())
      .then((blob) => {
        if (controller.signal.aborted) return;
        // Deliberately use meters and Y-up to exercise the explicit adapter transform.
        setSource({
          data: blob,
          format: "stl",
          stlUnits: "m",
          upAxis: "y",
          identity: {
            id: "embedding-example",
            name: "Blob bracket",
            artifactId: "example-artifact",
            revisionId: "example-revision",
            evaluationId: "example-evaluation",
          },
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) throw error;
      });
    return () => controller.abort();
  }, []);
  return (
    <main className="main-content">
      <h1>Standalone viewer</h1>
      <p>
        A Blob source and callback, without gallery discovery or application
        storage.
      </p>
      <ModelViewer
        source={source}
        label="Embedded model"
        onSnapshot={setSnapshot}
      />
      {snapshot && <Snapshot snapshot={snapshot} />}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Example />
  </StrictMode>,
);
