import { expect, test } from "@playwright/test";
import { projectToolCall } from "../src/features/chat-flow/projectHistory";
import { cadRecord, cadResult } from "./cad-fixture";

const catalog = { assets: [], models: [], sessionId: "chat-a" };
const file = { id: "step-a", url: "/api/agent/sessions/chat-a/cad/artifacts/step-a", downloadUrl: "/api/agent/sessions/chat-a/cad/artifacts/step-a?download=true",
  filename: "part.step", format: "step", mediaType: "model/step", sizeBytes: 200, sha256: "d".repeat(64) };
const model = { ...file, revisionId: "revision-1", geometryDigest: "c".repeat(64), units: "mm", frame: "right-handed-z-up" };
const base = cadResult({ status: "completed", model, downloads: [file],
  requestedOutputs: [{ id: "solid", kind: "step", parts: ["body"] }], outputs: [{ id: "solid", kind: "step", status: "ready", file }] });

test("CAD models require requested ready STEP bytes from the same session and revision", () => {
  const good = projectToolCall(cadRecord(base), catalog);
  expect(good.type === "cad" && good.result.model?.url).toBe(file.url);
  for (const change of [
    { model: { ...model, url: "javascript:alert(1)" } },
    { model: { ...model, downloadUrl: "https://example.test/part.step" } },
    { model: { ...model, revisionId: "another-revision" } },
    { model: { ...model, geometryDigest: "e".repeat(64) } },
    { model: { ...model, sha256: "e".repeat(64) } },
    { model: { ...model, sizeBytes: 201 } },
    { requestedOutputs: [] },
    { outputs: [{ id: "solid", kind: "step", status: "error", file }] },
  ]) {
    const item = projectToolCall(cadRecord({ ...base, ...change }), catalog);
    expect(item.type).toBe("cad");
    expect(item.type === "cad" && item.result.model).toBeNull();
  }
  const foreign = projectToolCall(cadRecord(base), { ...catalog, sessionId: "chat-b" });
  expect(foreign.type === "cad" && foreign.result.model).toBeNull();
  expect(foreign.type === "cad" && foreign.result.downloads).toEqual([]);
});

test("CAD preserves publication order, unavailable outputs and explicit unsupported versions", () => {
  const refs = ["top", "iso"].map(assetId => ({ assetId, versionId: "1" }));
  const result = cadResult({ images: refs,
    outputs: [{ id: "iso", kind: "png", status: "ready", image: refs[1] }, { id: "top", kind: "png", status: "ready", image: refs[0] },
      { id: "solid", kind: "step", status: "unavailable", reason: { code: "no_export", message: "Not exported" } }] });
  const item = projectToolCall(cadRecord(result), catalog);
  expect(item.type === "cad" && item.result.outputs.map(output => output.id)).toEqual(["top", "iso", "solid"]);
  expect(item.type === "cad" && item.result.outputs[0]?.photo).toBeNull();
  expect(projectToolCall(cadRecord({ ...result, schema_version: 99 }), catalog).type).toBe("tool");
});
