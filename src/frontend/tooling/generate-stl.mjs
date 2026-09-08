import { writeFile } from "node:fs/promises";
import { ExtrudeGeometry, Mesh, Shape } from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

// Synthetic asymmetric L-bracket fixture in mm, right-handed Z-up. No CAD claims.
const outline = new Shape();
outline.moveTo(0, 0);
for (const [x, y] of [
  [30, 0],
  [30, 8],
  [8, 8],
  [8, 24],
  [0, 24],
])
  outline.lineTo(x, y);
outline.closePath();
const geometry = new ExtrudeGeometry(outline, {
  depth: 10,
  bevelEnabled: false,
  steps: 1,
});
const stl = new STLExporter().parse(new Mesh(geometry), { binary: true });
await writeFile(
  new URL("./models/bracket.stl", import.meta.url),
  new Uint8Array(stl.buffer),
);
geometry.dispose();
console.log(
  "Generated tooling/models/bracket.stl (synthetic 30 × 24 × 10 mm L-bracket).",
);
