import { expect, test } from "@playwright/test";
import { copyFile, readFile, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  captureModel,
  canvasPixels,
  modelSources,
  pngPixels,
  ready,
  selectModel,
  openSections,
  viewer,
} from "./model-helpers";
import { databaseSnapshot, downloadCurrent, drawLine } from "./helpers";
import type { ModelProvenance } from "../src/features/models/types";

test("real STEP and STL render; presets, projection, orbit, pan, zoom and fit affect pixels", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/debug/models");
  const primary = await ready(page);
  await openSections(primary);
  await expect(primary).toContainText("84 triangles");
  const iso = await canvasPixels(page, primary);
  expect(iso.foreground).toBeGreaterThan(5000);
  expect(iso.foreground).toBeLessThan(iso.width * iso.height * 0.7);
  await primary.getByRole("button", { name: "Front", exact: true }).click();
  expect((await canvasPixels(page, primary)).digest).not.toBe(iso.digest);
  for (const preset of [
    "Back",
    "Left",
    "Right",
    "Top",
    "Bottom",
    "Isometric",
  ]) {
    await primary.getByRole("button", { name: preset, exact: true }).click();
    expect((await canvasPixels(page, primary)).foreground).toBeGreaterThan(
      iso.width * iso.height * 0.01,
    );
  }
  await primary.getByLabel("Projection").selectOption("orthographic");
  const orthographic = await canvasPixels(page, primary);
  expect(orthographic.digest).not.toBe(iso.digest);
  await primary.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect((await canvasPixels(page, primary)).foreground).toBeGreaterThan(
    orthographic.foreground,
  );
  await primary.getByRole("button", { name: "Fit model" }).click();
  const fitted = await canvasPixels(page, primary);
  const canvas = primary.locator("canvas");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  expect((await canvasPixels(page, primary)).digest).not.toBe(fitted.digest);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 85,
    box.y + box.height / 2 + 40,
    { steps: 10 },
  );
  await page.mouse.up();
  const orbited = await canvasPixels(page, primary);
  expect(orbited.digest).not.toBe(fitted.digest);
  await page.mouse.wheel(0, -160);
  expect((await canvasPixels(page, primary)).foreground).toBeGreaterThan(
    orbited.foreground,
  );
  await selectModel(page, "folder:bracket.stl");
  await ready(page);
  await expect(primary).toContainText("20 triangles");
  expect((await canvasPixels(page, primary)).foreground).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});

test("independent section planes move, flip, disable, remove and survive camera changes", async ({
  page,
}) => {
  await page.goto("/debug/models");
  await ready(page);
  await selectModel(page, "folder:bracket.stl");
  const primary = await ready(page);
  await openSections(primary);
  await primary.getByLabel("Show section planes").uncheck();
  const original = await canvasPixels(page, primary);
  await primary.getByRole("button", { name: "Add X plane" }).click();
  const cut = await canvasPixels(page, primary);
  expect(cut.foreground).toBeLessThan(original.foreground);
  expect(cut.foreground).toBeGreaterThan(1000);
  await primary.getByLabel("X position (mm)").fill("5");
  const moved = await canvasPixels(page, primary);
  expect(moved.digest).not.toBe(cut.digest);
  await primary.getByLabel("X position (mm)").fill("");
  await primary.getByLabel("X position (mm)").pressSequentially("-2.5");
  await expect(primary.getByLabel("X position (mm)")).toHaveValue("-2.5");
  await primary.getByLabel("X plane slider").focus();
  await primary.getByLabel("X plane slider").press("ArrowRight");
  await expect(primary.getByLabel("X position (mm)")).not.toHaveValue("-2.5");
  await primary.getByLabel("X position (mm)").fill("5");
  await primary.getByRole("button", { name: "Flip X" }).click();
  expect((await canvasPixels(page, primary)).digest).not.toBe(moved.digest);
  await primary.getByLabel("Enable X plane").uncheck();
  // Compositor screenshots can include a subpixel edge after scrolling to the controls.
  expect(
    Math.abs(
      (await canvasPixels(page, primary)).foreground - original.foreground,
    ),
  ).toBeLessThan(original.foreground * 0.015);
  await primary.getByLabel("Enable X plane").check();
  await primary.getByRole("button", { name: "Add Y plane" }).click();
  await primary.getByRole("button", { name: "Add Z plane" }).click();
  await primary.getByLabel("Y position (mm)").fill("2");
  await primary.getByRole("button", { name: "Top", exact: true }).click();
  await expect(primary.getByLabel("X position (mm)")).toHaveValue("5");
  await expect(primary.getByLabel("Y position (mm)")).toHaveValue("2");
  await expect(primary.getByLabel("Z position (mm)")).toHaveValue("5");
  await primary.getByRole("button", { name: "Remove X" }).click();
  await expect(
    primary.getByRole("button", { name: "Add X plane" }),
  ).toBeEnabled();
  await expect(primary.getByLabel("Enable Y plane")).toBeChecked();
});

test("frozen model pixels and provenance enter shared annotation, unsaved PNG download and persisted lineage", async ({
  page,
}) => {
  await page.goto("/debug/models");
  const primary = await ready(page);
  await openSections(primary);
  await primary.getByLabel("Projection").selectOption("orthographic");
  await primary.getByRole("button", { name: "Add Z plane" }).click();
  const rendered = await canvasPixels(page, primary);
  const dimensions = await primary
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => ({
      width: canvas.width,
      height: canvas.height,
    }));
  await captureModel(page);
  const before = (await modelSources(page))[0]!;
  expect(before.origin).toBe("model");
  expect(before.model).toMatchObject({
    sha256: "370c5474e50dc94923f0dacb5113f7258233601620ab530d937c18571869d49e",
    format: "step",
    byteLength: 20532,
    camera: { projection: "orthographic" },
    coordinates: { units: "mm", frame: "right-handed Z-up" },
    sections: [{ axis: "z", enabled: true, flipped: false }],
    capture: dimensions,
  });
  const frozenPixels = await pngPixels(page, before.base64);
  expect(Math.abs(frozenPixels.foreground - rendered.foreground)).toBeLessThan(
    // Browser screenshots resample a fractional CSS canvas; PNG export uses native pixels.
    rendered.foreground * 0.04,
  );
  expect(frozenPixels.foreground).toBeGreaterThan(2000);
  await drawLine(page, { x: 40, y: 70 }, { x: 260, y: 70 });
  const download = await downloadCurrent(page);
  const edited = await pngPixels(
    page,
    (await readFile((await download.path())!)).toString("base64"),
  );
  expect(edited.red).toBeGreaterThan(500);
  expect(edited.digest).not.toBe(frozenPixels.digest);
  expect((await databaseSnapshot(page)).revisions).toHaveLength(0);
  await page
    .getByRole("button", { name: "Update this image", exact: true })
    .click();
  await expect(
    page.getByText(
      "Image updated in this browser. Previous saves are kept in history.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await primary.getByRole("button", { name: "Bottom", exact: true }).click();
  await primary.getByRole("button", { name: "Remove Z" }).click();
  await selectModel(page, "folder:bracket.stl");
  await ready(page);
  expect((await modelSources(page))[0]).toEqual(before);
  await page.reload();
  await ready(page);
  await expect(page.getByTestId("collection-image")).toContainText(
    "Model snapshot",
  );
  await page
    .getByRole("button", { name: "Image collection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Annotate rounded-cube.step snapshot.png" })
    .click();
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("0 marks");
  const restored = await downloadCurrent(page);
  expect(
    (
      await pngPixels(
        page,
        (await readFile((await restored.path())!)).toString("base64"),
      )
    ).digest,
  ).toBe(frozenPixels.digest);
  const db = await databaseSnapshot(page);
  expect(db.revisions).toHaveLength(1);
  expect(db.revisions[0]!.sourceId).toBe(before.id);
  expect((await modelSources(page))[0]).toEqual(before);
});

test("two viewers keep cameras, materials and sections independent through peer teardown", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1450, height: 1100 });
  await page.goto("/debug/models");
  await ready(page);
  await page.getByText("Gallery tools", { exact: true }).click();
  await page.getByLabel("Compare independent viewers").check();
  const primary = await ready(page);
  await openSections(primary);
  const second = await ready(page, "Comparison viewer");
  await openSections(second);
  await second.getByRole("button", { name: "Add X plane" }).click();
  await second.getByRole("button", { name: "Left", exact: true }).click();
  const untouched = await canvasPixels(page, second);
  expect(untouched.colors.x).toBeGreaterThan(1000);
  await primary.getByRole("button", { name: "Add X plane" }).click();
  await primary.getByLabel("Hatch solid sections").uncheck();
  await primary.getByLabel("Fill cut faces").uncheck();
  await primary.getByLabel("Show section planes").uncheck();
  await primary.getByLabel("Projection").selectOption("orthographic");
  await primary.getByRole("button", { name: "Top", exact: true }).click();
  expect((await canvasPixels(page, second)).digest).toBe(untouched.digest);
  await expect(
    second.getByRole("button", { name: "Add X plane" }),
  ).toBeDisabled();
  await expect(second.getByLabel("Projection")).toHaveValue("perspective");
  await expect(second.getByLabel("Fill cut faces")).toBeChecked();
  await expect(second.getByLabel("Show section planes")).toBeChecked();
  await expect(second.getByLabel("Hatch solid sections")).toBeChecked();
  await captureModel(page, "Comparison viewer");
  const frozen = (await modelSources(page))[0]!;
  expect(frozen.model?.sections).toMatchObject([
    { axis: "x", enabled: true, flipped: false },
  ]);
  expect(frozen.model?.sectionAppearance).toEqual({
    caps: true,
    guides: true,
    hatching: true,
  });
  expect(frozen.model?.camera.projection).toBe("perspective");
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await page.getByText("Gallery tools", { exact: true }).click();
  await page.getByRole("button", { name: "Hide primary viewer" }).click();
  await page.getByText("Gallery tools", { exact: true }).click();
  await expect(primary).toHaveCount(0);
  await second.getByRole("button", { name: "Add Z plane" }).click();
  await second.getByRole("button", { name: "Bottom", exact: true }).click();
  expect((await canvasPixels(page, second)).colors.z).toBeGreaterThan(1000);
  await expect(second).toHaveAttribute("data-state", "ready");
  await page.getByText("Gallery tools", { exact: true }).click();
  await page.getByRole("button", { name: "Show primary viewer" }).click();
  await page.getByText("Gallery tools", { exact: true }).click();
  await ready(page);
  await openSections(primary);
  await expect(
    primary.getByRole("button", { name: "Add X plane" }),
  ).toBeEnabled();
});

test("gallery refresh discovers additions, reloads changed bytes and reports missing/invalid models", async ({
  page,
}) => {
  const path = "tooling/.test-models/server/reload.stl";
  await copyFile("tooling/models/bracket.stl", path);
  try {
    await page.goto("/debug/models");
    await ready(page);
    await selectModel(page, "folder:reload.stl");
    await ready(page);
    await captureModel(page);
    const first = (await modelSources(page))[0]!;
    await page.getByRole("button", { name: "Close Annotate image" }).click();
    const changed = await readFile(path);
    changed[0] = 42;
    await writeFile(path, changed);
    await page.getByRole("button", { name: "Refresh & reload" }).click();
    await ready(page);
    await captureModel(page);
    const sources = await modelSources(page);
    expect(sources.map((source) => source.model?.sha256)).toContain(
      createHash("sha256").update(changed).digest("hex"),
    );
    expect(sources.find((source) => source.id === first.id)).toEqual(first);
    await page.getByRole("button", { name: "Close Annotate image" }).click();
    await unlink(path);
    await page.getByRole("button", { name: "Refresh & reload" }).click();
    await expect(viewer(page)).toHaveAttribute("data-state", "error");
    await expect(viewer(page).getByRole("alert")).toContainText("HTTP 404");
    await page.getByLabel("Choose model file", { exact: true }).setInputFiles({
      name: "invalid.step",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not a step model"),
    });
    await expect(viewer(page).getByRole("alert")).toContainText("not a STEP");
    await page.getByLabel("Choose model file", { exact: true }).setInputFiles({
      name: "invalid.stl",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("invalid STL"),
    });
    await expect(viewer(page)).toHaveAttribute("data-state", "error");
    await page
      .getByLabel("Choose model file", { exact: true })
      .setInputFiles("tooling/models/bracket.stl");
    await ready(page);
  } finally {
    await unlink(path).catch(() => undefined);
  }
});

test("context loss cancels in-flight WASM loading, ignores stale work, and retry recovers", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let pending = false;
  await page.route("**/*.wasm", async (route) => {
    pending = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue().catch(() => undefined);
  });
  await page.goto("/debug/models");
  await expect.poll(() => pending).toBe(true);
  await viewer(page)
    .locator("canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(viewer(page)).toHaveAttribute("data-state", "error");
  release?.();
  await page.unroute("**/*.wasm");
  await expect(viewer(page).getByRole("alert")).toContainText(
    "graphics context was lost",
  );
  await expect(
    viewer(page).getByRole("button", { name: "Snapshot & annotate" }),
  ).toBeDisabled();
  await viewer(page).getByRole("button", { name: "Retry model" }).click();
  const primary = await ready(page);
  await openSections(primary);
  expect((await canvasPixels(page, primary)).foreground).toBeGreaterThan(5000);
});

test("a delayed replaced source cannot overwrite the current model; route teardown releases workers and GPU resources", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { activeWorkers: 0, deletedBuffers: 0 };
    Object.assign(window, { viewerLifecycle: state });
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      ended = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.activeWorkers++;
      }
      terminate() {
        if (!this.ended) {
          this.ended = true;
          state.activeWorkers--;
        }
        super.terminate();
      }
    };
    const original = WebGL2RenderingContext.prototype.deleteBuffer;
    WebGL2RenderingContext.prototype.deleteBuffer = function (buffer) {
      state.deletedBuffers++;
      return original.call(this, buffer);
    };
  });
  let release: (() => void) | undefined;
  await page.route("**/__model_gallery/file?**", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.continue().catch(() => undefined);
  });
  await page.goto("/debug/models");
  await ready(page);
  await selectModel(page, "folder:bracket.stl");
  await expect.poll(() => !!release).toBe(true);
  await selectModel(page, "sample");
  await ready(page);
  await expect(
    page.locator('.model-tile[data-model-id="folder:bracket.stl"]'),
  ).toHaveAttribute("data-state", "unopened");
  release?.();
  await page.unroute("**/__model_gallery/file?**");
  await expect(viewer(page)).toContainText("84 triangles");
  await page.getByRole("link", { name: "Workshop", exact: true }).click();
  const lifecycle = await page.evaluate(
    () =>
      (
        window as unknown as {
          viewerLifecycle: { activeWorkers: number; deletedBuffers: number };
        }
      ).viewerLifecycle,
  );
  expect(lifecycle.activeWorkers).toBe(0);
  expect(lifecycle.deletedBuffers).toBeGreaterThan(0);
});

test("model gallery remains usable on a narrow viewport and is linked from the directory", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/debug");
  await page.getByRole("link", { name: /03 \/ INSPECT/ }).click();
  const primary = await ready(page);
  await openSections(primary);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await primary.getByRole("button", { name: "Add X plane" }).click();
  await primary.getByLabel("X position (mm)").fill("2");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await captureModel(page);
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeInViewport();
});

test("standalone Blob embedding needs no gallery or IndexedDB and preserves declared transform and supplied IDs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new Error("Standalone viewer must not use IndexedDB");
      },
    });
  });
  await page.route("**/__model_gallery/**", (route) => route.abort());
  await page.goto("/tooling/embedding.html");
  const embedded = await ready(page, "Embedded model");
  expect((await canvasPixels(page, embedded)).foreground).toBeGreaterThan(5000);
  await embedded.getByRole("button", { name: "Snapshot", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Frozen standalone view" }),
  ).toBeVisible();
  const context = JSON.parse(
    (await page.getByTestId("snapshot-context").textContent())!,
  ) as ModelProvenance;
  expect(context.source).toMatchObject({
    id: "embedding-example",
    artifactId: "example-artifact",
    revisionId: "example-revision",
    evaluationId: "example-evaluation",
  });
  expect(context.coordinates).toMatchObject({
    sourceUnits: "m",
    sourceUpAxis: "y",
    units: "mm",
    frame: "right-handed Z-up",
  });
  expect(context.coordinates.parserToViewer[0]).toBe(1000);
  expect(context.coordinates.parserToViewer[6]).toBeCloseTo(1000);
  expect(context.coordinates.parserToViewer[9]).toBeCloseTo(-1000);
  context.camera.target.forEach((value, axis) =>
    expect(value).toBeCloseTo([15000, -5000, 12000][axis]!, 8),
  );
  expect(context.sha256).toBe(
    createHash("sha256")
      .update(await readFile("tooling/models/bracket.stl"))
      .digest("hex"),
  );
  expect(errors).toEqual([]);
});
