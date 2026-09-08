import initialize from "occt-import-js";
import wasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  MODEL_LIMITS,
  STEP_SETTINGS,
  type ImportedModel,
  type ModelFormat,
  type ModelMesh,
} from "./types";

export type ImportRequest = { bytes: ArrayBuffer; format: ModelFormat };
export type ImportReply = { model: ImportedModel } | { error: string };

function validate(meshes: ModelMesh[]) {
  let triangles = 0;
  if (!meshes.length)
    throw new Error("No renderable triangles were found in this model.");
  for (const mesh of meshes) {
    const count = mesh.positions.length / 3;
    if (
      !count ||
      !Number.isInteger(count) ||
      !mesh.positions.every(Number.isFinite)
    )
      throw new Error("The model contains invalid vertex coordinates.");
    if (
      mesh.normals &&
      (mesh.normals.length !== mesh.positions.length ||
        !mesh.normals.every(Number.isFinite))
    )
      throw new Error("The model contains invalid normals.");
    if (mesh.indices && !mesh.indices.every((index) => index < count))
      throw new Error("The model contains invalid triangle indices.");
    const size = mesh.indices?.length ?? count;
    if (size % 3 !== 0)
      throw new Error("The model contains incomplete triangles.");
    triangles += size / 3;
  }
  if (triangles > MODEL_LIMITS.triangles)
    throw new Error(
      "This model exceeds the two million triangle viewing limit. Use a smaller model.",
    );
}

self.onmessage = async (event: MessageEvent<ImportRequest>) => {
  try {
    const { bytes, format } = event.data;
    if (!bytes.byteLength || bytes.byteLength > MODEL_LIMITS.bytes)
      throw new Error("Choose a nonempty STEP or STL file smaller than 50 MB.");
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    let meshes: ModelMesh[];
    let importer: string;
    if (format === "step") {
      const header = new TextDecoder().decode(bytes.slice(0, 512));
      if (!header.includes("ISO-10303-21"))
        throw new Error(
          "This is not a STEP Part 21 file. Choose a .step or .stp model.",
        );
      const occt = await initialize({ locateFile: () => wasmUrl });
      const result = occt.ReadStepFile(new Uint8Array(bytes), STEP_SETTINGS);
      if (!result.success || !result.meshes?.length)
        throw new Error(
          "STEP import failed. The file may be incomplete or contain no supported geometry.",
        );
      meshes = result.meshes.map((mesh) => ({
        name: mesh.name,
        positions: new Float32Array(mesh.attributes.position.array),
        normals: mesh.attributes.normal
          ? new Float32Array(mesh.attributes.normal.array)
          : undefined,
        indices: new Uint32Array(mesh.index.array),
        color: mesh.color,
      }));
      importer = "occt-import-js@0.0.23";
    } else if (format === "stl") {
      const geometry = new STLLoader().parse(bytes);
      meshes = [
        {
          name: "STL mesh",
          positions: new Float32Array(geometry.getAttribute("position").array),
          normals: new Float32Array(geometry.getAttribute("normal").array),
        },
      ];
      geometry.dispose();
      importer = "three/STLLoader";
    } else throw new Error("Unsupported model format. Choose STEP or STL.");
    validate(meshes);
    const model: ImportedModel = {
      meshes,
      sha256,
      byteLength: bytes.byteLength,
      importer,
    };
    const transfer = meshes.flatMap((mesh) => [
      mesh.positions.buffer,
      ...(mesh.normals ? [mesh.normals.buffer] : []),
      ...(mesh.indices ? [mesh.indices.buffer] : []),
    ]);
    self.postMessage({ model } satisfies ImportReply, { transfer });
  } catch (cause) {
    self.postMessage({
      error:
          cause instanceof Error
            ? `Could not import ${event.data.format.toUpperCase()}: ${cause.message}`
          : "The model parser failed. Try a different STEP or STL file.",
    } satisfies ImportReply);
  }
};
