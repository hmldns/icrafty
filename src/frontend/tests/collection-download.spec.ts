import { expect, test } from "@playwright/test";
import {
  databaseSnapshot,
  drawLine,
  inspectDownload,
  makeImage,
  uploadImage,
} from "./helpers";

test("collection downloads untouched images repeatedly without entering the editor", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  const original = await makeImage(page, "front.png", 640, 480);
  await page
    .getByLabel("Choose image files")
    .setInputFiles([original, await makeImage(page, "side.png")]);
  await expect(page.getByTestId("collection-image")).toHaveCount(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const button = page.getByRole("button", {
    name: "Download PNG for front.png",
    exact: true,
  });
  const firstEvent = page.waitForEvent("download");
  await button.click();
  const first = await firstEvent;
  expect(await first.failure()).toBeNull();
  const pixels = await inspectDownload(page, first);
  expect(pixels).toMatchObject({
    width: 640,
    height: 480,
    redPixels: 0,
    bluePixels: 0,
    line: [255, 255, 255, 255],
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(button).toBeEnabled();

  const secondEvent = page.waitForEvent("download");
  await button.focus();
  await page.keyboard.press("Enter");
  const second = await secondEvent;
  expect(second.suggestedFilename()).not.toBe(first.suggestedFilename());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const stored = await databaseSnapshot(page);
  expect(
    stored.sources.find((source) => source.name === "front.png")!.bytes,
  ).toEqual(Array.from(original.buffer));
  expect(stored.revisions).toHaveLength(0);

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await button.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test("collection downloads current draft marks after reload, including changes newer than a saved revision", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  const original = await uploadImage(page);
  await drawLine(page);
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    page.getByText("Revision 1 saved in this browser."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("radio", { name: "Blue", exact: true }).check();
  await page.getByLabel("Text label", { exact: true }).fill("24 mm opening");
  await page.getByRole("button", { name: "Place text in center" }).click();
  await expect(
    page.getByText("Draft saved locally", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await page.reload();

  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Download PNG for workpiece.png",
      exact: true,
    })
    .click();
  const pixels = await inspectDownload(page, await waiting);
  expect(pixels).toMatchObject({
    width: 800,
    height: 600,
    line: [188, 64, 42, 255],
  });
  expect(pixels.bluePixels).toBeGreaterThan(400);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const stored = await databaseSnapshot(page);
  expect(stored.sources[0]!.bytes).toEqual(Array.from(original.buffer));
  expect(stored.revisions).toHaveLength(1);
  expect(stored.revisions[0]!.marks).toHaveLength(1);
});

test("failed collection export shows an error and can be retried on the card", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  await uploadImage(page);
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  const decoder = await page.evaluateHandle(() => window.createImageBitmap);
  await page.evaluate(() => {
    window.createImageBitmap = async () => {
      throw new Error("Decode unavailable");
    };
  });
  const button = page.getByRole("button", {
    name: "Download PNG for workpiece.png",
    exact: true,
  });
  await button.click();
  await expect(page.getByRole("alert")).toContainText("could not be decoded");
  await expect(button).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate((original) => {
    window.createImageBitmap = original;
  }, decoder);
  await decoder.dispose();
  const waiting = page.waitForEvent("download");
  await button.click();
  expect(await (await waiting).failure()).toBeNull();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("leaving the collection cancels a pending export and releases the decoded bitmap", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  await uploadImage(page);
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  const pending = await page.evaluateHandle(() => {
    const original = window.createImageBitmap.bind(window);
    let release: (() => void) | undefined;
    let closed = false;
    window.createImageBitmap = async (source: ImageBitmapSource) => {
      const bitmap = await original(source);
      const close = bitmap.close.bind(bitmap);
      bitmap.close = () => {
        closed = true;
        close();
      };
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return bitmap;
    };
    return {
      ready: () => !!release,
      finish: () => release?.(),
      closed: () => closed,
    };
  });
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  const button = page.getByRole("button", {
    name: "Download PNG for workpiece.png",
    exact: true,
  });
  await button.click();
  await expect(button).toBeDisabled();
  await expect
    .poll(() => pending.evaluate((state) => state.ready()))
    .toBe(true);
  await page.getByRole("link", { name: "UI gallery", exact: true }).click();
  await pending.evaluate((state) => state.finish());
  await expect
    .poll(() => pending.evaluate((state) => state.closed()))
    .toBe(true);
  expect(downloads).toBe(0);
  await pending.dispose();
});
