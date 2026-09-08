import { expect, test } from "@playwright/test";

test("directory, deep links, history navigation and fallback are usable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL("/debug");
  await expect(page).toHaveTitle("icrafty · The workshop");
  await expect(page.getByRole("link", { name: "icrafty home" })).toBeVisible();
  const favicon = await page.request.get("/favicon.svg");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Good things deserveanother go.",
  );
  await page.getByRole("link", { name: /01 \/ OBSERVE/ }).click();
  await expect(page).toHaveURL("/debug/camera");
  await expect(page).toHaveTitle("icrafty · Camera & annotation");
  await expect(
    page.getByRole("heading", { name: "A clearer picture." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "UI gallery", exact: true }).click();
  await expect(page).toHaveURL("/debug/gallery");
  await expect(page).toHaveTitle("icrafty · Component gallery");
  await page.goBack();
  await expect(page).toHaveURL("/debug/camera");
  await page.goBack();
  await expect(page).toHaveURL("/debug");
  await page.goForward();
  await expect(page).toHaveURL("/debug/camera");
  await page.goForward();
  await expect(page).toHaveURL("/debug/gallery");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Made of small, good things." }),
  ).toBeVisible();
  await page.goto("/missing-tool");
  await expect(page).toHaveTitle("icrafty · Page not found");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "isn’t on the workbench",
  );
  await page.getByRole("link", { name: "Back to the workshop" }).click();
  await expect(page).toHaveURL("/debug");
});

test("old routes redirect without extra history entries and retain query strings and fragments", async ({
  page,
}) => {
  for (const [oldPath, newPath] of [
    ["/", "/debug"],
    ["/camera", "/debug/camera"],
    ["/gallery", "/debug/gallery"],
  ]) {
    await page.goto("/previous-page");
    await page.goto(`${oldPath}?from=bookmark#main`);
    await expect(page).toHaveURL(`${newPath}?from=bookmark#main`);
    await page.goBack();
    await expect(page).toHaveURL("/previous-page");
  }
  await page.goto("/debug/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Good things deserveanother go.",
  );
  await expect(
    page.getByRole("link", { name: "Workshop", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("gallery exercises fields, disabled buttons, keyboard tabs and modal focus", async ({
  page,
}) => {
  await page.goto("/debug/gallery");
  await expect(
    page.getByRole("button", { name: "Primary disabled" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Image URL example")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.getByLabel("Image name", { exact: true }).fill("Handle detail");
  await page.getByRole("tab", { name: "Original image", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Annotated draft" }),
  ).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "Annotated draft" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open example dialog" }).click();
  const dialog = page.getByRole("dialog", { name: "A little room to focus" });
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Confirm example" }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close A little room to focus" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open example dialog" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Open example dialog" }).click();
  await page.getByRole("button", { name: "Confirm example" }).click();
  await expect(
    page.getByText("Example confirmed. You’re back in the gallery."),
  ).toBeVisible();
});

test("directory and workspace fit a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/debug", "/debug/gallery", "/debug/camera"]) {
    await page.goto(path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
