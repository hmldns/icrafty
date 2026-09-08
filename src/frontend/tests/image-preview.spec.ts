import { expect, test } from "@playwright/test";
import { drawLine, uploadImage } from "./helpers";
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

test("an older pending preview cannot overwrite the thumbnail of a newer saved image", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  await uploadImage(page);
  await closeEditor(page);
  const source = (await savedImages(page)).sources[0]!;
  const card = collectionCard(page, source.id);
  await thumbnailPixels(page, card);
  const decoder = await page.evaluateHandle(() => {
    const original = window.createImageBitmap.bind(window);
    const pending: { release: () => void; closed: boolean }[] = [];
    window.createImageBitmap = async (
      source: ImageBitmapSource,
      options?: ImageBitmapOptions,
    ) => {
      const bitmap = await original(source, options);
      if (options?.resizeWidth) {
        await new Promise<void>((resolve) => {
          const task = { release: resolve, closed: false };
          pending.push(task);
          const close = bitmap.close.bind(bitmap);
          bitmap.close = () => {
            task.closed = true;
            close();
          };
        });
      }
      return bitmap;
    };
    return {
      count: () => pending.length,
      release: (index: number) => pending[index]!.release(),
      closed: () => pending.map((task) => task.closed),
    };
  });
  await card.getByRole("button", { name: /^Annotate / }).click();
  await drawLine(page);
  await updateImage(page);
  await expect.poll(() => decoder.evaluate((state) => state.count())).toBe(1);
  await addText(page, "Latest save");
  await updateImage(page);
  await expect.poll(() => decoder.evaluate((state) => state.count())).toBe(2);
  await closeEditor(page);
  await expect(card.locator("img")).toHaveCount(0);
  await expect(card).toContainText("Preparing preview…");
  await decoder.evaluate((state) => state.release(1));
  const latest = await thumbnailPixels(page, card);
  expect(latest.red).toBeGreaterThan(300);
  const currentVersion = await card
    .locator("img")
    .getAttribute("data-thumbnail-version");
  await decoder.evaluate((state) => state.release(0));
  await expect
    .poll(() => decoder.evaluate((state) => state.closed()))
    .toEqual([true, true]);
  expect((await thumbnailPixels(page, card)).digest).toBe(latest.digest);
  await expect(card.locator("img")).toHaveAttribute(
    "data-thumbnail-version",
    currentVersion!,
  );
  await decoder.dispose();
  const updated = await savedImages(page);
  expect(updated.revisions).toHaveLength(2);
  expect(
    updated.revisions.find((item) => item.id === currentVersion)!.marks,
  ).toHaveLength(2);
});

test("failed saved previews show an honest status while their annotated image still downloads", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  await uploadImage(page);
  await closeEditor(page);
  const source = (await savedImages(page)).sources[0]!;
  const card = collectionCard(page, source.id);
  await thumbnailPixels(page, card);
  await page.evaluate(() => {
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (
      source: ImageBitmapSource,
      options?: ImageBitmapOptions,
    ) => {
      if (options?.resizeWidth) throw new Error("Preview decoder unavailable");
      return original(source, options);
    };
  });
  await card.getByRole("button", { name: /^Annotate / }).click();
  await drawLine(page);
  await updateImage(page);
  await closeEditor(page);
  await expect(card).toContainText(
    "Preview unavailable · open image to inspect",
  );
  await expect(card.locator("img")).toHaveCount(0);
  expect((await collectionDownload(page, card)).red).toBeGreaterThan(1000);
});

test("the saved-history limit keeps every old version and permits a new editable copy", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  await uploadImage(page);
  await drawLine(page);
  await updateImage(page);
  await closeEditor(page);
  const before = await savedImages(page);
  const source = before.sources[0]!;
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("crafty-workspace", 1);
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction("revisions", "readwrite");
    const store = tx.objectStore("revisions");
    const request = store.getAll();
    request.onsuccess = () => {
      const original = request.result[0];
      for (let i = 1; i < 20; i++)
        store.add({
          ...original,
          id: `earlier-save-${i}`,
          createdAt: new Date(Date.parse(original.createdAt) + i).toISOString(),
        });
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  const history = (await savedImages(page)).revisions;
  expect(history).toHaveLength(20);
  await collectionCard(page, source.id)
    .getByRole("button", { name: /^Annotate / })
    .click();
  await addText(page, "Another idea");
  await page
    .getByRole("button", { name: "Update this image", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "20 saved versions",
  );
  expect((await savedImages(page)).revisions).toEqual(history);
  await saveCopy(page);
  const copied = await savedImages(page);
  expect(copied.sources).toHaveLength(2);
  expect(
    copied.revisions.filter((item) => item.sourceId === source.id),
  ).toEqual(history);
  expect(
    copied.sources.find((item) => item.id !== source.id)!.lineage
      ?.parentRevisionId,
  ).toBe("earlier-save-19");
  await expect(page.getByTestId("mark-count")).toHaveText("2 marks");
});
