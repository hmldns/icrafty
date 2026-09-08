import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  captureModel,
  canvasPixels,
  modelSources,
  openSections,
  ready,
  selectModel,
} from "./model-helpers";
import {
  databaseSnapshot,
  downloadCurrent,
  drawLine,
  instrumentCamera,
  trackStates,
} from "./helpers";

const evidence = "tooling/.artifacts";
const placements = ["side", "top", "bottom"] as const;

async function measurements(page: Page) {
  return page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    document: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    },
    regions: Object.fromEntries(
      [
        ".site-header",
        ".workspace-header",
        ".model-catalog",
        ".model-tiles",
        ".model-viewport",
        ".model-section-panel:not([hidden])",
        ".camera-preview",
        ".camera-controls",
        ".intake-card",
        ".chat-history-scroll",
        ".chat-composer",
      ].map((selector) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        return [
          selector,
          box
            ? {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                bottom: box.bottom,
              }
            : null,
        ];
      }),
    ),
  }));
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`operational workspaces reclaim visible space and keep primary actions reachable at ${viewport.width}`, async ({
    page,
  }) => {
    await mkdir(evidence, { recursive: true });
    await page.setViewportSize(viewport);
    await instrumentCamera(page);
    const records: Record<
      string,
      Awaited<ReturnType<typeof measurements>>
    > = {};
    await page.goto("/debug/models");
    const primary = await ready(page);
    await expect(page.getByLabel("Tile placement")).toHaveValue(
      viewport.width > 900 ? "side" : "top",
    );
    for (const placement of placements) {
      await page.getByLabel("Tile placement").selectOption(placement);
      const canvas = primary.locator("canvas");
      const box = (await canvas.boundingBox())!;
      expect(box.y).toBeLessThan(viewport.width > 900 ? 390 : 530);
      expect(box.height).toBeGreaterThan(viewport.width > 900 ? 260 : 320);
      if (viewport.width > 900)
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      await expect(
        primary.getByRole("button", { name: "Snapshot & annotate" }),
      ).toBeInViewport();
      await expect(
        primary.getByRole("button", { name: "Sections: off", exact: true }),
      ).toBeInViewport();
      expect((await canvasPixels(page, primary)).foreground).toBeGreaterThan(
        5_000,
      );
      records[`models-${placement}`] = await measurements(page);
      await page.screenshot({
        path: `${evidence}/layout-after-models-${viewport.width}-${placement}.png`,
        fullPage: true,
      });
    }
    await page.getByLabel("Tile placement").selectOption("side");
    await selectModel(page, "solid-demo");
    await ready(page);
    await openSections(primary);
    await primary.getByLabel("X position (mm)").fill("-4");
    await primary.getByLabel("X plane slider").focus();
    await page.keyboard.press("ArrowRight");
    await expect(primary.getByLabel("X position (mm)")).not.toHaveValue("-4");
    await page.screenshot({
      path: `${evidence}/layout-after-sections-${viewport.width}.png`,
      fullPage: true,
    });

    await page.goto("/debug/camera");
    await expect(
      page.getByRole("button", { name: "Open camera", exact: true }),
    ).toBeInViewport();
    records.camera = await measurements(page);
    await page.screenshot({
      path: `${evidence}/layout-after-camera-${viewport.width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Open camera", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Start camera", exact: true }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Start camera", exact: true })
      .click();
    const capture = page.getByRole("button", {
      name: "Capture image",
      exact: true,
    });
    await expect(capture).toBeEnabled();
    await expect(capture).toBeInViewport();
    for (let i = 0; i < 3; i++) await capture.click();
    await expect(page.getByTestId("collection-image")).toHaveCount(3);
    await expect(capture).toBeInViewport();
    expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(1);
    records["camera-live"] = await measurements(page);
    await page.screenshot({
      path: `${evidence}/layout-after-camera-live-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "Chat", exact: true }).click();
    await expect.poll(() => trackStates(page)).toEqual(["ended"]);
    records.chat = await measurements(page);
    await page.screenshot({
      path: `${evidence}/layout-after-chat-${viewport.width}.png`,
      fullPage: true,
    });
    const history = page.getByRole("region", { name: "Conversation timeline" });
    await history.focus();
    await page.keyboard.press("End");
    await expect
      .poll(() => history.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const composer = page.getByRole("textbox", { name: "Message (optional)" });
    await composer.fill("Use this view of the cap.");
    await page.keyboard.press("Enter");
    await expect(composer).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Send", exact: true }),
    ).toBeInViewport();
    await expect(
      history.getByText("Use this view of the cap.", { exact: true }),
    ).toBeInViewport();
    for (const record of Object.values(records)) {
      expect(record.document.width).toBeLessThanOrEqual(viewport.width);
      if (viewport.width > 900)
        expect(record.document.height).toBe(viewport.height);
    }
    await writeFile(
      `${evidence}/layout-after-${viewport.width}.json`,
      JSON.stringify(records, null, 2),
    );
  });
}

test("docking preserves the live model, camera, sections and immutable annotated snapshots", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    Object.assign(window, { modelWorkerStarts: 0 });
    const Original = Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { modelWorkerStarts: number })
          .modelWorkerStarts++;
      }
    };
  });
  await page.goto("/debug/models");
  const primary = await ready(page);
  const galleryTools = page.getByText("Gallery tools", { exact: true });
  await galleryTools.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Model source", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(galleryTools).toBeFocused();
  await expect(
    page.getByLabel("Model source", { exact: true }),
  ).not.toBeVisible();
  await openSections(primary);
  await primary.getByRole("button", { name: "Add Z plane" }).click();
  await primary.getByLabel("Z position (mm)").fill("2.5");
  await primary.getByRole("button", { name: "Flip Z", exact: true }).click();
  await primary.getByLabel("Show section planes").uncheck();
  await primary.getByLabel("Projection").selectOption("orthographic");
  await primary.getByRole("button", { name: "Back", exact: true }).click();
  await primary.getByRole("button", { name: "Zoom in", exact: true }).click();
  const canvas = await primary.locator("canvas").elementHandle();
  const starts = await page.evaluate(
    () =>
      (window as unknown as { modelWorkerStarts: number }).modelWorkerStarts,
  );
  await captureModel(page);
  const original = (await modelSources(page))[0]!;
  await drawLine(page, { x: 40, y: 50 }, { x: 260, y: 50 });
  const downloaded = await readFile(
    (await (await downloadCurrent(page)).path())!,
  );
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await page
    .getByRole("button", { name: "Image collection", exact: true })
    .click();
  await expect(
    page
      .locator(`[data-source-id="${original.id}"]`)
      .getByRole("button", { name: /^Annotate/ }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Image collection", exact: true }),
  ).toBeFocused();
  for (const placement of ["top", "bottom", "side"] as const) {
    await page.getByLabel("Tile placement").selectOption(placement);
    expect(
      await canvas!.evaluate(
        (node) =>
          node === document.querySelector('[aria-label="Model viewer"] canvas'),
      ),
    ).toBe(true);
    await expect(primary).toHaveAttribute("data-state", "ready");
    await expect(primary.getByLabel("Z position (mm)")).toHaveValue("2.5");
    await expect(
      primary.getByRole("button", { name: "Flip Z", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const previousIds = new Set(
      (await modelSources(page)).map((source) => source.id),
    );
    await captureModel(page);
    const next = (await modelSources(page)).find(
      (source) => !previousIds.has(source.id),
    )!;
    const sameView = (model: NonNullable<typeof original.model>) => ({
      source: model.source,
      sha: model.sha256,
      sections: model.sections,
      appearance: model.sectionAppearance,
      position: model.camera.position,
      target: model.camera.target,
      up: model.camera.up,
      world: model.camera.matrixWorld,
      zoom: model.camera.zoom,
      projection: model.camera.projection,
    });
    // Projection aspect/capture dimensions change with available space; pose and geometry do not.
    expect(sameView(next.model!)).toEqual(sameView(original.model!));
    await page.getByRole("button", { name: "Close Annotate image" }).click();
  }
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { modelWorkerStarts: number }).modelWorkerStarts,
    ),
  ).toBe(starts);
  expect(
    (await modelSources(page)).find((source) => source.id === original.id),
  ).toEqual(original);
  expect((await databaseSnapshot(page)).revisions).toHaveLength(0);
  await page.getByLabel("Tile placement").selectOption("bottom");
  await page.reload();
  await ready(page);
  await expect(page.getByLabel("Tile placement")).toHaveValue("bottom");
  await page
    .getByRole("button", { name: "Image collection", exact: true })
    .click();
  await page
    .locator(`[data-source-id="${original.id}"]`)
    .getByRole("button", { name: /^Annotate/ })
    .click();
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  expect(await readFile((await (await downloadCurrent(page)).path())!)).toEqual(
    downloaded,
  );
});

test("model tiles expose loading/errors, keyboard selection and bounded real previews with cleanup", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const stl = await readFile("tooling/models/bracket.stl");
  const entries = Array.from({ length: 26 }, (_, index) => ({
    path: `part-${index}.stl`,
    size: stl.length,
    format: "stl",
  }));
  await page.route("**/__model_gallery/catalog", (route) =>
    route.fulfill({ json: { entries } }),
  );
  let invalid = true;
  let release: (() => void) | undefined;
  await page.route("**/__model_gallery/file?**", async (route) => {
    if (invalid)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({
      contentType: "application/octet-stream",
      body: invalid ? Buffer.from("invalid STL") : stl,
    });
  });
  await page.addInitScript(() => {
    window.testUrls = { created: new Set(), revoked: new Set() };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      window.testUrls.created.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.testUrls.revoked.add(url);
      revoke(url);
    };
  });
  await page.goto("/debug/models");
  await ready(page);
  const sample = page.locator('.model-tile[data-model-id="sample"]');
  await expect(sample.locator("img")).toBeVisible();
  expect(
    await sample
      .locator("img")
      .evaluate((image: HTMLImageElement) => [
        image.naturalWidth,
        image.naturalHeight,
      ]),
  ).toEqual([192, 128]);
  await selectModel(page, "folder:part-0.stl");
  const bad = page.locator('.model-tile[data-model-id="folder:part-0.stl"]');
  await expect(bad).toHaveAttribute("data-state", "loading");
  await expect.poll(() => !!release).toBe(true);
  release!();
  await expect(bad).toHaveAttribute("data-state", "error");
  await expect(bad).toContainText("Could not load");
  invalid = false;
  await page.getByRole("button", { name: "Refresh & reload" }).click();
  await ready(page);
  await expect(bad.locator("img")).toBeVisible();
  await page.getByLabel("Tile placement").selectOption("top");
  await bad.focus();
  for (let index = 1; index < entries.length; index++) {
    const tile = page.locator(
      `.model-tile[data-model-id="folder:part-${index}.stl"]`,
    );
    await page.keyboard.press("Tab");
    await expect(tile).toBeFocused();
    if (index === 1)
      expect(
        await tile.evaluate((el) => getComputedStyle(el).outlineStyle),
      ).toBe("solid");
    await page.keyboard.press("Space");
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    await expect(tile).toHaveAttribute("data-state", "ready");
    await expect(tile.locator("img")).toHaveCount(1);
  }
  await expect(page.locator(".model-tile img")).toHaveCount(24);
  await expect(page.locator(".model-viewport canvas")).toHaveCount(1);
  expect(
    await page.locator(".model-tile-scroll").evaluate((el) => el.scrollLeft),
  ).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  expect(
    await page.evaluate(() =>
      [...window.testUrls.created].every((url) =>
        window.testUrls.revoked.has(url),
      ),
    ),
  ).toBe(true);
});
