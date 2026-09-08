import { expect, test } from "@playwright/test";
import {
  databaseSnapshot,
  downloadCurrent,
  drawLine,
  inspectDownload,
  uploadImage,
} from "./helpers";

test("downloads current marks repeatedly at original resolution without saving a revision", async ({
  page,
}) => {
  await page.goto("/camera");
  const original = await uploadImage(page);
  await page.getByLabel("Stroke width", { exact: true }).selectOption("12");
  await drawLine(page);
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  const first = await downloadCurrent(page);
  const pixels = await inspectDownload(page, first);
  expect(pixels).toMatchObject({
    width: 800,
    height: 600,
    line: [188, 64, 42, 255],
    untouched: [255, 255, 255, 255],
  });
  expect(pixels.redPixels).toBeGreaterThan(3000);
  expect(pixels.bluePixels).toBe(0);
  expect((await databaseSnapshot(page)).revisions).toHaveLength(0);

  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("radio", { name: "Blue", exact: true }).check();
  await page.getByLabel("Text label", { exact: true }).fill("24 mm opening");
  await page.getByRole("button", { name: "Place text in center" }).click();
  const second = await downloadCurrent(page);
  expect(second.suggestedFilename()).not.toBe(first.suggestedFilename());
  const secondPixels = await inspectDownload(page, second);
  expect(secondPixels.bluePixels).toBeGreaterThan(400);
  expect(secondPixels.redPixels).toBe(pixels.redPixels);
  const stored = await databaseSnapshot(page);
  expect(stored.sources).toHaveLength(1);
  expect(stored.sources[0]!.bytes).toEqual(Array.from(original.buffer));
  expect(stored.revisions).toHaveLength(0);
  await expect(
    page.getByText("Draft saved locally", { exact: true }),
  ).toBeVisible();
});

test("undo, redo, clear, save, restore and reopen preserve editable geometry and stable identities", async ({
  page,
}) => {
  await page.goto("/camera");
  await uploadImage(page);
  await drawLine(page);
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    page.getByText("Revision 1 saved in this browser."),
  ).toBeVisible();
  const initial = await databaseSnapshot(page);
  const sourceId = initial.sources[0]!.id;
  const revisionId = initial.revisions[0]!.id;
  expect(revisionId).not.toBe(sourceId);
  expect(initial.revisions[0]!.sourceId).toBe(sourceId);
  expect(initial.revisions[0]!.size).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await drawLine(page, { x: 100, y: 200 }, { x: 350, y: 300 });
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await drawLine(page, { x: 400, y: 220 }, { x: 700, y: 450 });
  await expect(page.getByTestId("mark-count")).toHaveText("3 marks");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("2 marks");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("3 marks");
  await page.getByRole("button", { name: "Clear marks", exact: true }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("0 marks");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("3 marks");
  await page.getByText("Source & saved revisions").click();
  await expect(page.getByTestId("source-id")).toHaveText(String(sourceId));
  await page
    .getByLabel("Saved revision", { exact: true })
    .selectOption(String(revisionId));
  await page.getByRole("button", { name: "Restore marks" }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("3 marks");
  await expect(
    page.getByText("Draft saved locally", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close Annotate image", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Annotate workpiece.png" }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("3 marks");
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
  const reloaded = await databaseSnapshot(page);
  expect(reloaded.sources[0]!.id).toBe(sourceId);
  expect(reloaded.revisions[0]!.id).toBe(revisionId);
  expect(reloaded.revisions[0]!.marks).toEqual(initial.revisions[0]!.marks);
  const downloaded = await inspectDownload(page, await downloadCurrent(page));
  expect(downloaded.redPixels).toBeGreaterThan(4000);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
});

test("keyboard history avoids typed text and zoom preserves image-space export", async ({
  page,
}) => {
  await page.goto("/camera");
  await uploadImage(page);
  await page.getByLabel("Canvas zoom").selectOption("0.5");
  await drawLine(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Text label", { exact: true }).fill("Keep this label");
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  await page.getByLabel("Image editing area.", { exact: false }).focus();
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("mark-count")).toHaveText("0 marks");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  const pixels = await inspectDownload(page, await downloadCurrent(page));
  expect(pixels.line).toEqual([188, 64, 42, 255]);
  expect(pixels.width).toBe(800);
});

test("narrow editor keeps the download action reachable and exports a point stroke", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/camera");
  await uploadImage(page);
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page
    .getByTestId("annotation-canvas")
    .click({ position: { x: 50, y: 50 } });
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  const pixels = await inspectDownload(page, await downloadCurrent(page));
  expect(pixels.redPixels).toBeGreaterThan(5);
  expect(pixels).toMatchObject({ width: 800, height: 600 });
});
