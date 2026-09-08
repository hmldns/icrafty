import { expect, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

declare global {
  interface Window {
    testDraftBlocked: boolean;
    testCamera: {
      calls: MediaStreamConstraints[];
      streams: MediaStream[];
      release?: () => void;
    };
    testUrls: { created: Set<string>; revoked: Set<string> };
  }
}

export async function makeImage(
  page: Page,
  name = "workpiece.png",
  width = 800,
  height = 600,
) {
  const base64 = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      return canvas.toDataURL("image/png").split(",")[1]!;
    },
    { width, height },
  );
  return { name, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

export async function uploadImage(
  page: Page,
  name = "workpiece.png",
  width = 800,
  height = 600,
) {
  const file = await makeImage(page, name, width, height);
  await page.getByLabel("Choose image files").setInputFiles(file);
  await expect(
    page.getByRole("dialog", { name: "Annotate image" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
  return file;
}

export async function drawLine(
  page: Page,
  from = { x: 100, y: 120 },
  to = { x: 500, y: 120 },
) {
  const canvas = page.getByTestId("annotation-canvas");
  const dimensions = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(
    box.x + (from.x * box.width) / dimensions.width,
    box.y + (from.y * box.height) / dimensions.height,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + (to.x * box.width) / dimensions.width,
    box.y + (to.y * box.height) / dimensions.height,
    { steps: 10 },
  );
  await page.mouse.up();
}

export async function downloadCurrent(page: Page): Promise<Download> {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toMatch(/-annotated-.+\.png$/);
  expect(await download.failure()).toBeNull();
  await expect(
    page.getByRole("dialog", { name: "Annotate image" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
  return download;
}

export async function inspectDownload(page: Page, download: Download) {
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  return page.evaluate(async (base64) => {
    const blob = new Blob(
      [Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))],
      { type: "image/png" },
    );
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const pixel = (x: number, y: number) =>
      Array.from(context.getImageData(x, y, 1, 1).data);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let redPixels = 0;
    let bluePixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (
        data[index]! > 140 &&
        data[index + 1]! < 100 &&
        data[index + 2]! < 100
      )
        redPixels++;
      if (
        data[index]! < 100 &&
        data[index + 1]! < 150 &&
        data[index + 2]! > 150
      )
        bluePixels++;
    }
    const summary = {
      width: bitmap.width,
      height: bitmap.height,
      redPixels,
      bluePixels,
      line: pixel(250, 120),
      untouched: pixel(20, 20),
    };
    bitmap.close();
    return summary;
  }, bytes.toString("base64"));
}

export async function databaseSnapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("crafty-workspace", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (name: string) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [sources, drafts, revisions] = await Promise.all([
      read("sources"),
      read("drafts"),
      read("revisions"),
    ]);
    const originals = await Promise.all(
      sources.map(async (source) => ({
        id: source.id,
        name: source.name,
        origin: source.origin,
        width: source.width,
        height: source.height,
        bytes: Array.from(
          new Uint8Array(await (source.blob as Blob).arrayBuffer()),
        ),
      })),
    );
    db.close();
    return {
      sources: originals,
      drafts,
      revisions: revisions.map(({ id, sourceId, marks, png }) => ({
        id,
        sourceId,
        marks,
        size: (png as Blob).size,
      })),
    };
  });
}

export async function instrumentCamera(page: Page, delayed = false) {
  await page.addInitScript(
    ({ delayed }) => {
      window.testCamera = { calls: [], streams: [] };
      const original = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window.testCamera.calls.push(constraints ?? {});
        const stream = await original(constraints);
        window.testCamera.streams.push(stream);
        if (delayed)
          await new Promise<void>((resolve) => {
            window.testCamera.release = resolve;
          });
        return stream;
      };
    },
    { delayed },
  );
}

export async function trackStates(page: Page) {
  return page.evaluate(() =>
    window.testCamera.streams.flatMap((stream) =>
      stream.getTracks().map((track) => track.readyState),
    ),
  );
}
