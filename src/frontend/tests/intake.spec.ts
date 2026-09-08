import { expect, test } from "@playwright/test";
import { databaseSnapshot, drawLine, makeImage, uploadImage } from "./helpers";

test("drop and paste add local images; deletion removes the source, draft and revisions", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  const file = await makeImage(page, "detail.png");
  await page.locator(".dropzone").evaluate((element, base64) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(
        [Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))],
        "detail.png",
        { type: "image/png" },
      ),
    );
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
  }, file.buffer.toString("base64"));
  await expect(
    page.getByRole("dialog", { name: "Annotate image" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
  await drawLine(page);
  await page
    .getByRole("button", { name: "Update this image", exact: true })
    .click();
  await expect(
    page.getByText(
      "Image updated in this browser. Previous saves are kept in history.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Annotate image" }).click();

  await page.evaluate((base64) => {
    const clipboard = new DataTransfer();
    clipboard.items.add(
      new File(
        [Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))],
        "clipboard.png",
        { type: "image/png" },
      ),
    );
    window.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, file.buffer.toString("base64"));
  await expect(
    page.getByRole("dialog", { name: "Annotate image" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await expect(page.getByTestId("collection-image")).toHaveCount(2);
  const before = await databaseSnapshot(page);
  expect(before.sources.map((source) => source.origin).sort()).toEqual([
    "file",
    "paste",
  ]);
  const deletedId = before.sources.find(
    (source) => source.name === "detail.png",
  )!.id;
  await page
    .getByRole("button", { name: "Delete detail.png", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep image" }).click();
  await expect(page.getByTestId("collection-image")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Delete detail.png", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete image", exact: true }).click();
  await expect(page.getByTestId("collection-image")).toHaveCount(1);
  const after = await databaseSnapshot(page);
  expect(after.sources.some((source) => source.id === deletedId)).toBe(false);
  expect(after.drafts.some((draft) => draft.sourceId === deletedId)).toBe(
    false,
  );
  expect(after.revisions).toHaveLength(0);
  await page.reload();
  await expect(page.getByTestId("collection-image")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Annotate clipboard.png" }),
  ).toBeVisible();
});

test("URL import reads a CORS-enabled image and keeps a local original", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  const file = await makeImage(page, "web-detail.png", 640, 480);
  await page.route("https://images.example.test/detail.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
      body: file.buffer,
    }),
  );
  await page.getByRole("tab", { name: "Image URL", exact: true }).click();
  await page
    .getByLabel("Web image URL", { exact: true })
    .fill("https://images.example.test/detail.png");
  await page.getByRole("button", { name: "Add from URL" }).click();
  await expect(
    page.getByRole("button", { name: "Download PNG", exact: true }),
  ).toBeEnabled();
  const state = await databaseSnapshot(page);
  expect(state.sources[0]).toMatchObject({
    origin: "url",
    width: 640,
    height: 480,
    bytes: Array.from(file.buffer),
  });
});

test("URL network/CORS, HTTP, decode, oversized response and unsafe-protocol errors are actionable", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  await page.getByRole("tab", { name: "Image URL", exact: true }).click();
  const url = page.getByLabel("Web image URL", { exact: true });
  const submit = page.getByRole("button", { name: "Add from URL" });
  await page.route("https://images.example.test/blocked.png", (route) =>
    route.abort("failed"),
  );
  await url.fill("https://images.example.test/blocked.png");
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("CORS");
  await page.route("https://images.example.test/missing.png", (route) =>
    route.fulfill({
      status: 404,
      headers: { "access-control-allow-origin": "*" },
      body: "",
    }),
  );
  await url.fill("https://images.example.test/missing.png");
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("HTTP 404");
  await page.route("https://images.example.test/bad.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
      body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
    }),
  );
  await url.fill("https://images.example.test/bad.png");
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("could not be decoded");
  await page.route("https://images.example.test/huge.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: {
        "access-control-allow-origin": "*",
        "content-length": String(13 * 1024 * 1024),
      },
      body: "x",
    }),
  );
  await url.fill("https://images.example.test/huge.png");
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("larger than 12 MB");
  await url.fill("file:///tmp/photo.png");
  await submit.click();
  await expect(page.getByRole("alert")).toContainText("public HTTP or HTTPS");
  expect((await databaseSnapshot(page)).sources).toHaveLength(0);
});

test("invalid files and excessive image dimensions leave the collection intact", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  const input = page.getByLabel("Choose image files");
  await input.setInputFiles({
    name: "sketch.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg></svg>"),
  });
  await expect(page.getByRole("alert")).toContainText("Unsupported image");
  await input.setInputFiles({
    name: "empty.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(0),
  });
  await expect(page.getByRole("alert")).toContainText("file is empty");
  await input.setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(12 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("larger than 12 MB");
  const enormous = await makeImage(page, "oversize.png", 4100, 4000);
  await input.setInputFiles(enormous);
  await expect(page.getByRole("alert")).toContainText("16 megapixels");
  await uploadImage(page, "valid.png");
  expect((await databaseSnapshot(page)).sources).toHaveLength(1);
});

test("closing the route cancels a pending URL import", async ({ page }) => {
  await page.goto("/debug/camera");
  let requested = false;
  let finish: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const image = await makeImage(page);
  await page.route("https://images.example.test/slow.png", async (route) => {
    requested = true;
    await wait;
    await route
      .fulfill({
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: image.buffer,
      })
      .catch(() => undefined);
  });
  await page.getByRole("tab", { name: "Image URL", exact: true }).click();
  await page
    .getByLabel("Web image URL", { exact: true })
    .fill("https://images.example.test/slow.png");
  await page.getByRole("button", { name: "Add from URL" }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("link", { name: "UI gallery", exact: true }).click();
  finish!();
  await page
    .getByRole("link", { name: "Camera & annotate", exact: true })
    .click();
  await expect(page.getByTestId("collection-image")).toHaveCount(0);
  expect((await databaseSnapshot(page)).sources).toHaveLength(0);
});
