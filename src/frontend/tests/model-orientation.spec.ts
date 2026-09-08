import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  captureModel,
  canvasPixels,
  modelSources,
  ready,
  selectModel,
} from "./model-helpers";
import type { ModelProvenance } from "../src/features/models/types";
import { downloadCurrent, drawLine } from "./helpers";
import {
  closeEditor,
  savedImages,
  saveCopy,
  updateImage,
  collectionCard,
  collectionDownload,
} from "./image-save-helpers";

const evidence = "tooling/.artifacts/orientation";
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

async function fullyInViewport(
  element: Locator,
  viewport: { width: number; height: number },
) {
  const box = (await element.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  return box;
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`section activation, scene tools and widget remain reachable in every dock at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/debug/models");
    const model = await ready(page);
    const canvas = await model.locator("canvas").elementHandle();
    const records = [];
    for (const placement of ["side", "top", "bottom"]) {
      await page.getByLabel("Tile placement").selectOption(placement);
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const name of [
        "Sections: off",
        "Section settings",
        "Show scene axes",
        "Show horizontal grid",
        "Fit model",
        "Snapshot & annotate",
      ]) {
        const button = model.getByRole("button", { name, exact: true });
        await fullyInViewport(button, viewport);
        await expect(button.locator("svg")).toHaveCount(1);
      }
      const widget = await fullyInViewport(
        model.getByRole("group", { name: "View orientation", exact: true }),
        viewport,
      );
      const stage = (await model.locator("canvas").boundingBox())!;
      expect(stage.height).toBeGreaterThan(260);
      expect(widget.width / stage.width).toBeLessThan(0.32);
      expect(await canvas!.evaluate((node) => node.isConnected)).toBe(true);
      records.push({
        placement,
        stage,
        widget,
        documentWidth: await page.evaluate(
          () => document.documentElement.scrollWidth,
        ),
      });
      await page.screenshot({
        path: `${evidence}/after-${viewport.width}-${placement}.png`,
      });
    }
    await model.getByRole("button", { name: "Sections: off" }).click();
    await expect(
      model.getByRole("button", { name: "Sections: on (1)" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(model.getByLabel("Enable X plane")).toBeChecked();
    await model.getByLabel("X position (mm)").fill("2.5");
    await model.getByLabel("X plane slider").focus();
    await page.keyboard.press("ArrowRight");
    await expect(model.getByLabel("X position (mm)")).not.toHaveValue("2.5");
    const position = await model.getByLabel("X position (mm)").inputValue();
    expect(position).not.toBe("2.5");
    await model.getByRole("button", { name: "Add Y plane" }).click();
    await model.getByLabel("Enable X plane").uncheck();
    await model.getByRole("button", { name: "Sections: on (1)" }).click();
    await expect(model.getByLabel("Enable Y plane")).not.toBeChecked();
    await model.getByRole("button", { name: "Sections: off" }).click();
    await expect(model.getByLabel("Enable X plane")).not.toBeChecked();
    await expect(model.getByLabel("Enable Y plane")).toBeChecked();
    await expect(model.getByLabel("X position (mm)")).toHaveValue(position);
    await model.getByRole("button", { name: "Section settings" }).click();
    await expect(
      model.getByRole("button", { name: "Sections: on (1)" }),
    ).toBeVisible();
    await selectModel(page, "solid-demo");
    await ready(page);
    await expect(
      model.getByRole("button", { name: "Sections: on (2)" }),
    ).toBeVisible();
    await model.getByRole("button", { name: "Section settings" }).click();
    await model.getByLabel("Show section planes").uncheck();
    await model.getByRole("button", { name: "Section settings" }).click();
    expect((await canvasPixels(page, model)).colors.reference).toBeGreaterThan(
      300,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${evidence}/solid-${viewport.width}.png` });
    await writeFile(
      `${evidence}/layout-${viewport.width}.json`,
      JSON.stringify(records, null, 2),
    );
  });
}

async function embeddedSnapshot(page: Page, model: Locator) {
  const previous = await page
    .getByTestId("snapshot-context")
    .textContent()
    .catch(() => null);
  await model.getByRole("button", { name: "Snapshot", exact: true }).click();
  await expect(page.getByTestId("snapshot-context")).not.toHaveText(
    previous ?? "",
  );
  return JSON.parse(
    (await page.getByTestId("snapshot-context").textContent())!,
  ) as ModelProvenance;
}

async function widgetMatchesCamera(model: Locator, context: ModelProvenance) {
  const matrix = context.camera.matrixWorld;
  for (const [index, axis] of ["x", "y", "z"].entries()) {
    const x = matrix[index]!;
    const y = matrix[index + 4]!;
    const endOn = Math.hypot(x, y) < 0.28;
    const styles = await model
      .locator(`.orientation-axis[data-axis="${axis}"][data-sign="1"]`)
      .evaluate((element) => ({
        x: parseFloat((element as HTMLElement).style.left) * 1.12,
        y: parseFloat((element as HTMLElement).style.top) * 1.12,
      }));
    expect(styles.x).toBeCloseTo(56 + (endOn ? 12 : x * 39), 3);
    expect(styles.y).toBeCloseTo(56 - y * 39, 3);
  }
}

test("real transformed STL: helpers preserve fit and camera, while widget follows orbit, presets, axis clicks and drag", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tooling/embedding.html");
  const model = await ready(page, "Embedded model");
  await model.getByRole("button", { name: "Snapshot", exact: true }).click();
  await expect(page.getByTestId("snapshot-context")).toBeAttached();
  const initial = await embeddedSnapshot(page, model);
  expect(initial.coordinates).toMatchObject({
    sourceUnits: "m",
    sourceUpAxis: "y",
    units: "mm",
    frame: "right-handed Z-up",
  });
  expect(initial.sceneAids).toMatchObject({
    axes: { visible: true, origin: [0, 0, 0], length: 37500 },
    grid: {
      visible: true,
      plane: "XY",
      center: [15000, -5000, -30],
      spacing: 5000,
      size: 100000,
    },
    orientationWidget: "excluded",
  });
  await widgetMatchesCamera(model, initial);
  const withAids = await canvasPixels(page, model);
  await model.getByRole("button", { name: "Show scene axes" }).click();
  const withGrid = await canvasPixels(page, model);
  expect(withGrid.digest).not.toBe(withAids.digest);
  await model.getByRole("button", { name: "Show horizontal grid" }).click();
  const bare = await canvasPixels(page, model);
  expect(bare.digest).not.toBe(withGrid.digest);
  const hidden = await embeddedSnapshot(page, model);
  expect(hidden.camera).toEqual(initial.camera);
  await model.getByRole("button", { name: "Fit model" }).click();
  const fitted = await embeddedSnapshot(page, model);
  fitted.camera.matrixWorld.forEach((value, index) =>
    expect(value).toBeCloseTo(initial.camera.matrixWorld[index]!, 8),
  );
  expect(fitted.camera.projectionMatrix).toEqual(
    initial.camera.projectionMatrix,
  );
  await expect(
    model.getByRole("group", { name: "View orientation", exact: true }),
  ).toBeVisible();
  await model
    .getByRole("button", { name: "View from +Z (top)", exact: true })
    .click();
  const top = await embeddedSnapshot(page, model);
  expect(top.camera.up).toEqual([0, 1, 0]);
  expect(top.camera.position[2]).toBeGreaterThan(top.camera.target[2]);
  expect(top.camera.position[0]).toBeCloseTo(top.camera.target[0], 5);
  await widgetMatchesCamera(model, top);
  await model
    .getByRole("button", { name: "View from −X (left)", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const left = await embeddedSnapshot(page, model);
  expect(left.camera.position[0]).toBeLessThan(left.camera.target[0]);
  await widgetMatchesCamera(model, left);
  await model.getByRole("button", { name: "Isometric", exact: true }).click();
  await model.locator("canvas").scrollIntoViewIfNeeded();
  const box = (await model.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * 0.45 + 70,
    box.y + box.height * 0.45 + 40,
    { steps: 6 },
  );
  await page.mouse.up();
  const orbit = await embeddedSnapshot(page, model);
  expect(orbit.camera.matrixWorld).not.toEqual(initial.camera.matrixWorld);
  await widgetMatchesCamera(model, orbit);
  const widget = model.getByRole("group", { name: "Rotate view", exact: true });
  await widget.scrollIntoViewIfNeeded();
  const widgetBox = (await widget.boundingBox())!;
  await page.mouse.move(widgetBox.x + 5, widgetBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(widgetBox.x + 45, widgetBox.y + 25, { steps: 8 });
  await page.mouse.up();
  const dragged = await embeddedSnapshot(page, model);
  expect(dragged.camera.matrixWorld).not.toEqual(orbit.camera.matrixWorld);
  expect(dragged.camera.target).toEqual(orbit.camera.target);
  await widgetMatchesCamera(model, dragged);
  await widget.focus();
  await page.keyboard.press("ArrowLeft");
  const keyed = await embeddedSnapshot(page, model);
  expect(keyed.camera.matrixWorld).not.toEqual(dragged.camera.matrixWorld);
  await widgetMatchesCamera(model, keyed);
  await model.getByLabel("Projection").selectOption("orthographic");
  await widgetMatchesCamera(model, await embeddedSnapshot(page, model));
  await model.locator("canvas").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidence}/embedded-transformed-stl.png` });
  expect(errors).toEqual([]);
});

test("scene aids, camera and section state survive docking and frozen evidence follows shared copy/update/export", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/debug/models");
  const model = await ready(page);
  await model.getByRole("button", { name: "Sections: off" }).click();
  await model.getByLabel("X position (mm)").fill("2.5");
  await model.getByRole("button", { name: "Section settings" }).click();
  await model.getByRole("button", { name: "Show horizontal grid" }).click();
  await model
    .getByRole("button", { name: "View from −X (left)", exact: true })
    .click();
  await captureModel(page);
  const original = (await modelSources(page))[0]!;
  expect(original.model!.sceneAids).toMatchObject({
    axes: { visible: true },
    grid: { visible: false },
    orientationWidget: "excluded",
  });
  await drawLine(page, { x: 50, y: 60 }, { x: 250, y: 60 });
  const unsaved = await downloadCurrent(page);
  await unsaved.saveAs(`${evidence}/annotated-unsaved.png`);
  expect((await savedImages(page)).revisions).toHaveLength(0);
  await saveCopy(page);
  const saved = await savedImages(page);
  const copy = saved.sources.find((source) => source.id !== original.id)!;
  expect(copy.model).toEqual(original.model);
  await drawLine(page, { x: 50, y: 95 }, { x: 250, y: 95 });
  await updateImage(page);
  const finalExport = await readFile(
    (await (await downloadCurrent(page)).path())!,
  );
  await page.screenshot({ path: `${evidence}/shared-annotation-updated.png` });
  await closeEditor(page);
  for (const placement of ["top", "bottom", "side"]) {
    await page.getByLabel("Tile placement").selectOption(placement);
    await expect(
      model.getByRole("button", { name: "Sections: on (1)" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      model.getByRole("button", { name: "Show horizontal grid" }),
    ).toHaveAttribute("aria-pressed", "false");
    const before = (await modelSources(page)).map((source) => source.id);
    await captureModel(page);
    const current = (await modelSources(page)).find(
      (source) => !before.includes(source.id),
    )!;
    expect(current.model!.camera.position).toEqual(
      original.model!.camera.position,
    );
    expect(current.model!.camera.target).toEqual(original.model!.camera.target);
    expect(current.model!.camera.up).toEqual(original.model!.camera.up);
    expect(current.model!.sections).toEqual(original.model!.sections);
    expect(current.model!.sceneAids).toEqual(original.model!.sceneAids);
    await closeEditor(page);
  }
  expect(
    (await modelSources(page)).find((source) => source.id === original.id),
  ).toEqual(original);
  await page.reload();
  await ready(page);
  await page
    .getByRole("button", { name: "Image collection", exact: true })
    .click();
  const card = collectionCard(page, copy.id);
  await card.getByRole("button", { name: /^Annotate / }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("2 marks");
  expect(await readFile((await (await downloadCurrent(page)).path())!)).toEqual(
    finalExport,
  );
  await closeEditor(page);
  expect((await collectionDownload(page, card)).digest).toBeTruthy();
});

test("two real viewer instances keep helper visibility and widget rotation independent through peer teardown", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1450, height: 1100 });
  await page.goto("/debug/models");
  await ready(page);
  await page.getByText("Gallery tools", { exact: true }).click();
  await page.getByLabel("Compare independent viewers").check();
  const primary = await ready(page);
  const second = await ready(page, "Comparison viewer");
  await page.getByText("Gallery tools", { exact: true }).click();
  const original = await canvasPixels(page, second);
  const positions = () =>
    second
      .locator(".orientation-axis")
      .evaluateAll((elements) =>
        elements.map((e) => (e as HTMLElement).style.cssText),
      );
  const before = await positions();
  await primary.getByRole("button", { name: "Show scene axes" }).click();
  await primary.getByRole("button", { name: "Show horizontal grid" }).click();
  await primary
    .getByRole("button", { name: "View from +Y (back)", exact: true })
    .click();
  expect((await canvasPixels(page, second)).digest).toBe(original.digest);
  expect(await positions()).toEqual(before);
  await expect(
    second.getByRole("button", { name: "Show scene axes" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".model-viewport canvas")).toHaveCount(2);
  await page.getByText("Gallery tools", { exact: true }).click();
  await page.getByRole("button", { name: "Hide primary viewer" }).click();
  await page.getByText("Gallery tools", { exact: true }).click();
  await second
    .getByRole("button", { name: "View from +Z (top)", exact: true })
    .click();
  expect(await positions()).not.toEqual(before);
  await second.getByRole("button", { name: "Sections: off" }).click();
  await expect(second.getByLabel("Enable X plane")).toBeChecked();
  await expect(second).toHaveAttribute("data-state", "ready");
  await page.screenshot({
    path: `${evidence}/independent-after-peer-dispose.png`,
  });
});
