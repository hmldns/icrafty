import { expect, test } from "@playwright/test";
import { projectToolCall } from "../src/features/chat-flow/projectHistory";
import { projectAgentSnapshot } from "../src/features/agent-chat/projection";
import type { AgentSnapshot } from "../src/features/agent-chat/types";
import { collectCadRevisions } from "../src/features/cad-chat/revisions";
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

test("ready STEP replaces only matching raster projections while preserving agent evidence", () => {
  const ref = { assetId: "raster", versionId: "1" };
  const raster = cadRecord(cadResult({ operationId: "early-png", status: "completed", images: [ref],
    outputs: [{ id: "iso", kind: "png", status: "ready", image: ref }] }));
  const other = cadRecord(cadResult({ operationId: "other-revision", status: "completed", images: [ref],
    revision: { id: "revision-2", number: 2 },
    outputs: [{ id: "iso", kind: "png", status: "ready", image: ref }] }));
  const snapshot: AgentSnapshot = { schemaVersion: 1, cursor: 0, interactions: [],
    session: { id: "chat-a", title: "Cap", runtime: "ready", activeTurnId: "next-turn", turnStatus: "running",
      error: null, model: null, updatedAt: "", permissions: [] },
    assets: ["raster", "sketch"].map(id => ({ id, versionId: "1", title: id, width: 32, height: 32,
      mimeType: "image/png", size: 100, digest: "image", origin: "cad", url: `/api/agent/sessions/chat-a/images/${id}` })),
    records: [raster, other, ...["raster", "sketch"].map(id => ({ type: "tool_call" as const,
      toolCallId: `show-${id}`, name: "images.show", title: id, status: "completed" as const,
      rawOutput: { view: "image", caption: id, image: { assetId: id, versionId: "1" } } })),
      cadRecord(base), { type: "message", id: "follow-up", author: "you", origin: "agent", text: "Refine the cap.", imageIds: ["raster"] }] };
  const original = JSON.stringify(snapshot);
  const items = projectAgentSnapshot(snapshot);
  const early = items.find(item => item.type === "cad" && item.result.operationId === "early-png");
  const another = items.find(item => item.type === "cad" && item.result.operationId === "other-revision");
  expect(early?.type === "cad" && early.result.outputs).toEqual([]);
  expect(another?.type === "cad" && another.result.outputs[0]?.kind).toBe("png");
  expect(items.filter(item => item.type === "image").map(item => item.title)).toEqual(["sketch"]);
  const user = items.find(item => item.type === "message");
  expect(user?.type === "message" && user.attachments).toHaveLength(1);
  expect(items.at(-1)?.type).toBe("message");
  expect(items.some(item => item.type === "model")).toBe(false);
  const revisions = collectCadRevisions(items);
  expect(revisions.map(revision => revision.number)).toEqual([2, 1]);
  expect(revisions.find(revision => revision.number === 1)?.model?.id).toBe(file.id);
  expect(revisions.find(revision => revision.number === 2)?.model).toBeNull();
  expect(JSON.stringify(snapshot)).toBe(original);
  const pngOnly = projectAgentSnapshot({ ...snapshot, records: snapshot.records.filter(item => item !== snapshot.records[4]) });
  expect(pngOnly.filter(item => item.type === "image")).toHaveLength(2);
  expect(pngOnly.some(item => item.type === "model")).toBe(false);
});

test("revision list retains its STEP and title across evidence and a pending redesign", () => {
  const items = [cadRecord(base), cadRecord(cadResult({ operationId: "later-query", operationKind: "evidence", status: "completed" })),
    cadRecord(cadResult({ operationId: "failed-query", operationKind: "evidence", status: "failed" })),
    cadRecord(cadResult({ operationId: "next-design", operationKind: "model", status: "running", title: "Proposed threaded cap" }))]
    .map(record => projectToolCall(record, catalog));
  const revisions = collectCadRevisions(items);
  expect(revisions).toHaveLength(1);
  expect(revisions[0]?.model?.id).toBe(file.id);
  expect(revisions[0]?.title).toBe(base.title);
  expect(revisions[0]?.item.id).toBe(`tool-cad:${base.operationId}`);
});
