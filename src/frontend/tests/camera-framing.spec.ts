import { expect, test } from "@playwright/test";
import {
  databaseSnapshot,
  downloadCurrent,
  drawLine,
  inspectDownload,
  trackStates,
} from "./helpers";

const shapes = [
  { id: "1:1", width: 1200, height: 1200 },
  { id: "4:3", width: 1600, height: 1200 },
  { id: "3:4", width: 900, height: 1200 },
  { id: "16:9", width: 1600, height: 900 },
  { id: "9:16", width: 675, height: 1200 },
];

for (const viewport of [
  { width: 1512, height: 982 },
  { width: 390, height: 844 },
  { width: 320, height: 700 },
]) {
  test(`camera defaults square and every frame fits ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/debug/camera");
    await page
      .getByRole("button", { name: "Open camera", exact: true })
      .click();
    const ratio = page.getByLabel("Aspect ratio", { exact: true });
    const preview = page.getByTestId("camera-preview");
    await expect(ratio).toHaveValue("1:1");
    for (const shape of shapes) {
      await ratio.selectOption(shape.id);
      const box = (await preview.boundingBox())!;
      expect(box.width / box.height).toBeCloseTo(shape.width / shape.height, 2);
      expect(box.height).toBeLessThanOrEqual(480.1);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      const start = await page
        .getByRole("button", { name: "Start camera", exact: true })
        .boundingBox();
      expect(start!.y + start!.height).toBeLessThanOrEqual(box.y + box.height);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
    }
  });
}

test("aspect choices crop preview and captured pixels together without reopening the camera", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.testCamera = { calls: [], streams: [] };
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.testCamera.calls.push(constraints ?? {});
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1200;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "rgb(40, 160, 70)";
      context.fillRect(0, 0, 1600, 1200);
      context.fillStyle = "rgb(220, 40, 30)";
      context.fillRect(0, 0, 200, 1200);
      context.fillStyle = "rgb(30, 80, 220)";
      context.fillRect(1400, 0, 200, 1200);
      context.fillStyle = "rgb(240, 190, 40)";
      context.fillRect(0, 0, 1600, 150);
      context.fillStyle = "rgb(180, 40, 160)";
      context.fillRect(0, 1050, 1600, 150);
      const stream = canvas.captureStream();
      window.testCamera.streams.push(stream);
      return stream;
    };
  });
  await page.goto("/debug/camera");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  const capture = page.getByRole("button", {
    name: "Capture image",
    exact: true,
  });
  await expect(capture).toBeEnabled();
  const previousIds = new Set();
  let squareId = "";
  for (const shape of shapes) {
    await page
      .getByLabel("Aspect ratio", { exact: true })
      .selectOption(shape.id);
    const preview = (await page.getByTestId("camera-preview").boundingBox())!;
    expect(preview.width / preview.height).toBeCloseTo(
      shape.width / shape.height,
      2,
    );
    await expect(page.getByLabel("Live camera preview")).toHaveCSS(
      "object-fit",
      "cover",
    );
    await capture.click();
    await expect(page.getByTestId("collection-image")).toHaveCount(
      previousIds.size + 1,
    );
    const collection = await databaseSnapshot(page);
    const source = collection.sources.find(
      (source) => !previousIds.has(source.id),
    )!;
    previousIds.add(source.id);
    if (shape.id === "1:1") squareId = String(source.id);
    expect(source).toMatchObject({ width: shape.width, height: shape.height });
    const colors = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const sample = (x: number, y: number) =>
        Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
      const samples = [
        sample(10, canvas.height / 2),
        sample(canvas.width - 10, canvas.height / 2),
        sample(canvas.width / 2, 10),
        sample(canvas.width / 2, canvas.height - 10),
      ];
      bitmap.close();
      return samples;
    }, source.bytes);
    const fullWidth = shape.id === "4:3" || shape.id === "16:9";
    const fullHeight = shape.id !== "16:9";
    const green = [40, 160, 70];
    const expected = [
      fullWidth ? [220, 40, 30] : green,
      fullWidth ? [30, 80, 220] : green,
      fullHeight ? [240, 190, 40] : green,
      fullHeight ? [180, 40, 160] : green,
    ];
    for (let index = 0; index < colors.length; index++) {
      for (let channel = 0; channel < 3; channel++) {
        expect(
          Math.abs(colors[index]![channel]! - expected[index]![channel]!),
        ).toBeLessThanOrEqual(4);
      }
    }
  }
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(1);
  expect(await trackStates(page)).toEqual(["live"]);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  await expect.poll(() => trackStates(page)).toEqual(["ended"]);

  await page
    .locator(`[data-source-id="${squareId}"]`)
    .getByRole("button", { name: /^Annotate / })
    .click();
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
  await drawLine(page);
  const png = await inspectDownload(page, await downloadCurrent(page));
  expect(png).toMatchObject({
    width: 1200,
    height: 1200,
    line: [188, 64, 42, 255],
  });
});
