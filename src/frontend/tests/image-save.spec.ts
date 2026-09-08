import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  downloadCurrent,
  drawLine,
  inspectDownload,
  makeImage,
  uploadImage,
} from "./helpers";
import { captureModel, pngPixels, ready } from "./model-helpers";
import {
  addText,
  closeEditor,
  collectionCard,
  collectionDownload,
  savedImages,
  saveCopy,
  thumbnailPixels,
  updateImage,
} from "./image-save-helpers";

const evidence = "tooling/.artifacts/image-save";
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test("real STEP snapshot saves a visible editable copy, then updates that same image without changing its source or older saves", async ({
  page,
}) => {
  await page.goto("/debug/models");
  const model = await ready(page);
  await model.getByRole("button", { name: "Add Z plane" }).click();
  await model.getByLabel("Projection").selectOption("orthographic");
  await captureModel(page);
  const before = await savedImages(page);
  const source = before.sources[0]!;
  expect(source.model).toMatchObject({
    format: "step",
    sections: [{ axis: "z" }],
  });
  const originalDownload = await downloadCurrent(page);
  const originalPixels = await pngPixels(
    page,
    (await readFile((await originalDownload.path())!)).toString("base64"),
  );
  await page.getByLabel("Stroke width", { exact: true }).selectOption("12");
  await drawLine(page);
  await addText(page, "CHECK THIS EDGE", "Vermilion");
  const draftDownload = await downloadCurrent(page);
  const draftPixels = await pngPixels(
    page,
    (await readFile((await draftDownload.path())!)).toString("base64"),
  );
  expect(draftPixels.red).toBeGreaterThan(2_000);
  expect((await savedImages(page)).sources).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Save as new image", exact: true }),
  ).toHaveClass(/button--primary/);
  const background = (element: HTMLElement) =>
    getComputedStyle(element).backgroundColor;
  expect(
    await page
      .getByRole("button", { name: "Save as new image", exact: true })
      .evaluate(background),
  ).not.toBe(
    await page
      .getByRole("button", { name: "Update this image", exact: true })
      .evaluate(background),
  );
  await saveCopy(page);
  await expect(page.getByTestId("mark-count")).toHaveText("2 marks");
  const copied = await savedImages(page);
  const copy = copied.sources.find((item) => item.id !== source.id)!;
  expect(copy.name).not.toBe(source.name);
  expect(copy.model).toEqual(source.model);
  expect(copy.hash).toBe(source.hash);
  expect(copy.lineage).toMatchObject({
    parentSourceId: source.id,
    rootSourceId: source.id,
  });
  expect(copied.sources.find((item) => item.id === source.id)).toEqual(source);
  expect(
    copied.drafts.find((item) => item.sourceId === source.id)!.history.present,
  ).toEqual([]);
  expect(
    copied.revisions.filter((item) => item.sourceId === source.id),
  ).toEqual([]);
  const firstSave = copied.revisions[0]!;
  expect(firstSave.marks).toHaveLength(2);
  expect(firstSave.marks.every((mark) => !!mark.outline)).toBe(true);
  await closeEditor(page);
  const sourceCard = collectionCard(page, source.id);
  const copyCard = collectionCard(page, copy.id);
  const sourceThumbnail = await thumbnailPixels(page, sourceCard);
  const copyThumbnail = await thumbnailPixels(page, copyCard);
  expect(sourceThumbnail.red).toBe(0);
  expect(copyThumbnail.red).toBeGreaterThan(100);
  expect(
    Math.max(copyThumbnail.width, copyThumbnail.height),
  ).toBeLessThanOrEqual(384);
  await expect(sourceCard).not.toContainText("Draft changes");
  expect((await collectionDownload(page, copyCard)).digest).toBe(
    draftPixels.digest,
  );
  await page
    .getByRole("region", { name: "Your image collection", exact: true })
    .screenshot({ path: `${evidence}/model-new-copy.png` });

  await copyCard.getByRole("button", { name: /^Annotate / }).click();
  expect(
    (await inspectDownload(page, await downloadCurrent(page))).redPixels,
  ).toBeGreaterThan(2_000);
  await page.getByText("Source & saved history").click();
  await page
    .getByRole("button", { name: "Restore original", exact: true })
    .click();
  expect(
    (
      await pngPixels(
        page,
        (
          await readFile((await (await downloadCurrent(page)).path())!)
        ).toString("base64"),
      )
    ).digest,
  ).toBe(originalPixels.digest);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await addText(page, "48 mm");
  const updatedDownload = await downloadCurrent(page);
  expect(
    (await inspectDownload(page, updatedDownload)).bluePixels,
  ).toBeGreaterThan(100);
  const updatedPixels = await pngPixels(
    page,
    (await readFile((await updatedDownload.path())!)).toString("base64"),
  );
  await updateImage(page);
  const updated = await savedImages(page);
  expect(updated.sources).toEqual(copied.sources);
  expect(updated.revisions.find((item) => item.id === firstSave.id)).toEqual(
    firstSave,
  );
  expect(
    updated.revisions.filter((item) => item.sourceId === copy.id),
  ).toHaveLength(2);
  await closeEditor(page);
  expect((await thumbnailPixels(page, copyCard)).digest).not.toBe(
    copyThumbnail.digest,
  );
  await page.reload();
  await ready(page);
  expect((await savedImages(page)).sources).toEqual(copied.sources);
  const reloadedThumbnail = await thumbnailPixels(page, copyCard);
  expect(reloadedThumbnail.red).toBeGreaterThan(100);
  expect((await thumbnailPixels(page, sourceCard)).digest).toBe(
    sourceThumbnail.digest,
  );
  expect((await collectionDownload(page, copyCard)).digest).toBe(
    updatedPixels.digest,
  );
  expect((await collectionDownload(page, sourceCard)).digest).toBe(
    originalPixels.digest,
  );
  await page
    .getByRole("region", { name: "Your image collection", exact: true })
    .screenshot({ path: `${evidence}/model-updated-reloaded.png` });
  await copyCard.getByRole("button", { name: /^Annotate / }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("3 marks");
  const reopened = await downloadCurrent(page);
  expect(
    (
      await pngPixels(
        page,
        (await readFile((await reopened.path())!)).toString("base64"),
      )
    ).digest,
  ).toBe(updatedPixels.digest);
  await page.screenshot({ path: `${evidence}/model-copy-editor.png` });
  await writeFile(
    `${evidence}/model-pixels.json`,
    JSON.stringify(
      {
        originalPixels,
        draftPixels,
        updatedPixels,
        sourceThumbnail,
        copyThumbnail,
        reloadedThumbnail,
        sourceId: source.id,
        copyId: copy.id,
      },
      null,
      2,
    ),
  );
});

test("imported image copy leaves an existing saved source unchanged and survives deleting its parent", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  await uploadImage(page);
  await drawLine(page);
  await updateImage(page);
  const before = await savedImages(page);
  const source = before.sources[0]!;
  const sourceSave = before.revisions[0]!;
  const savedDownload = await downloadCurrent(page);
  const savedPixels = await inspectDownload(page, savedDownload);
  await addText(page, "24 mm opening");
  await saveCopy(page);
  const state = await savedImages(page);
  const copy = state.sources.find((item) => item.id !== source.id)!;
  expect(copy.origin).toBe("file");
  expect(copy.hash).toBe(source.hash);
  expect(copy.lineage).toEqual({
    rootSourceId: source.id,
    parentSourceId: source.id,
    parentRevisionId: sourceSave.id,
  });
  expect(state.revisions.find((item) => item.id === sourceSave.id)).toEqual(
    sourceSave,
  );
  expect(
    state.drafts.find((item) => item.sourceId === source.id)!.history.present,
  ).toEqual(sourceSave.marks);
  const download = await downloadCurrent(page);
  const copyPixels = await inspectDownload(page, download);
  expect(copyPixels).toMatchObject({
    width: 800,
    height: 600,
    redPixels: savedPixels.redPixels,
  });
  expect(copyPixels.bluePixels).toBeGreaterThan(400);
  // Removing the editable text exposes only the original pen: there are no baked duplicate marks.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await inspectDownload(page, await downloadCurrent(page))).toEqual(
    savedPixels,
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await closeEditor(page);
  const parentCard = collectionCard(page, source.id);
  const copyCard = collectionCard(page, copy.id);
  const originalThumb = await thumbnailPixels(page, parentCard);
  const copyThumb = await thumbnailPixels(page, copyCard);
  expect(originalThumb.red).toBeGreaterThan(300);
  expect(copyThumb.digest).not.toBe(originalThumb.digest);
  await page
    .getByRole("region", { name: "Your image collection", exact: true })
    .screenshot({ path: `${evidence}/import-parent-and-copy.png` });
  await parentCard.getByRole("button", { name: /^Delete / }).click();
  await page.getByRole("button", { name: "Delete image", exact: true }).click();
  await page.reload();
  await expect(page.getByTestId("collection-image")).toHaveCount(1);
  expect((await thumbnailPixels(page, copyCard)).digest).toBe(copyThumb.digest);
  const png = await collectionDownload(page, copyCard);
  expect(png).toMatchObject({ width: 800, height: 600 });
  expect(png.digest).toBe(
    (
      await pngPixels(
        page,
        (await readFile((await download.path())!)).toString("base64"),
      )
    ).digest,
  );
  expect((await savedImages(page)).sources[0]).toEqual(copy);
});

test("failed copy and update saves roll back completely; retry and repeated pending clicks create one copy", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/debug/camera");
  await uploadImage(page);
  await drawLine(page);
  await expect(
    page.getByText("Draft saved locally", { exact: true }),
  ).toBeVisible();
  const before = await savedImages(page);
  const writer = await page.evaluateHandle(() => IDBObjectStore.prototype.add);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === "revisions")
        throw new DOMException("Test disk full", "QuotaExceededError");
      return original.call(this, value, key);
    };
  });
  for (const name of ["Save as new image", "Update this image"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "storage is full",
    );
    await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
    expect(await savedImages(page)).toEqual(before);
    expect(
      (await inspectDownload(page, await downloadCurrent(page))).redPixels,
    ).toBeGreaterThan(1000);
  }
  await page.evaluate((original) => {
    IDBObjectStore.prototype.add = original;
  }, writer);
  await writer.dispose();
  const pending = await page.evaluateHandle(() => {
    let release: (() => void) | undefined;
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      original.call(
        this,
        (blob) => {
          release = () => callback(blob);
        },
        type,
        quality,
      );
    };
    return {
      ready: () => !!release,
      finish: () => {
        HTMLCanvasElement.prototype.toBlob = original;
        release?.();
      },
    };
  });
  await page
    .getByRole("button", { name: "Save as new image", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect
    .poll(() => pending.evaluate((state) => state.ready()))
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Saving copy…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Update this image", exact: true }),
  ).toBeDisabled();
  expect(await savedImages(page)).toEqual(before);
  await pending.evaluate((state) => state.finish());
  await pending.dispose();
  await expect(
    page.getByText(
      "Saved as a new image. You are editing the copy; the source image is unchanged.",
    ),
  ).toBeVisible();
  const after = await savedImages(page);
  expect(after.sources).toHaveLength(2);
  expect(after.revisions).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("legacy IndexedDB images keep saved thumbnails, drafts and history; the image limit still permits updates", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  await uploadImage(page);
  await drawLine(page);
  await updateImage(page);
  await closeEditor(page);
  const before = await savedImages(page);
  const source = before.sources[0]!;
  // These are exactly the pre-change v1 records: no lineage or separate current-image field.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("crafty-workspace", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const tx = db.transaction("sources", "readwrite");
    const request = tx.objectStore("sources").getAll();
    request.onsuccess = () => {
      const original = request.result[0];
      for (let i = 1; i < 40; i++)
        tx.objectStore("sources").add({
          ...original,
          id: `legacy-${i}`,
          name: `Old image ${i}.png`,
        });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByTestId("collection-image")).toHaveCount(40);
  const card = collectionCard(page, source.id);
  expect((await thumbnailPixels(page, card)).red).toBeGreaterThan(300);
  await card.getByRole("button", { name: /^Annotate / }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  await addText(page, "Keep old data");
  await page
    .getByRole("button", { name: "Save as new image", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "40 images",
  );
  await updateImage(page);
  const after = await savedImages(page);
  expect(after.version).toBe(1);
  expect(after.sources).toHaveLength(40);
  expect(
    after.revisions.find((item) => item.id === before.revisions[0]!.id),
  ).toEqual(before.revisions[0]);
  expect(after.sources.find((item) => item.id === source.id)).toEqual(source);
  await closeEditor(page);
  await page.reload();
  expect((await thumbnailPixels(page, card)).red).toBeGreaterThan(300);
  expect((await collectionDownload(page, card)).red).toBeGreaterThan(1000);
});

test("thumbnail decodes are bounded and release pending bitmaps when leaving the collection", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  const decoder = await page.evaluateHandle(() => {
    const original = window.createImageBitmap.bind(window);
    const releases: (() => void)[] = [];
    let active = 0,
      maximum = 0,
      closed = 0;
    window.createImageBitmap = async (
      source: ImageBitmapSource,
      options?: ImageBitmapOptions,
    ) => {
      const bitmap = await original(source, options);
      if (options?.resizeWidth) {
        active += 1;
        maximum = Math.max(maximum, active);
        const close = bitmap.close.bind(bitmap);
        bitmap.close = () => {
          active -= 1;
          closed += 1;
          close();
        };
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
      }
      return bitmap;
    };
    return {
      stats: () => ({ active, maximum, closed }),
      finish: () => {
        for (const release of releases) release();
      },
    };
  });
  const files = [];
  for (let i = 0; i < 6; i++)
    files.push(await makeImage(page, `Photo ${i}.png`));
  await page.getByLabel("Choose image files").setInputFiles(files);
  await expect(page.getByTestId("collection-image")).toHaveCount(6);
  await expect
    .poll(() => decoder.evaluate((state) => state.stats().active))
    .toBe(2);
  await page.getByRole("link", { name: "Workshop", exact: true }).click();
  await decoder.evaluate((state) => state.finish());
  await expect
    .poll(() => decoder.evaluate((state) => state.stats()))
    .toEqual({ active: 0, maximum: 2, closed: 2 });
  await decoder.dispose();
});

for (const width of [390, 320]) {
  test(`${width}px editor keeps the three image actions visible and saves with the keyboard`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/debug/camera");
    await uploadImage(page);
    for (const name of [
      "Save as new image",
      "Update this image",
      "Download PNG",
    ])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeInViewport();
    await addText(page, "Check fit", "Vermilion");
    await expect(
      page.getByRole("button", { name: "Download PNG", exact: true }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Save as new image", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(
        "Saved as a new image. You are editing the copy; the source image is unchanged.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download PNG", exact: true }),
    ).toBeInViewport();
    expect(
      await page
        .getByRole("dialog")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: `${evidence}/image-actions-${width}.png` });
  });
}
