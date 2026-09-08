import {
  AlwaysStencilFunc,
  BackSide,
  Box3,
  BufferGeometry,
  Color,
  DecrementWrapStencilOp,
  DoubleSide,
  EdgesGeometry,
  FrontSide,
  Group,
  IncrementWrapStencilOp,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  Plane,
  PlaneGeometry,
  ReplaceStencilOp,
  Vector3,
} from "three";
import type { Axis, SectionAppearance, SectionPlane } from "./types";

export type SolidMesh = Mesh<BufferGeometry, MeshStandardMaterial>;
export type SectionColors = Record<Axis, Color>;

/** Visual caps follow the winding-count technique in Three.js's clipping stencil example.
 * https://threejs.org/examples/webgl_clipping_stencil.html
 * Each mesh/plane pair clears its stencil so separate solids cannot erase one another.
 */
export class SectionVisuals {
  readonly group = new Group();
  private materials: (MeshBasicMaterial | LineBasicMaterial)[] = [];
  private geometries: BufferGeometry[] = [];

  rebuild(
    solids: SolidMesh[],
    bounds: Box3,
    sections: readonly SectionPlane[],
    appearance: SectionAppearance,
    colors: SectionColors,
  ) {
    this.clear();
    const active = sections.filter((section) => section.enabled);
    const planes = active.map((section) => {
      const sign = section.flipped ? -1 : 1;
      const normal = new Vector3();
      normal[section.axis] = sign;
      return new Plane(normal, -section.position * sign);
    });
    const surfaceOrder = active.length * solids.length * 3 + 1;
    for (const solid of solids) {
      solid.material.clippingPlanes = planes;
      solid.material.needsUpdate = true;
      // The clipped surface renders after the caps and occludes hidden cut faces.
      solid.renderOrder = surfaceOrder;
    }
    const visualBounds = bounds.clone();
    for (const solid of solids) visualBounds.expandByObject(solid);
    const size = visualBounds.getSize(new Vector3());
    const center = visualBounds.getCenter(new Vector3());
    const minimumSize = size.length() * 0.05;
    active.forEach((section, planeIndex) => {
      const plane = planes[planeIndex]!;
      const position = center.clone();
      position[section.axis] = section.position;
      const geometry = new PlaneGeometry(1, 1);
      geometry.lookAt(plane.normal.clone().negate());
      geometry.scale(
        ...([size.x, size.y, size.z].map(
          (extent) => Math.max(extent, minimumSize) * 1.2,
        ) as [number, number, number]),
      );
      geometry.translate(position.x, position.y, position.z);
      this.geometries.push(geometry);
      if (appearance.caps) {
        solids.forEach((solid, solidIndex) => {
          const order = (planeIndex * solids.length + solidIndex) * 3 + 1;
          for (const [side, operation] of [
            [BackSide, IncrementWrapStencilOp],
            [FrontSide, DecrementWrapStencilOp],
          ] as const) {
            const material = new MeshBasicMaterial({
              side,
              depthTest: false,
              depthWrite: false,
              colorWrite: false,
              clippingPlanes: [plane],
              stencilWrite: true,
              stencilFunc: AlwaysStencilFunc,
              stencilFail: operation,
              stencilZFail: operation,
              stencilZPass: operation,
            });
            this.materials.push(material);
            // Geometry belongs to the source mesh. Only proxy materials are ours.
            const stencil = new Mesh(solid.geometry, material);
            stencil.matrixAutoUpdate = false;
            solid.updateMatrix();
            stencil.matrix.copy(solid.matrix);
            stencil.renderOrder = order;
            this.group.add(stencil);
          }
          const material = new MeshBasicMaterial({
            color: solid.userData.reference
              ? solid.material.color
              : colors[section.axis],
            side: DoubleSide,
            clippingPlanes: planes.filter((other) => other !== plane),
            stencilWrite: true,
            stencilRef: 0,
            stencilFunc: NotEqualStencilFunc,
            stencilFail: ReplaceStencilOp,
            stencilZFail: ReplaceStencilOp,
            stencilZPass: ReplaceStencilOp,
          });
          this.materials.push(material);
          const cap = new Mesh(geometry, material);
          cap.renderOrder = order + 1;
          cap.onAfterRender = (renderer) => renderer.clearStencil();
          this.group.add(cap);
        });
      }
      if (appearance.guides) {
        const guideMaterial = new MeshBasicMaterial({
          color: colors[section.axis],
          side: DoubleSide,
          transparent: true,
          opacity: 0.08,
          depthWrite: false,
          // Offset the translucent guide from its coplanar solid cap.
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const borderMaterial = new LineBasicMaterial({
          color: colors[section.axis],
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        });
        const edges = new EdgesGeometry(geometry);
        this.materials.push(guideMaterial, borderMaterial);
        this.geometries.push(edges);
        const guide = new Mesh(geometry, guideMaterial);
        guide.renderOrder = surfaceOrder + 1;
        const border = new LineSegments(edges, borderMaterial);
        border.renderOrder = surfaceOrder + 2;
        this.group.add(guide, border);
      }
    });
  }

  clear() {
    this.group.clear();
    this.materials.forEach((material) => material.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials = [];
    this.geometries = [];
  }
}
