import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ANNOTATION_COLORS } from "../src/features/annotation/geometry";
import type { Mark } from "../src/features/images/types";
import { captureModel, modelSources, pngPixels, ready } from "./model-helpers";
import { databaseSnapshot, downloadCurrent, drawLine } from "./helpers";

const rgb = (hex: string) =>
  hex.match(/[a-f\d]{2}/gi)!.map((part) => parseInt(part, 16));
const luminance = (values: number[]) =>
  values
    .map((value) => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!,
      0,
    );
const contrast = (a: number[], b: number[]) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);

test("subtle section hatching toggles independently, preserves holes and keeps annotation contrast", async ({
  page,
}) => {
  await page.goto("/debug/models");
  await ready(page);
  await page
    .getByLabel("Model source", { exact: true })
    .selectOption("folder:sleeve.stl");
  const primary = await ready(page);
  const capColors = await primary.evaluate((element) =>
    ["x", "y", "z", "reference"].map((axis) =>
      getComputedStyle(element)
        .getPropertyValue(`--color-section-cap-${axis}`)
        .trim(),
    ),
  );
  for (const color of capColors) {
    for (const annotation of ANNOTATION_COLORS.filter(
      (entry) => entry.name !== "Paper",
    ))
      expect(contrast(rgb(color), rgb(annotation.value))).toBeGreaterThan(3.5);
  }
  await primary.getByLabel("Show section planes").uncheck();
  await primary.getByLabel("Projection").selectOption("orthographic");
  await primary.getByRole("button", { name: "Add Z plane" }).click();
  await primary.getByRole("button", { name: "Bottom", exact: true }).click();
  await expect(primary.getByLabel("Hatch solid sections")).toBeChecked();
  await captureModel(page);
  const hatched = (await modelSources(page))[0]!;
  expect(hatched.model?.sectionAppearance?.hatching).toBe(true);
  expect((await pngPixels(page, hatched.base64)).centerDistance).toBeLessThan(
    4,
  );
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await primary.getByLabel("Hatch solid sections").uncheck();
  await expect(primary.getByLabel("Fill cut faces")).toBeChecked();
  await captureModel(page);
  const plain = (await modelSources(page)).find(
    (source) => source.id !== hatched.id,
  )!;
  expect(plain.model?.sectionAppearance?.hatching).toBe(false);
  const difference = await page.evaluate(
    async ({ a, b }) => {
      const decode = async (base64: string) => {
        const image = await createImageBitmap(
          new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], {
            type: "image/png",
          }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        image.close();
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const [pattern, solid] = await Promise.all([decode(a), decode(b)]);
      let changed = 0,
        maxDelta = 0;
      const colors = new Set<string>();
      for (let i = 0; i < solid.length; i += 4) {
        if (solid[i] !== 217 || solid[i + 1] !== 212 || solid[i + 2] !== 226)
          continue;
        colors.add(Array.from(pattern.slice(i, i + 3)).join(","));
        const delta = Math.max(
          ...[0, 1, 2].map((c) => Math.abs(pattern[i + c]! - solid[i + c]!)),
        );
        if (delta > 2) changed++;
        maxDelta = Math.max(maxDelta, delta);
      }
      return {
        changed,
        maxDelta,
        colors: [...colors].map((color) => color.split(",").map(Number)),
      };
    },
    { a: hatched.base64, b: plain.base64 },
  );
  expect(difference.changed).toBeGreaterThan(1000);
  expect(difference.maxDelta).toBeLessThanOrEqual(16);
  for (const color of difference.colors) {
    for (const annotation of ANNOTATION_COLORS.filter(
      (entry) => entry.name !== "Paper",
    )) {
      expect(contrast(color, rgb(annotation.value))).toBeGreaterThanOrEqual(3);
    }
  }
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await primary.getByLabel("Fill cut faces").uncheck();
  await expect(primary.getByLabel("Hatch solid sections")).toBeDisabled();
  expect(
    (await modelSources(page)).find((source) => source.id === hatched.id),
  ).toEqual(hatched);
});

test("every model annotation color has a persisted contrast outline in preview, unsaved PNG and reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1050 });
  await page.goto("/debug/models");
  await ready(page);
  await page
    .getByLabel("Model source", { exact: true })
    .selectOption("solid-demo");
  const primary = await ready(page);
  await primary.getByLabel("Show section planes").uncheck();
  await primary.getByRole("button", { name: "Remove Z" }).click();
  await primary.getByRole("button", { name: "Right", exact: true }).click();
  await primary.getByLabel("Projection").selectOption("orthographic");
  await primary.getByRole("button", { name: "Zoom in", exact: true }).click();
  await primary.getByRole("button", { name: "Zoom in", exact: true }).click();
  await captureModel(page);
  const source = (await modelSources(page))[0]!;
  const { width, height } = source.model!.capture;
  const rows = ANNOTATION_COLORS.map((entry, index) => ({
    ...entry,
    y: Math.round(height / 2 - 80 + 40 * index),
  }));
  for (const row of rows) {
    await page.getByRole("radio", { name: row.name, exact: true }).check();
    await drawLine(
      page,
      { x: width / 2 - 150, y: row.y },
      { x: width / 2 + 150, y: row.y },
    );
  }
  await page.getByRole("radio", { name: "Paper", exact: true }).check();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await drawLine(page, { x: 40, y: 70 }, { x: 160, y: 130 });
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await drawLine(page, { x: 40, y: 210 }, { x: 160, y: 210 });
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await drawLine(page, { x: 100, y: 170 }, { x: 100, y: 170 });
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Text label").fill("Visible");
  await page.getByRole("button", { name: "Place text in center" }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("9 marks");
  const history = (await databaseSnapshot(page)).drafts[0]!.history as {
    present: Mark[];
  };
  expect(history.present).toHaveLength(9);
  for (const mark of history.present) {
    expect(mark.outline?.width).toBeGreaterThan(0);
    expect(
      contrast(rgb(mark.color), rgb(mark.outline!.color)),
    ).toBeGreaterThanOrEqual(4.5);
  }
  const live = await page
    .getByTestId("annotation-canvas")
    .evaluate(
      (canvas: HTMLCanvasElement) =>
        canvas.toDataURL("image/png").split(",")[1]!,
    );
  const download = await downloadCurrent(page);
  const exported = (await readFile((await download.path())!)).toString(
    "base64",
  );
  const pixels = await pngPixels(page, exported);
  expect(pixels.digest).toBe((await pngPixels(page, live)).digest);
  const visible = await page.evaluate(
    async ({ base64, lines, atX }) => {
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], {
          type: "image/png",
        }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const read = (x: number, y: number) =>
        Array.from(context.getImageData(x, y, 1, 1).data)
          .slice(0, 3)
          .join(",");
      const shapes = [
        { x: 35, y: 65, w: 130, h: 70 },
        { x: 35, y: 190, w: 130, h: 40 },
        { x: 94, y: 164, w: 12, h: 12 },
        {
          x: Math.round(canvas.width / 4),
          y: Math.round(canvas.height / 2),
          w: 150,
          h: 50,
        },
      ].map((rect) => {
        const data = context.getImageData(rect.x, rect.y, rect.w, rect.h).data;
        let paper = 0,
          ink = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255)
            paper++;
          if (data[i] === 37 && data[i + 1] === 41 && data[i + 2] === 35) ink++;
        }
        return { paper, ink };
      });
      return {
        shapes,
        lines: lines.map((line) => ({
          name: line.name,
          stripe: Array.from({ length: 19 }, (_, i) =>
            read(atX, line.y - 9 + i),
          ),
        })),
      };
    },
    { base64: exported, lines: rows, atX: Math.round(width / 2 + 100) },
  );
  for (const [index, line] of visible.lines.entries()) {
    expect(line.stripe).toContain(rgb(rows[index]!.value).join(","));
    expect(line.stripe).toContain(
      rgb(history.present[index]!.outline!.color).join(","),
    );
  }
  for (const shape of visible.shapes) {
    expect(shape.paper).toBeGreaterThan(8);
    expect(shape.ink).toBeGreaterThan(8);
  }
  expect((await databaseSnapshot(page)).revisions).toHaveLength(0);
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    page.getByText("Revision 1 saved in this browser."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await page.reload();
  await ready(page);
  await page
    .getByRole("button", {
      name: "Annotate Solid block + inner sphere demo snapshot.png",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("mark-count")).toHaveText("9 marks");
  const restored = await downloadCurrent(page);
  expect(
    (
      await pngPixels(
        page,
        (await readFile((await restored.path())!)).toString("base64"),
      )
    ).digest,
  ).toBe(pixels.digest);
  expect((await modelSources(page))[0]).toEqual(source);
});
