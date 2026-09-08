export type ModelFormat = "step" | "stl";
export type Axis = "x" | "y" | "z";
export type Vector3Tuple = [number, number, number];
export type Projection = "perspective" | "orthographic";
export type ViewPreset =
  "front" | "back" | "left" | "right" | "top" | "bottom" | "isometric";

export interface ModelIdentity {
  id: string;
  name: string;
  uri?: string;
  artifactId?: string;
  revisionId?: string;
  evaluationId?: string;
}

/** Keep this object stable between renders. URL fetching uses CORS, without credentials. */
export interface ModelSource {
  data: Blob | string;
  format: ModelFormat;
  identity: ModelIdentity;
  /** STEP units come from its file; unitless STL defaults to millimeters. */
  stlUnits?: "mm" | "m" | "inch";
  /** Right-handed source axes; defaults to the CAD convention Z-up. */
  upAxis?: "z" | "y";
}

export interface SectionPlane {
  axis: Axis;
  position: number;
  flipped: boolean;
  enabled: boolean;
}

export interface SectionAppearance {
  guides: boolean;
  caps: boolean;
  /** Absent on earlier snapshots, which had plain filled sections. */
  hatching?: boolean;
}

/** Supplemental visual reference, in viewer millimeters/Z-up; not source-model geometry. */
export interface ReferenceSphere {
  kind: "sphere";
  label: string;
  center: Vector3Tuple;
  radius: number;
}

export interface CameraState {
  projection: Projection;
  position: Vector3Tuple;
  target: Vector3Tuple;
  up: Vector3Tuple;
  near: number;
  far: number;
  zoom: number;
  fov?: number;
  frustum?: { left: number; right: number; top: number; bottom: number };
  matrixWorld: number[];
  projectionMatrix: number[];
}

export interface ModelProvenance {
  version: 1;
  source: ModelIdentity;
  format: ModelFormat;
  sha256: string;
  byteLength: number;
  importer: string;
  tessellation?: {
    linearDeflection: number;
    angularDeflection: number;
    linearDeflectionType: "bounding_box_ratio";
  };
  coordinates: {
    sourceUnits: "STEP file units" | "mm" | "m" | "inch";
    sourceUpAxis: "z" | "y";
    units: "mm";
    frame: "right-handed Z-up";
    /** Column-major transform from parser output coordinates to viewer coordinates. */
    parserToViewer: number[];
    parserUnits: string;
  };
  camera: CameraState;
  sections: SectionPlane[];
  /** Absent on snapshots captured before visual caps/guides were supported. */
  sectionAppearance?: SectionAppearance;
  referenceObjects?: ReferenceSphere[];
  capture: { width: number; height: number; createdAt: string };
}

export interface ModelSnapshot {
  png: Blob;
  provenance: ModelProvenance;
}

/** Transport-neutral import boundary. A future GLB adapter can produce this DTO. */
export interface ModelMesh {
  name: string;
  positions: Float32Array<ArrayBuffer>;
  normals?: Float32Array<ArrayBuffer>;
  indices?: Uint32Array<ArrayBuffer>;
  color?: Vector3Tuple;
}

export interface ImportedModel {
  meshes: ModelMesh[];
  sha256: string;
  byteLength: number;
  importer: string;
}

export const MODEL_LIMITS = {
  bytes: 50 * 1024 * 1024,
  triangles: 2_000_000,
  timeoutMs: 60_000,
} as const;
export const STEP_SETTINGS = {
  linearUnit: "millimeter",
  linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.001,
  angularDeflection: 0.5,
} as const;
