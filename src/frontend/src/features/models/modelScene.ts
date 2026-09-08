import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Sphere,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { canvasBlob } from "../images/imageIO";
import {
  SectionVisuals,
  type SolidMesh,
  type SectionColors,
} from "./sectionVisuals";
import {
  STEP_SETTINGS,
  type CameraState,
  type ImportedModel,
  type ModelProvenance,
  type ModelSnapshot,
  type ModelSource,
  type Projection,
  type SectionPlane,
  type SectionAppearance,
  type ReferenceSphere,
  type Vector3Tuple,
  type ViewPreset,
} from "./types";

const tuple = (value: Vector3): Vector3Tuple => [value.x, value.y, value.z];
const directions: Record<ViewPreset, Vector3Tuple> = {
  front: [0, -1, 0],
  back: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  isometric: [1, -1, 1],
};

/** Owns every GPU resource, listener, camera and clipping plane it creates. */
export class ModelScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private group = new Group();
  private camera: PerspectiveCamera | OrthographicCamera;
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private disposed = false;
  private sections: SectionPlane[] = [];
  private sectionAppearance: SectionAppearance = { guides: true, caps: true };
  private sectionVisuals = new SectionVisuals();
  private sectionColors: SectionColors;
  private referenceObjects: ReferenceSphere[] = [];
  private radius = 1;
  private orthoHeight = 2;
  private imported?: ImportedModel;
  private source?: ModelSource;
  private transform = new Matrix4();
  private width = 1;
  private height = 1;
  readonly bounds = new Box3();

  constructor(
    private canvas: HTMLCanvasElement,
    private onContextLost: () => void,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: false,
      stencil: true,
    });
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const styles = getComputedStyle(canvas);
    this.sectionColors = {
      x: new Color(
        styles.getPropertyValue("--color-section-x").trim() || "#c14e46",
      ),
      y: new Color(
        styles.getPropertyValue("--color-section-y").trim() || "#388266",
      ),
      z: new Color(
        styles.getPropertyValue("--color-section-z").trim() || "#466dbb",
      ),
    };
    this.scene.background = new Color(
      styles.getPropertyValue("--color-model-background").trim() || "#eeeee5",
    );
    this.scene.add(new AmbientLight(0xffffff, 2));
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(1, -2, 3);
    this.scene.add(light, this.group, this.sectionVisuals.group);
    this.camera = new PerspectiveCamera(40, 1, 0.01, 1000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(3, -3, 3);
    this.controls = this.makeControls();
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas.parentElement!);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    this.resize();
  }

  private contextLost = (event: Event) => {
    event.preventDefault();
    if (!this.disposed) this.onContextLost();
  };

  private makeControls() {
    const controls = new OrbitControls(this.camera, this.canvas);
    // Render only on change: no global animation loop, damping or shared keyboard listener.
    controls.listenToKeyEvents(this.canvas);
    controls.addEventListener("change", this.render);
    controls.minDistance = this.radius / 100;
    controls.maxDistance = this.radius * 100;
    controls.minZoom = 0.01;
    controls.maxZoom = 100;
    return controls;
  }

  private resize = () => {
    if (this.disposed) return;
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(this.width, this.height, false);
    this.updateProjection();
    this.render();
  };

  private updateProjection() {
    const aspect = this.width / this.height;
    if (this.camera instanceof PerspectiveCamera) this.camera.aspect = aspect;
    else {
      this.camera.top = this.orthoHeight / 2;
      this.camera.bottom = -this.orthoHeight / 2;
      this.camera.right = (this.orthoHeight * aspect) / 2;
      this.camera.left = -this.camera.right;
    }
    this.camera.updateProjectionMatrix();
  }

  render = () => {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  };

  setModel(imported: ImportedModel, source: ModelSource) {
    this.imported = imported;
    this.source = { ...source, identity: structuredClone(source.identity) };
    const scale =
      source.format === "stl"
        ? source.stlUnits === "m"
          ? 1000
          : source.stlUnits === "inch"
            ? 25.4
            : 1
        : 1;
    this.transform = new Matrix4()
      .makeRotationX(source.upAxis === "y" ? Math.PI / 2 : 0)
      .multiply(new Matrix4().makeScale(scale, scale, scale));
    const baseColor =
      getComputedStyle(this.canvas)
        .getPropertyValue("--color-model-surface")
        .trim() || "#87a89b";
    for (const model of imported.meshes) {
      const geometry = new BufferGeometry();
      // No geometry/material cache: two viewers never dispose or clip one another.
      const material = new MeshStandardMaterial({
        color: model.color ? new Color(...model.color) : new Color(baseColor),
        roughness: 0.65,
        metalness: 0.08,
        side: DoubleSide,
      });
      const mesh = new Mesh(geometry, material);
      this.group.add(mesh);
      geometry.setAttribute(
        "position",
        new BufferAttribute(model.positions, 3),
      );
      if (model.normals)
        geometry.setAttribute("normal", new BufferAttribute(model.normals, 3));
      if (model.indices)
        geometry.setIndex(new BufferAttribute(model.indices, 1));
      if (!model.normals) geometry.computeVertexNormals();
      geometry.applyMatrix4(this.transform);
      mesh.name = model.name;
    }
    this.bounds.setFromObject(this.group);
    const extent = this.bounds.getSize(new Vector3());
    if (
      this.bounds.isEmpty() ||
      ![...tuple(this.bounds.min), ...tuple(this.bounds.max)].every(
        Number.isFinite,
      ) ||
      extent.length() < 1e-8
    )
      throw new Error("The model has empty or unusable bounds.");
    this.radius = this.bounds.getBoundingSphere(new Sphere()).radius;
    this.camera.near = Math.max(this.radius / 1000, 0.000001);
    this.camera.far = this.radius * 1000;
    this.controls.minDistance = this.radius / 100;
    this.controls.maxDistance = this.radius * 100;
    this.controls.minZoom = 0.01;
    this.controls.maxZoom = 100;
    this.setView("isometric");
  }

  fit() {
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    this.controls.target.copy(this.bounds.getCenter(new Vector3()));
    const vertical = (40 * Math.PI) / 360;
    const horizontal = Math.atan(
      (Math.tan(vertical) * this.width) / this.height,
    );
    const distance =
      (this.radius / Math.sin(Math.min(vertical, horizontal))) * 1.12;
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(direction, distance);
    this.camera.zoom = 1;
    this.orthoHeight =
      (2.24 * this.radius) / Math.min(1, this.width / this.height);
    this.updateProjection();
    this.controls.update();
    this.render();
  }

  setView(preset: ViewPreset) {
    const target = this.controls.target.clone();
    this.controls.removeEventListener("change", this.render);
    this.controls.dispose();
    this.camera.up.set(0, 0, 1);
    // Top/bottom use +Y on the screen, avoiding an up-vector singularity.
    if (preset === "top" || preset === "bottom") this.camera.up.set(0, 1, 0);
    this.camera.position
      .copy(target)
      .add(new Vector3(...directions[preset]).multiplyScalar(this.radius * 3));
    this.controls = this.makeControls();
    this.controls.target.copy(target);
    this.controls.update();
    this.fit();
  }

  setProjection(projection: Projection) {
    if (
      this.camera instanceof PerspectiveCamera ===
      (projection === "perspective")
    )
      return;
    const previous = this.camera;
    const target = this.controls.target.clone();
    const camera =
      projection === "perspective"
        ? new PerspectiveCamera(
            40,
            this.width / this.height,
            previous.near,
            previous.far,
          )
        : new OrthographicCamera(-1, 1, 1, -1, previous.near, previous.far);
    camera.position.copy(previous.position);
    camera.up.copy(previous.up);
    camera.quaternion.copy(previous.quaternion);
    if (previous instanceof PerspectiveCamera)
      this.orthoHeight =
        (2 *
          previous.position.distanceTo(target) *
          Math.tan((previous.fov * Math.PI) / 360)) /
        previous.zoom;
    else
      camera.position.copy(target).add(
        previous.position
          .clone()
          .sub(target)
          .normalize()
          .multiplyScalar(
            this.orthoHeight /
              previous.zoom /
              (2 * Math.tan((40 * Math.PI) / 360)),
          ),
      );
    this.controls.removeEventListener("change", this.render);
    this.controls.dispose();
    this.camera = camera;
    this.controls = this.makeControls();
    this.controls.target.copy(target);
    this.controls.minDistance = this.radius / 100;
    this.controls.maxDistance = this.radius * 100;
    this.controls.minZoom = 0.01;
    this.controls.maxZoom = 100;
    this.updateProjection();
    this.controls.update();
    this.render();
  }

  zoom(factor: number) {
    if (this.camera instanceof OrthographicCamera)
      this.camera.zoom = Math.min(
        100,
        Math.max(0.01, this.camera.zoom * factor),
      );
    else {
      const offset = this.camera.position.clone().sub(this.controls.target);
      offset.setLength(
        Math.min(
          this.radius * 100,
          Math.max(this.radius / 100, offset.length() / factor),
        ),
      );
      this.camera.position.copy(this.controls.target).add(offset);
    }
    this.updateProjection();
    this.controls.update();
    this.render();
  }

  setSections(sections: SectionPlane[]) {
    this.sections = structuredClone(sections);
    this.sectionVisuals.rebuild(
      this.group.children as SolidMesh[],
      this.bounds,
      this.sections,
      this.sectionAppearance,
      this.sectionColors,
    );
    this.render();
  }

  setSectionAppearance(appearance: SectionAppearance) {
    this.sectionAppearance = { ...appearance };
    this.setSections(this.sections);
  }

  addReferenceObjects(objects: readonly ReferenceSphere[]) {
    this.referenceObjects = objects.map((object) => structuredClone(object));
    for (const object of objects) {
      if (
        !(object.radius > 0) ||
        !Number.isFinite(object.radius) ||
        !object.center.every(Number.isFinite)
      )
        throw new Error(
          "Reference sphere coordinates and radius must be finite, with a positive radius.",
        );
      const geometry = new SphereGeometry(object.radius, 48, 32);
      geometry.translate(...object.center);
      const material = new MeshStandardMaterial({
        color:
          getComputedStyle(this.canvas)
            .getPropertyValue("--color-model-reference")
            .trim() || "#d49724",
        roughness: 0.65,
        side: DoubleSide,
      });
      const mesh = new Mesh(geometry, material);
      mesh.name = object.label;
      mesh.userData.reference = true;
      this.group.add(mesh);
    }
  }

  private cameraState(): CameraState {
    this.camera.updateMatrixWorld();
    return {
      projection:
        this.camera instanceof PerspectiveCamera
          ? "perspective"
          : "orthographic",
      position: tuple(this.camera.position),
      target: tuple(this.controls.target),
      up: tuple(this.camera.up),
      near: this.camera.near,
      far: this.camera.far,
      zoom: this.camera.zoom,
      ...(this.camera instanceof PerspectiveCamera
        ? { fov: this.camera.fov }
        : {
            frustum: {
              left: this.camera.left,
              right: this.camera.right,
              top: this.camera.top,
              bottom: this.camera.bottom,
            },
          }),
      matrixWorld: this.camera.matrixWorld.toArray(),
      projectionMatrix: this.camera.projectionMatrix.toArray(),
    };
  }

  async snapshot(): Promise<ModelSnapshot> {
    if (!this.imported || !this.source || this.disposed)
      throw new Error("Load a model before taking a snapshot.");
    this.render();
    // Copy synchronously before any async encoding or future camera/section changes.
    const frozen = document.createElement("canvas");
    frozen.width = this.canvas.width;
    frozen.height = this.canvas.height;
    const context = frozen.getContext("2d");
    if (!context) throw new Error("The browser could not freeze this view.");
    context.drawImage(this.canvas, 0, 0);
    const source = this.source;
    const provenance: ModelProvenance = {
      version: 1,
      source: structuredClone(source.identity),
      format: source.format,
      sha256: this.imported.sha256,
      byteLength: this.imported.byteLength,
      importer: this.imported.importer,
      ...(source.format === "step"
        ? { tessellation: { ...STEP_SETTINGS } }
        : {}),
      coordinates: {
        sourceUnits:
          source.format === "step"
            ? "STEP file units"
            : (source.stlUnits ?? "mm"),
        sourceUpAxis: source.upAxis ?? "z",
        units: "mm",
        frame: "right-handed Z-up",
        parserToViewer: this.transform.toArray(),
        parserUnits:
          source.format === "step"
            ? "mm (OCCT conversion from file units)"
            : (source.stlUnits ?? "mm"),
      },
      camera: this.cameraState(),
      sections: structuredClone(this.sections),
      sectionAppearance: { ...this.sectionAppearance },
      ...(this.referenceObjects.length
        ? { referenceObjects: structuredClone(this.referenceObjects) }
        : {}),
      capture: {
        width: frozen.width,
        height: frozen.height,
        createdAt: new Date().toISOString(),
      },
    };
    return { png: await canvasBlob(frozen), provenance };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    this.controls.removeEventListener("change", this.render);
    this.controls.dispose();
    this.sectionVisuals.clear();
    this.group.children.forEach((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        (child.material as MeshStandardMaterial).dispose();
      }
    });
    this.group.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
