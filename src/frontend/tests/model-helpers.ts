import { expect, type Locator, type Page } from "@playwright/test";
import type { ModelProvenance } from "../src/features/models/types";

export const viewer = (page: Page, label = "Model viewer") =>
  page.getByRole("region", { name: label, exact: true });
export async function ready(page: Page, label = "Model viewer") {
  const element = viewer(page, label);
  await expect(element).toHaveAttribute("data-state", "ready", {
    timeout: 25_000,
  });
  return element;
}

export async function canvasPixels(page: Page, region: Locator) {
  const bytes = await region.locator("canvas").screenshot();
  return pngPixels(page, bytes.toString("base64"));
}

export async function pngPixels(page: Page, base64: string) {
  return page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (value) => value.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const background = Array.from(pixels.slice(0, 4));
    let foreground = 0;
    let red = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      // Ignore the compositor's rounded crop border; the model stays well inside it.
      const x = (i / 4) % canvas.width;
      const y = Math.floor(i / 4 / canvas.width);
      if (x < 2 || y < 2 || x >= canvas.width - 2 || y >= canvas.height - 2)
        continue;
      if (
        Math.abs(pixels[i]! - background[0]!) +
          Math.abs(pixels[i + 1]! - background[1]!) +
          Math.abs(pixels[i + 2]! - background[2]!) >
        30
      )
        foreground++;
      if (pixels[i]! > 140 && pixels[i + 1]! < 100 && pixels[i + 2]! < 100)
        red++;
    }
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    return {
      width: canvas.width,
      height: canvas.height,
      foreground,
      red,
      digest,
    };
  }, base64);
}

export async function modelSources(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("crafty-workspace", 1);
      request.onsuccess = () => resolve(request.result);
    });
    const values = await new Promise<
      {
        id: string;
        origin: string;
        name: string;
        model?: ModelProvenance;
        blob: Blob;
      }[]
    >((resolve) => {
      const request = db.transaction("sources").objectStore("sources").getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return Promise.all(
      values.map(async ({ blob, ...source }) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return { ...source, base64: btoa(binary) };
      }),
    );
  });
}

export async function captureModel(page: Page, label = "Model viewer") {
  await viewer(page, label)
    .getByRole("button", { name: "Snapshot & annotate" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Annotate image" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
}
