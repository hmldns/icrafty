import { expect, type Locator, type Page } from "@playwright/test";
import type {
  ImageDraft,
  Revision,
  SourceImage,
} from "../src/features/images/types";
import { pngPixels } from "./model-helpers";
import { readFile } from "node:fs/promises";

export const collectionCard = (page: Page, id: string) =>
  page.locator(`[data-testid="collection-image"][data-source-id="${id}"]`);

export async function savedImages(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("crafty-workspace", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = <T>(name: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [sources, drafts, revisions] = await Promise.all([
      read<SourceImage>("sources"),
      read<ImageDraft>("drafts"),
      read<Revision>("revisions"),
    ]);
    const hash = async (blob: Blob) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
        ),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
    const data = {
      version: db.version,
      sources: await Promise.all(
        sources.map(async ({ blob, ...source }) => ({
          ...source,
          hash: await hash(blob),
        })),
      ),
      drafts,
      revisions: await Promise.all(
        revisions.map(async ({ png, ...revision }) => ({
          ...revision,
          hash: await hash(png),
        })),
      ),
    };
    db.close();
    return data;
  });
}

export async function thumbnailPixels(page: Page, card: Locator) {
  const img = card.locator("img");
  await card.scrollIntoViewIfNeeded();
  await expect(img).toBeVisible();
  await expect
    .poll(() =>
      img.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const encoded = await img.evaluate(async (element: HTMLImageElement) => {
    const data = new Uint8Array(await (await fetch(element.src)).arrayBuffer());
    let binary = "";
    for (const byte of data) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  return pngPixels(page, encoded);
}

export async function collectionDownload(page: Page, card: Locator) {
  const waiting = page.waitForEvent("download");
  await card.getByRole("button", { name: /^Download PNG for / }).click();
  const download = await waiting;
  expect(await download.failure()).toBeNull();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return pngPixels(
    page,
    (await readFile((await download.path())!)).toString("base64"),
  );
}

export async function addText(page: Page, text: string, color = "Blue") {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("radio", { name: color, exact: true }).check();
  await page.getByLabel("Text label", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Place text in center" }).click();
}

export async function updateImage(page: Page) {
  await page
    .getByRole("button", { name: "Update this image", exact: true })
    .click();
  await expect(
    page.getByText(
      "Image updated in this browser. Previous saves are kept in history.",
    ),
  ).toBeVisible();
}

export async function saveCopy(page: Page) {
  await page
    .getByRole("button", { name: "Save as new image", exact: true })
    .click();
  await expect(
    page.getByText(
      "Saved as a new image. You are editing the copy; the source image is unchanged.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
}

export async function closeEditor(page: Page) {
  await page
    .getByRole("button", { name: "Close Annotate image", exact: true })
    .click();
}
