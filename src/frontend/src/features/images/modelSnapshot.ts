import { prepareImage } from "./imageIO";
import type { SourceImage } from "./types";
import type { ModelSnapshot } from "../models/types";

/** Application adapter; the renderer never opens IndexedDB or an annotation editor. */
export async function imageFromModelSnapshot(
  snapshot: ModelSnapshot,
): Promise<SourceImage> {
  const provenance = structuredClone(snapshot.provenance);
  const source = await prepareImage(
    snapshot.png,
    `${provenance.source.name} snapshot.png`,
    "model",
  );
  if (
    source.width !== provenance.capture.width ||
    source.height !== provenance.capture.height
  )
    throw new Error("Snapshot dimensions do not match its model provenance.");
  return { ...source, model: provenance };
}
