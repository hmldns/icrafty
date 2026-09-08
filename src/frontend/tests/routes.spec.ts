import { expect, test } from "@playwright/test";

test("directory, deep links, history navigation and fallback are usable", async ({
  page,
}) => {
  await page.goto("/");
  const favicon = await page.request.get("/favicon.svg");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Good things deserveanother go.",
  );
  await page.getByRole("link", { name: /01 \/ OBSERVE/ }).click();
  await expect(page).toHaveURL("/camera");
  await expect(
    page.getByRole("heading", { name: "A clearer picture." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "UI gallery", exact: true }).click();
  await expect(page).toHaveURL("/gallery");
  await page.goBack();
  await expect(page).toHaveURL("/camera");
  await page.goForward();
  await expect(page).toHaveURL("/gallery");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Made of small, good things." }),
  ).toBeVisible();
  await page.goto("/missing-tool");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "isn’t on the workbench",
  );
  await page.getByRole("link", { name: "Back to the workshop" }).click();
  await expect(page).toHaveURL("/");
});

test("gallery exercises fields, disabled buttons, keyboard tabs and modal focus", async ({
  page,
}) => {
  await page.goto("/gallery");
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
  for (const path of ["/", "/gallery", "/camera"]) {
    await page.goto(path);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
