import type { CadItem, ToolCallRecord } from "../chat-flow/historyTypes";
import type { ProjectionCatalog } from "../chat-flow/projectHistory";
import { sameVersion, snapshotVersion, type VersionRef } from "../chat-flow/types";
import { cadStatusLabels, type CadFile, type CadMetric, type CadOutput, type CadResult, type CadStatus } from "./types";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string";
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const id = (value: unknown): value is string => string(value) && /^[a-zA-Z0-9_.-]{1,120}$/.test(value);
const digest = (value: unknown): value is string => string(value) && /^[a-f0-9]{64}$/.test(value);
const objects = (value: unknown): ObjectValue[] => Array.isArray(value) ? value.filter(object) : [];
const ref = (value: unknown): VersionRef | null => object(value) && id(value.assetId) && id(value.versionId)
  ? { assetId: value.assetId, versionId: value.versionId } : null;

/** Files must use the current session's recorded artifact route, never agent-local paths. */
function file(value: unknown, sessionId: string | undefined): CadFile | null {
  if (!object(value) || !id(sessionId) || !id(value.id) || !string(value.filename) || !string(value.format)
    || !string(value.mediaType) || !number(value.sizeBytes) || !digest(value.sha256)) return null;
  const path = `/api/agent/sessions/${sessionId}/cad/artifacts/${value.id}`;
  if (value.url !== path || value.downloadUrl !== `${path}?download=true`) return null;
  return { id: value.id, url: path, downloadUrl: value.downloadUrl, filename: value.filename,
    format: value.format, mediaType: value.mediaType, sizeBytes: value.sizeBytes, sha256: value.sha256 };
}

export function projectCad(call: ToolCallRecord, raw: ObjectValue, catalog: ProjectionCatalog): CadItem | null {
  if (raw.schema_version !== 1 || raw.view !== "cad" || !id(raw.operationId)
    || !number(raw.operationVersion) || !Number.isInteger(raw.operationVersion) || raw.operationVersion < 1
    || !string(raw.title) || !string(raw.phase) || !string(raw.status) || !Object.hasOwn(cadStatusLabels, raw.status)
    || !["model", "evidence", "restore"].includes(String(raw.operationKind))
    || !Array.isArray(raw.outputs) || !Array.isArray(raw.requestedOutputs) || !Array.isArray(raw.images)
    || !Array.isArray(raw.metrics) || !object(raw.presentation)) return null;
  const mode = raw.presentation.messageMode;
  const index = raw.presentation.index;
  const count = raw.presentation.count;
  if ((mode !== "together" && mode !== "per_image") || !number(index) || !Number.isInteger(index)
    || !number(count) || !Number.isInteger(count) || count < 1 || index >= count) return null;
  if (call.toolCallId !== `cad:${raw.operationId}` && call.toolCallId !== `cad:${raw.operationId}:${index}`) return null;

  const revision = object(raw.revision) && id(raw.revision.id) && number(raw.revision.number)
    ? { id: raw.revision.id, number: raw.revision.number, parentRevisionId: id(raw.revision.parentRevisionId) ? raw.revision.parentRevisionId : null } : null;
  const geometry = object(raw.geometry) && digest(raw.geometry.digest) && raw.geometry.units === "mm"
    && raw.geometry.frame === "right-handed-z-up" && ["live", "snapshot", "unavailable"].includes(String(raw.geometry.availability))
    ? { digest: raw.geometry.digest, availability: raw.geometry.availability as "live" | "snapshot" | "unavailable" } : null;
  const outputs: CadOutput[] = objects(raw.outputs).flatMap(output => {
    if (!id(output.id) || (output.kind !== "png" && output.kind !== "step")
      || !["pending", "ready", "unavailable", "error"].includes(String(output.status))) return [];
    const image = output.status === "ready" && output.kind === "png" ? ref(output.image) : null;
    let photo = null;
    if (image) { try { photo = snapshotVersion(catalog.assets, image); } catch { /* Asset event may arrive after the record. */ } }
    const annotations = object(output.annotations) ? output.annotations : {};
    return [{ id: output.id, kind: output.kind, status: output.status as CadOutput["status"], image, photo,
      file: output.status === "ready" ? file(output.file, catalog.sessionId) : null,
      annotations: { inline: annotations.inline === true,
        file: output.status === "ready" && annotations.status === "ready" ? file(annotations.file, catalog.sessionId) : null },
      views: Array.isArray(output.views) ? output.views : [],
      reason: object(output.reason) && string(output.reason.message) ? output.reason.message : null }];
  });
  const images = raw.images.flatMap(value => { const image = ref(value); return image ? [image] : []; });
  const modelFile = file(raw.model, catalog.sessionId);
  // A preview can only open the exact STEP that was requested and published for this revision.
  const model = modelFile && object(raw.model) && modelFile.format === "step" && modelFile.mediaType === "model/step"
    && revision && geometry && raw.model.revisionId === revision.id && raw.model.geometryDigest === geometry.digest
    && raw.model.units === "mm" && raw.model.frame === "right-handed-z-up"
    && outputs.some(output => output.kind === "step" && output.status === "ready" && output.file?.id === modelFile.id
      && output.file.sha256 === modelFile.sha256 && output.file.sizeBytes === modelFile.sizeBytes
      && objects(raw.requestedOutputs).some(request => request.id === output.id && request.kind === "step"))
    ? { id: modelFile.id, name: modelFile.filename, url: modelFile.url, format: "step" as const,
      downloadUrl: modelFile.downloadUrl, sha256: modelFile.sha256, sizeBytes: modelFile.sizeBytes,
      revisionId: revision.id, evaluationId: string(raw.evaluationId) ? raw.evaluationId : undefined } : null;
  const metrics: CadMetric[] = objects(raw.metrics).flatMap(metric => {
    if (!string(metric.id) || !string(metric.kind) || !object(metric.target) || !string(metric.unit)
      || !["measured", "pass", "fail", "unavailable", "error"].includes(String(metric.status))) return [];
    return [{ id: metric.id, kind: metric.kind, target: metric.target, unit: metric.unit,
      status: metric.status as CadMetric["status"], value: metric.value,
      method: string(metric.method) ? metric.method : "", frame: string(metric.frame) ? metric.frame : "",
      axis: string(metric.axis) ? metric.axis : undefined, criterion: metric.criterion, difference: metric.difference }];
  });
  const budget = object(raw.budget) && number(raw.budget.evaluations) && (raw.budget.maxEvaluations === null || number(raw.budget.maxEvaluations))
    && number(raw.budget.elapsedSeconds) && (raw.budget.maxSeconds === null || number(raw.budget.maxSeconds))
    ? { evaluations: raw.budget.evaluations, maxEvaluations: raw.budget.maxEvaluations,
      elapsedSeconds: raw.budget.elapsedSeconds, maxSeconds: raw.budget.maxSeconds } : null;
  const downloads = objects(raw.downloads).flatMap(value => {
    const candidate = file(value, catalog.sessionId);
    return candidate && outputs.some(output => output.status === "ready" && [output.file, output.annotations.file].some(
      ready => ready?.id === candidate.id && ready.sha256 === candidate.sha256 && ready.sizeBytes === candidate.sizeBytes)) ? [candidate] : [];
  });
  const result: CadResult = { operationId: raw.operationId, operationVersion: raw.operationVersion,
    operationKind: raw.operationKind as CadResult["operationKind"], status: raw.status as CadStatus, phase: raw.phase,
    revision, geometry, evaluationId: string(raw.evaluationId) ? raw.evaluationId : null,
    publicationId: string(raw.publicationId) ? raw.publicationId : null, outputs, images, model, downloads, metrics, budget,
    interpretation: string(raw.interpretation) ? raw.interpretation : "",
    error: object(raw.error) && string(raw.error.message) ? raw.error.message : null,
    reuse: Object.fromEntries(Object.entries(object(raw.reuse) ? raw.reuse : {}).filter((entry): entry is [string, number] => number(entry[1]))),
    presentation: { messageMode: mode, index, count } };
  // Per-image cards share a publication; display only this card's selected immutable references.
  const orderedImages = images.flatMap(image => outputs.filter(output => output.image && sameVersion(image, output.image)));
  const visibleOutputs = [...orderedImages, ...outputs.filter(output => !output.image)];
  return { id: `tool-${call.toolCallId}`, type: "cad", title: raw.title, tool: call, result: { ...result, outputs: visibleOutputs },
    summary: `${revision ? `Revision ${revision.number} · ` : ""}${cadStatusLabels[result.status]}` };
}
