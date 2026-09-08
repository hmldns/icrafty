import { AxesHelper, Box3, Color, GridHelper, Group, Vector3 } from "three";
import type { SceneAids, SceneAidEvidence } from "./types";

/** A separate scene branch: never used for fitting, clipping or stencil caps. */
export class SceneHelpers {
  readonly group = new Group();
  private axes?: AxesHelper;
  private grid?: GridHelper;
  private spacing = 1;
  private size = 20;
  private length = 1;
  private visibility: SceneAids = { axes: true, grid: true };

  build(bounds: Box3, styles: CSSStyleDeclaration) {
    this.dispose();
    const extent = bounds.getSize(new Vector3());
    const span = Math.max(extent.x, extent.y, extent.z);
    // 1/2/5 decade spacing; bounded 20 × 20 cells for tiny or large sources.
    const raw = span / 10;
    const decade = 10 ** Math.floor(Math.log10(raw));
    this.spacing =
      ([1, 2, 5, 10].find((n) => n * decade >= raw) ?? 10) * decade;
    this.size = this.spacing * 20;
    this.length = span * 1.25;
    const token = (name: string, fallback: string) =>
      new Color(styles.getPropertyValue(name).trim() || fallback);
    this.axes = new AxesHelper(this.length);
    this.axes.setColors(
      token("--color-axis-x", "#86574e"),
      token("--color-axis-y", "#4f705d"),
      token("--color-axis-z", "#526c8c"),
    );
    this.grid = new GridHelper(
      this.size,
      20,
      token("--color-model-grid-major", "#aeb6ac"),
      token("--color-model-grid", "#c9cdc3"),
    );
    // Three's grid lies in XZ. Viewer coordinates are millimeters / Z-up.
    this.grid.rotation.x = Math.PI / 2;
    const center = bounds.getCenter(new Vector3());
    this.grid.position.set(
      Math.round(center.x / this.spacing) * this.spacing,
      Math.round(center.y / this.spacing) * this.spacing,
      bounds.min.z - span * 0.001,
    );
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.6;
    this.grid.material.depthWrite = false;
    this.group.add(this.grid, this.axes);
    this.setVisible(this.visibility);
  }

  setVisible(visibility: SceneAids) {
    this.visibility = { ...visibility };
    if (this.axes) this.axes.visible = visibility.axes;
    if (this.grid) this.grid.visible = visibility.grid;
  }

  evidence(): SceneAidEvidence {
    return {
      axes: {
        visible: this.visibility.axes,
        origin: [0, 0, 0],
        length: this.length,
      },
      grid: {
        visible: this.visibility.grid,
        plane: "XY",
        center: this.grid?.position.toArray() ?? [0, 0, 0],
        spacing: this.spacing,
        size: this.size,
      },
      orientationWidget: "excluded",
    };
  }

  dispose() {
    this.axes?.dispose();
    this.grid?.dispose();
    this.group.clear();
    this.axes = undefined;
    this.grid = undefined;
  }
}
