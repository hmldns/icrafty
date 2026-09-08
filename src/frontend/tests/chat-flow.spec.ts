import { expect, test, type Locator, type Page } from "@playwright/test";
import { instrumentCamera, trackStates } from "./helpers";
import { canvasPixels } from "./model-helpers";

const cameraItem = (page: Page) => page.getByRole("article", { name: "A closer look at the mug", exact: true });
const modelItem = (page: Page) => page.getByRole("article", { name: "A first shape for the cap", exact: true });
const imageItem = (page: Page) => page.getByRole("article", { name: "The rim, with your measurement", exact: true });
const selectedPhotos = (page: Page) => page.getByRole("list", { name: "Selected attachments" });
const localInputs = (page: Page) => page.getByRole("article", { name: "Local message from you", exact: true });
const imageDialog = (page: Page) => page.getByRole("dialog", { name: "Image versions", exact: true });

async function tabTo(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test("chat is a navigable timeline with expandable typed items and a local reset", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await instrumentCamera(page);
  await page.goto("/debug");
  await page.getByRole("link", { name: /04 \/ GATHER THE STORY/ }).click();
  await expect(page).toHaveURL("/debug/chat");
  await expect(page).toHaveTitle("icrafty · Chat flow mock");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A cap for the everyday mug");
  await expect(page.getByRole("list", { name: "Chat history", exact: true }).locator(":scope > li")).toHaveCount(8);
  await expect(imageDialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(0);
  await page.getByRole("button", { name: "Collapse items", exact: true }).click();
  for (const toggle of await page.locator(".chat-interaction-toggle").all()) await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("textbox")).toBeVisible();
  await page.getByRole("button", { name: "Expand items", exact: true }).click();
  await expect(modelItem(page).locator(".chat-inline-model")).toHaveAttribute("data-state", "ready");
  await expect(cameraItem(page).getByRole("list", { name: "Camera photos" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("textbox").fill("A local observation");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(localInputs(page)).toHaveCount(1);
  await page.reload();
  await expect(localInputs(page)).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL("/debug");
  await page.goForward();
  await expect(page.getByRole("link", { name: "Chat", exact: true })).toHaveAttribute("aria-current", "page");
  expect(errors).toEqual([]);
});

test("inline images open exact versions and submitted originals survive newer selections", async ({ page }) => {
  await page.goto("/debug/chat");
  await cameraItem(page).getByRole("button", { name: "Attach Mug rim, v1", exact: true }).click();
  await cameraItem(page).getByRole("button", { name: "Inspect Mug rim, v1", exact: true }).click();
  const dialog = imageDialog(page);
  await expect(dialog.getByRole("heading", { name: "Mug rim", exact: true })).toBeFocused();
  await expect(dialog.getByRole("radio", { name: "v1 · Original", exact: true })).toBeChecked();
  await dialog.getByRole("radio", { name: "v2 · Marked rim Current" }).check();
  await expect(dialog.getByText(/Replace outcome/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(selectedPhotos(page).getByRole("link")).toHaveAccessibleName("Inspect Mug rim, v1 · Original");
  await page.getByRole("textbox").fill("Start with this original.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(localInputs(page).getByRole("img")).toHaveAttribute("src", "/chat-flow/mug-rim.svg");
  await imageItem(page).getByRole("button", { name: "Attach image", exact: true }).click();
  await expect(imageItem(page).getByRole("button", { name: "Attached", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(localInputs(page)).toHaveCount(2);
  await expect(localInputs(page).last().getByRole("img")).toHaveAttribute("src", "/chat-flow/mug-rim-marked.svg");
  await expect(localInputs(page).first().getByRole("img")).toHaveAttribute("src", "/chat-flow/mug-rim.svg");
  await localInputs(page).first().getByRole("link").click();
  await expect(dialog.getByText("Earlier version · v1")).toBeVisible();
});

test("photo picker keeps copy lineage and supports removal and optional text", async ({ page }) => {
  await page.goto("/debug/chat");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  await page.getByRole("textbox").fill("  \n  ");
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  const dialog = imageDialog(page);
  await dialog.getByRole("button", { name: /^Rim study/ }).click();
  await expect(dialog.getByText(/Save copy outcome/)).toBeVisible();
  await dialog.getByRole("link", { name: "Mug rim · v2" }).click();
  await expect(dialog.getByRole("radio", { name: "v2 · Marked rim Current" })).toBeChecked();
  await dialog.getByRole("button", { name: /^Rim study/ }).click();
  await dialog.getByRole("button", { name: "Attach v1 to input", exact: true }).click();
  await dialog.getByRole("button", { name: "Back to message (1)" }).click();
  await expect(send).toBeEnabled();
  await selectedPhotos(page).getByRole("button", { name: "Remove Rim study, v1" }).click();
  await expect(page.getByRole("textbox")).toBeFocused();
  await expect(send).toBeDisabled();
  await page.getByRole("textbox").fill("Keep room for the handle.");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("A second line.");
  await page.keyboard.press("Enter");
  await expect(localInputs(page)).toContainText("Keep room for the handle.\nA second line.");
  await expect(localInputs(page).getByRole("img")).toHaveCount(0);
});

test("inline 3D rotates, snapshots a fixed view, and releases the renderer on collapse", async ({ page }) => {
  await page.goto("/debug/chat");
  const model = modelItem(page);
  await expect(model.locator(".chat-inline-model")).toHaveAttribute("data-state", "ready");
  await model.locator("canvas").scrollIntoViewIfNeeded();
  const before = await canvasPixels(page, model);
  expect(before.foreground).toBeGreaterThan(1_000);
  const canvas = model.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 55, box.y + box.height / 2 + 65, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await canvasPixels(page, model)).digest).not.toBe(before.digest);
  await model.getByRole("button", { name: "Attach this view" }).click();
  const attached = selectedPhotos(page).getByRole("img");
  await expect(attached).toHaveAttribute("src", /^blob:/);
  const url = await attached.getAttribute("src");
  await model.getByRole("button", { name: "Side", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(localInputs(page).getByRole("img")).toHaveAttribute("src", url!);
  const previousCanvas = await canvas.elementHandle();
  await model.locator(".chat-interaction-toggle").click();
  await expect(canvas).toHaveCount(0);
  await expect.poll(() => previousCanvas!.evaluate((element) => (element as HTMLCanvasElement).getContext("webgl2")?.isContextLost())).toBe(true);
  await expect(localInputs(page).getByRole("img")).toHaveJSProperty("complete", true);
  expect(await localInputs(page).getByRole("img").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await model.locator(".chat-interaction-toggle").click();
  await expect(model.locator(".chat-inline-model")).toHaveAttribute("data-state", "ready");
});

test("one click starts a draggable camera; collapsed mini capture preserves its stream until leaving", async ({ page }) => {
  await instrumentCamera(page);
  await page.addInitScript(() => {
    window.testUrls = { created: new Set(), revoked: new Set() };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = create(blob); window.testUrls.created.add(url); return url; };
    URL.revokeObjectURL = (url) => { window.testUrls.revoked.add(url); revoke(url); };
  });
  await page.goto("/debug/chat");
  const camera = cameraItem(page);
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(0);
  await camera.getByRole("button", { name: "Open camera", exact: true }).click();
  const widget = page.getByRole("region", { name: "Camera widget", exact: true });
  await expect(widget.getByRole("button", { name: "Capture image", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(1);
  await widget.getByRole("button", { name: "Capture image", exact: true }).click();
  await expect(camera.getByRole("list", { name: "Camera photos" }).getByRole("listitem")).toHaveCount(3);
  const url = await selectedPhotos(page).getByRole("img").getAttribute("src");
  expect(url).toMatch(/^blob:/);
  await camera.locator(".chat-interaction-toggle").click();
  await expect(widget).toHaveAttribute("data-compact", "true");
  await expect(camera.getByText("Camera live", { exact: true })).toBeVisible();
  expect(await trackStates(page)).toEqual(["live"]);
  await expect(widget).toHaveCSS("width", "240px");
  const before = (await widget.boundingBox())!;
  const handle = widget.getByRole("button", { name: "Move camera", exact: true });
  const handleBox = (await handle.boundingBox())!;
  await page.mouse.move(handleBox.x + 15, handleBox.y + 15);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 140, handleBox.y - 65, { steps: 8 });
  await page.mouse.up();
  expect((await widget.boundingBox())!.x).toBeLessThan(before.x - 100);
  await widget.getByRole("button", { name: "Capture image", exact: true }).click();
  await expect(selectedPhotos(page).getByRole("img")).toHaveCount(2);
  await widget.getByRole("button", { name: "Enlarge camera", exact: true }).click();
  await expect(widget).toHaveAttribute("data-compact", "false");
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(1);
  await widget.getByRole("button", { name: "Shrink camera", exact: true }).click();
  await camera.locator(".chat-interaction-toggle").click();
  await expect(camera.getByRole("button", { name: "Attached Camera photo 1, v1" })).toBeDisabled();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(localInputs(page).getByRole("img").first()).toHaveAttribute("src", url!);
  await expect(localInputs(page).getByRole("img")).toHaveCount(2);
  await page.getByRole("link", { name: "Workshop", exact: true }).click();
  await expect.poll(() => trackStates(page)).toEqual(["ended"]);
  await expect(widget).toHaveCount(0);
  expect(await page.evaluate((url) => window.testUrls.revoked.has(url!), url)).toBe(true);
});

test("closing a minimized pending camera stops a late permission result", async ({ page }) => {
  await instrumentCamera(page, true);
  await page.goto("/debug/chat");
  const camera = cameraItem(page);
  await camera.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!window.testCamera.release)).toBe(true);
  await camera.locator(".chat-interaction-toggle").click();
  const widget = page.getByRole("region", { name: "Camera widget", exact: true });
  await expect(widget).toHaveAttribute("data-compact", "true");
  await widget.getByRole("button", { name: "Close camera", exact: true }).click();
  await page.evaluate(() => window.testCamera.release!());
  await expect.poll(() => trackStates(page)).toEqual(["ended"]);
  await expect(selectedPhotos(page)).toHaveCount(0);
});

test("mobile floating camera captures and moves by keyboard without restarting", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await instrumentCamera(page);
  await page.goto("/debug/chat");
  await cameraItem(page).getByRole("button", { name: "Open camera", exact: true }).click();
  const widget = page.getByRole("region", { name: "Camera widget", exact: true });
  await expect(widget.getByRole("button", { name: "Capture image", exact: true })).toBeEnabled();
  await widget.getByRole("button", { name: "Shrink camera", exact: true }).click();
  await expect(widget.getByRole("button", { name: "Capture image", exact: true })).toBeInViewport();
  const handle = widget.getByRole("button", { name: "Move camera", exact: true });
  await handle.focus();
  await handle.press("ArrowUp");
  await handle.press("ArrowLeft");
  await widget.getByRole("button", { name: "Capture image", exact: true }).click();
  await expect(selectedPhotos(page).getByRole("img")).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(widget.getByRole("button", { name: "Capture image", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("camera-mini-mobile.png") });
  await widget.getByRole("button", { name: "Close camera", exact: true }).click();
  await expect.poll(() => trackStates(page)).toEqual(["ended"]);
});

for (const width of [390, 320]) {
  test(`${width} px keyboard flow keeps history, disclosure, photos and composer usable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/debug/chat");
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
    const toggle = cameraItem(page).locator(".chat-interaction-toggle");
    await tabTo(page, toggle);
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(await toggle.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    await page.keyboard.press("Enter");
    await tabTo(page, cameraItem(page).getByRole("button", { name: "Attach Mug rim, v1", exact: true }));
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Photos", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(imageDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Photos", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("textbox")).toBeFocused();
    await page.keyboard.type("Use this view.");
    await page.keyboard.press("Enter");
    await expect(localInputs(page).getByRole("link")).toHaveAccessibleName("Inspect Mug rim, v1 · Original");
    await expect(page.getByRole("textbox")).toBeFocused();
    await expect(localInputs(page)).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`chat-items-${width}.png`), fullPage: true });
  });
}
