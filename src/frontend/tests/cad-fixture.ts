import type { ToolCallRecord } from "../src/features/chat-flow/historyTypes";

/** Explicit application-protocol example, never a claim of native CAD execution. */
export function cadResult(overrides: Record<string, unknown> = {}): Record<string, unknown> & { operationId: string; operationVersion: number; status: string; title: string } {
  return { schema_version: 1, view: "cad", operationId: "test-operation", operationVersion: 1,
    operationKind: "model", status: "running", phase: "evaluating", title: "Cylinder evidence",
    revision: { id: "revision-1", number: 1, parentRevisionId: null, sourceDigest: "a".repeat(64), buildKey: "b".repeat(64) },
    geometry: { id: "geometry-1", digest: "c".repeat(64), snapshotId: "snapshot-1", availability: "live", units: "mm", frame: "right-handed-z-up" },
    evaluationId: "evaluation-1", publicationId: null,
    requestedOutputs: [{ id: "iso", kind: "png", parts: ["body"], view: { preset: "isometric", width: 640, height: 480 } }],
    outputs: [{ id: "iso", kind: "png", status: "pending" }], images: [], model: null, downloads: [], metrics: [], interpretation: "", error: null,
    budget: { evaluations: 1, maxEvaluations: 8, elapsedSeconds: 3, maxSeconds: 1200 },
    reuse: { sourceExecutions: 1, builds: 1, loads: 1, restores: 0, queries: 1 }, presentation: { messageMode: "together", index: 0, count: 1 }, ...overrides };
}

export function cadRecord(result: ReturnType<typeof cadResult>, suffix = ""): ToolCallRecord {
  return { type: "tool_call", toolCallId: `cad:${result.operationId}${suffix}`, name: "cad.result", title: result.title,
    status: result.status === "running" ? "in_progress" : result.status === "completed" ? "completed" : "failed", rawOutput: result };
}

export const checkFixture = { id: "body.width", kind: "bbox_extent", target: { part: "body" }, axis: "x", unit: "mm", frame: "world",
  method: "bbox_extent@1", value: 19.7, criterion: { equals: 20, absolute_tolerance: .001 }, difference: -.3, status: "fail" };
