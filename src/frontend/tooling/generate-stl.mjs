import { writeFile } from "node:fs/promises";
import { BoxGeometry, ExtrudeGeometry, Mesh, Path, Shape } from "three";
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

const block = new BoxGeometry(50, 40, 36);
const circle = new Shape();
circle.absarc(0, 0, 18, 0, Math.PI * 2, false);
const hole = new Path();
hole.absarc(0, 0, 9, 0, Math.PI * 2, true);
circle.holes.push(hole);
const sleeve = new ExtrudeGeometry(circle, {
  depth: 16,
  bevelEnabled: false,
  steps: 1,
  curveSegments: 48,
});
sleeve.translate(0, 0, -8);
for (const [name, fixture] of [
  ["solid-block", block],
  ["sleeve", sleeve],
]) {
  const bytes = new STLExporter().parse(new Mesh(fixture), { binary: true });
  await writeFile(
    new URL(`./models/${name}.stl`, import.meta.url),
    new Uint8Array(bytes.buffer),
  );
  fixture.dispose();
  console.log(`Generated tooling/models/${name}.stl for section-cap checks.`);
}
