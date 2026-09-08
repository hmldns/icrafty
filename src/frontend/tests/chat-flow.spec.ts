import { expect, test, type Locator, type Page } from "@playwright/test";

const assets = (page: Page) => page.getByRole("list", { name: "Fixture assets" });
const selectedPhotos = (page: Page) => page.getByRole("list", { name: "Selected attachments" });
const localInputs = (page: Page) => page.getByRole("article", { name: "Local mock input from you", exact: true });
const detail = (page: Page) => page.locator(".chat-asset-detail");

async function tabTo(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 24; attempt++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test("chat route is linked, reloadable, and keeps the rehearsal local", async ({ page }) => {
  const sentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") sentRequests.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () => { throw new Error("The chat mock must not operate the camera"); },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/debug");
  await page.getByRole("link", { name: /04 \/ GATHER THE STORY/ }).click();
  await expect(page).toHaveURL("/debug/chat");
  await expect(page).toHaveTitle("icrafty · Chat flow mock");
  await expect(page.getByRole("link", { name: "Chat", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("textbox", { name: "Message (optional)" }).fill("A local observation");
  await page.getByRole("button", { name: "Add mock input" }).click();
  await expect(localInputs(page)).toHaveCount(1);
  await page.reload();
  await expect(localInputs(page)).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Chat history", exact: true }).locator(":scope > li")).toHaveCount(4);
  await page.goBack();
  await expect(page).toHaveURL("/debug");
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A little more context.");
  await page.goto("/debug/chat/");
  await expect(assets(page).getByRole("button")).toHaveCount(4);
  expect(sentRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("camera captures, replacement, saved-copy lineage, and model source are inspectable", async ({ page }) => {
  await page.goto("/debug/chat");
  await expect(page.getByText("4 assets · 5 image versions")).toBeVisible();
  await expect(detail(page).getByRole("radio", { name: "v2 · Marked rim Current" })).toBeChecked();
  await expect(detail(page).getByText(/Replace outcome/)).toBeVisible();

  const captures = page.getByRole("list", { name: "Camera run captures" });
  await captures.getByRole("link", { name: "Inspect Mug rim, v1 · Original", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mug rim", exact: true })).toBeFocused();
  await expect(detail(page).getByRole("radio", { name: "v1 · Original", exact: true })).toBeChecked();
  await expect(detail(page).getByText("Earlier version · v1")).toBeVisible();
  await expect(detail(page).getByRole("img")).toHaveAttribute("src", "/chat-flow/mug-rim.svg");

  await captures.getByRole("link", { name: "Inspect Mug profile, v1 · Original", exact: true }).click();
  await expect(detail(page).getByText("Source: Camera run · capture 2.")).toBeVisible();
  await assets(page).getByRole("button", { name: /^Rim study/ }).click();
  await expect(detail(page).getByText(/Save copy outcome/)).toBeVisible();
  await expect(detail(page).getByRole("radio")).toHaveCount(1);
  await expect(detail(page).getByRole("list", { name: "Saved annotation marks" })).toContainText("Rectangle");
  await expect(detail(page).getByRole("img")).toHaveAttribute("src", "/chat-flow/rim-study.svg");
  await detail(page).getByRole("link", { name: "Mug rim · v2" }).click();
  await expect(detail(page).getByRole("radio", { name: "v2 · Marked rim Current" })).toBeChecked();
  await detail(page).getByRole("link", { name: "Mug rim · v1" }).click();
  await expect(detail(page).getByRole("radio", { name: "v1 · Original", exact: true })).toBeChecked();

  await assets(page).getByRole("button", { name: /^Cap concept/ }).click();
  await expect(detail(page).getByText("Source: mug-cap.step · Isometric view.")).toBeVisible();
  await expect(detail(page).getByRole("img")).toHaveAttribute("src", "/chat-flow/cap-snapshot.svg");
  const images = await page.locator(".chat-flow img").evaluateAll((elements) => elements.map((element) => {
    const image = element as HTMLImageElement;
    return { loaded: image.complete && image.naturalWidth === 640, url: new URL(image.src).pathname };
  }));
  expect(images.every((image) => image.loaded && image.url.startsWith("/chat-flow/"))).toBe(true);
});

test("queued and submitted versions stay pinned while the asset selection changes", async ({ page }) => {
  await page.goto("/debug/chat");
  await detail(page).getByRole("radio", { name: "v1 · Original", exact: true }).check();
  await page.getByRole("button", { name: "Attach v1 to input", exact: true }).click();
  await detail(page).getByRole("radio", { name: "v2 · Marked rim Current" }).check();
  await expect(selectedPhotos(page).getByRole("link")).toHaveAccessibleName("Inspect Mug rim, v1 · Original");
  await page.getByRole("button", { name: "Attach v2 to input", exact: true }).click();
  await expect(page.getByRole("button", { name: "v2 attached", exact: true })).toBeDisabled();
  await expect(selectedPhotos(page).getByRole("link")).toHaveCount(2);
  await page.getByRole("button", { name: "Remove Mug rim, v2", exact: true }).click();
  await expect(selectedPhotos(page).getByRole("link")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Message (optional)" }).fill("Start with this original.\nThe marks come next.");
  await page.getByRole("button", { name: "Add mock input" }).click();
  const first = localInputs(page).first();
  await expect(first).toContainText("Start with this original.\nThe marks come next.");
  await expect(first.getByRole("img")).toHaveAttribute("src", "/chat-flow/mug-rim.svg");
  await expect(selectedPhotos(page)).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveValue("");

  await page.getByRole("button", { name: "Attach v2 to input", exact: true }).click();
  await assets(page).getByRole("button", { name: /^Cap concept/ }).click();
  await page.getByRole("button", { name: "Attach v1 to input", exact: true }).click();
  await page.getByRole("button", { name: "Add mock input" }).click();
  await expect(localInputs(page)).toHaveCount(2);
  await expect(localInputs(page).last().getByRole("link")).toHaveCount(2);
  await expect(localInputs(page).last().getByRole("link", { name: "Inspect Mug rim, v2 · Marked rim" })).toBeVisible();
  await expect(localInputs(page).last().getByRole("link", { name: "Inspect Cap concept, v1 · Model snapshot" })).toBeVisible();
  await expect(first.getByRole("link")).toHaveAccessibleName("Inspect Mug rim, v1 · Original");
  await expect(first.getByRole("img")).toHaveAttribute("src", "/chat-flow/mug-rim.svg");
  await first.getByRole("link").click();
  await expect(detail(page).getByRole("radio", { name: "v1 · Original", exact: true })).toBeChecked();
  await expect(detail(page).getByText("Earlier version · v1")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Its image versions are fixed.");
});

test("blank input is disabled, saved copies attach independently, and text-only input works", async ({ page }) => {
  await page.goto("/debug/chat");
  const message = page.getByRole("textbox");
  const submit = page.getByRole("button", { name: "Add mock input" });
  await expect(submit).toBeDisabled();
  await message.fill("  \n  ");
  await expect(submit).toBeDisabled();
  await assets(page).getByRole("button", { name: /^Rim study/ }).click();
  await page.getByRole("button", { name: "Attach v1 to input", exact: true }).click();
  await expect(submit).toBeEnabled();
  await assets(page).getByRole("button", { name: /^Mug rim/ }).click();
  await expect(selectedPhotos(page).getByRole("link")).toHaveAccessibleName("Inspect Rim study, v1 · Seal detail");
  await page.getByRole("button", { name: "Remove Rim study, v1" }).click();
  await expect(page.getByRole("heading", { name: "Next input · 0 attached" })).toBeFocused();
  await expect(submit).toBeDisabled();
  await message.fill("  Keep some room around the handle.  ");
  await submit.click();
  await expect(localInputs(page)).toContainText("Keep some room around the handle.");
  await expect(localInputs(page).getByRole("list")).toHaveCount(0);
  await expect(message).toBeFocused();
});

test("compact keyboard flow reaches versions, attachments, removal and submission", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/debug/chat");
  const cameraLink = page.getByRole("list", { name: "Camera run captures" }).getByRole("link", { name: "Inspect Mug rim, v1 · Original" });
  await tabTo(page, cameraLink);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Mug rim", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(detail(page).getByRole("radio", { name: "v1 · Original", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(detail(page).getByRole("radio", { name: "v2 · Marked rim Current" })).toBeChecked();
  const attach = page.getByRole("button", { name: "Attach v2 to input" });
  await tabTo(page, attach);
  expect(await attach.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "View input (1)" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form", { name: "Mock input composer" })).toBeFocused();
  const remove = page.getByRole("button", { name: "Remove Mug rim, v2" });
  await tabTo(page, remove);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Next input · 0 attached" })).toBeFocused();
  await tabTo(page, page.getByRole("button", { name: "Browse assets" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Assets", exact: true })).toBeFocused();
  await tabTo(page, attach);
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("link", { name: "View input (1)" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("textbox"));
  await page.keyboard.type("Use the marked version.");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Add mock input" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(localInputs(page).getByRole("link")).toHaveAccessibleName("Inspect Mug rim, v2 · Marked rim");
  await expect(page.getByRole("textbox")).toBeFocused();
  await expect(localInputs(page)).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("chat-compact-keyboard.png"), fullPage: true });
});

test("320 px layout and a full attachment strip stay usable without page overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/debug/chat");
  for (const title of ["Mug rim", "Mug profile", "Rim study", "Cap concept"]) {
    await assets(page).getByRole("button", { name: new RegExp(`^${title}`) }).click();
    await detail(page).getByRole("button", { name: /^Attach/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
  const strip = selectedPhotos(page);
  await page.getByRole("link", { name: "View input (4)" }).click();
  await expect(strip.getByRole("link")).toHaveCount(4);
  await strip.getByRole("button", { name: "Remove Cap concept, v1" }).focus();
  await expect(strip.getByRole("button", { name: "Remove Cap concept, v1" })).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(strip.getByRole("link", { name: "Inspect Rim study, v1 · Seal detail" })).toBeFocused();
  await page.getByRole("button", { name: "Add mock input" }).click();
  await expect(localInputs(page).getByRole("link")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("chat-320.png"), fullPage: true });
});
