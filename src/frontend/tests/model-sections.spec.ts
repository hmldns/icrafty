import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  canvasPixels,
  captureModel,
  modelSources,
  pngPixels,
  ready,
} from "./model-helpers";
import { downloadCurrent, drawLine } from "./helpers";

test("colored planes and solid cut faces reveal the inner sphere and freeze into shared annotation", async ({
  page,
}) => {
  await page.goto("/debug/models");
  await ready(page);
  await page
    .getByLabel("Model source", { exact: true })
    .selectOption("solid-demo");
  const primary = await ready(page);
  await expect(primary.getByLabel("Show section planes")).toBeChecked();
  await expect(primary.getByLabel("Fill cut faces")).toBeChecked();
  const guides = await canvasPixels(page, primary);
  await primary.getByLabel("Show section planes").uncheck();
  const filled = await canvasPixels(page, primary);
  expect(guides.foreground).toBeGreaterThan(filled.foreground + 1000);
  expect(filled.colors.x).toBeGreaterThan(1000);
  expect(filled.colors.z).toBeGreaterThan(1000);
  expect(filled.colors.reference).toBeGreaterThan(500);

  await primary.getByLabel("Fill cut faces").uncheck();
  const open = await canvasPixels(page, primary);
  expect(open.colors.x).toBeLessThan(10);
  expect(open.colors.z).toBeLessThan(10);
  expect(open.digest).not.toBe(filled.digest);
  await primary.getByLabel("Fill cut faces").check();
  await primary.getByLabel("X position (mm)").fill("-14");
  await primary.getByLabel("Z position (mm)").fill("-14");
  expect((await canvasPixels(page, primary)).colors.reference).toBe(0);
  await primary.getByLabel("X position (mm)").fill("0");
  await primary.getByLabel("Z position (mm)").fill("0");
  await primary.getByRole("button", { name: "Add Y plane" }).click();
  const allAxes = await canvasPixels(page, primary);
  for (const axis of ["x", "y", "z"] as const)
    expect(allAxes.colors[axis]).toBeGreaterThan(1000);
  expect(allAxes.colors.reference).toBeGreaterThan(500);

  await captureModel(page);
  const source = (await modelSources(page))[0]!;
  expect(source.model).toMatchObject({
    sha256: createHash("sha256")
      .update(await readFile("tooling/models/solid-block.stl"))
      .digest("hex"),
    source: { id: "synthetic:solid-block-with-reference" },
    sectionAppearance: { guides: false, caps: true },
    referenceObjects: [
      {
        kind: "sphere",
        label: "Inner sphere (demo reference)",
        center: [0, 0, 0],
        radius: 10,
      },
    ],
  });
  const frozen = await pngPixels(page, source.base64);
  for (const color of ["x", "y", "z", "reference"] as const) {
    expect(Math.abs(frozen.colors[color] - allAxes.colors[color])).toBeLessThan(
      allAxes.colors[color] * 0.04,
    );
  }
  await page.getByText("Source & saved revisions", { exact: false }).click();
  await expect(
    page.getByText("Inner sphere (demo reference) · supplemental geometry", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Filled cut faces · Plane guides hidden · Diagonal hatching",
      { exact: true },
    ),
  ).toBeVisible();
  await drawLine(page, { x: 40, y: 70 }, { x: 260, y: 70 });
  const download = await downloadCurrent(page);
  const edited = await pngPixels(
    page,
    (await readFile((await download.path())!)).toString("base64"),
  );
  expect(edited.red).toBeGreaterThan(frozen.red + 500);
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await primary.getByLabel("Fill cut faces").uncheck();
  await primary.getByRole("button", { name: "Remove X" }).click();
  expect((await modelSources(page))[0]).toEqual(source);
  await page.reload();
  await ready(page);
  expect((await modelSources(page))[0]).toEqual(source);
});

test("a filled section of a closed sleeve preserves its real through-hole", async ({
  page,
}) => {
  await page.goto("/debug/models");
  await ready(page);
  await page
    .getByLabel("Model source", { exact: true })
    .selectOption("folder:sleeve.stl");
  const primary = await ready(page);
  await primary.getByLabel("Show section planes").uncheck();
  await primary.getByLabel("Projection").selectOption("orthographic");
  await primary.getByRole("button", { name: "Add Z plane" }).click();
  await primary.getByRole("button", { name: "Bottom", exact: true }).click();
  const ring = await canvasPixels(page, primary);
  expect(ring.colors.z).toBeGreaterThan(20_000);
  expect(ring.centerDistance).toBeLessThan(4);
  await primary.getByLabel("Fill cut faces").uncheck();
  expect((await canvasPixels(page, primary)).colors.z).toBeLessThan(10);
  await primary.getByLabel("Fill cut faces").check();
  await primary.getByRole("button", { name: "Flip Z" }).click();
  await primary.getByRole("button", { name: "Top", exact: true }).click();
  const flipped = await canvasPixels(page, primary);
  expect(flipped.colors.z).toBeGreaterThan(20_000);
  expect(flipped.centerDistance).toBeLessThan(4);
});
