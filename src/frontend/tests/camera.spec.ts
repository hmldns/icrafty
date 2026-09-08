import { expect, test } from "@playwright/test";
import { databaseSnapshot, instrumentCamera, trackStates } from "./helpers";

test("explicit camera start, repeated button/Space captures, typed input and stop/restart cleanup", async ({
  page,
}) => {
  await instrumentCamera(page);
  await page.goto("/debug/camera");
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(0);
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(0);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  const capture = page.getByRole("button", {
    name: "Capture image",
    exact: true,
  });
  await expect(capture).toBeEnabled();
  await expect(page.getByLabel("Camera device", { exact: true })).toBeVisible();
  await capture.click();
  await expect(page.getByTestId("collection-image")).toHaveCount(1);
  await capture.click();
  await expect(page.getByTestId("collection-image")).toHaveCount(2);
  await page.getByRole("heading", { name: "A clearer picture." }).click();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("collection-image")).toHaveCount(3);
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(1);
  expect(await trackStates(page)).toEqual(["live"]);

  await page.getByRole("tab", { name: "Image URL", exact: true }).click();
  await page
    .getByLabel("Web image URL", { exact: true })
    .fill("https://example.test/image.png");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("collection-image")).toHaveCount(3);
  await page.getByRole("button", { name: "Stop camera", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect.poll(() => trackStates(page)).toEqual(["ended"]);
  await expect(capture).toBeDisabled();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(capture).toBeEnabled();
  await capture.click();
  await expect(page.getByTestId("collection-image")).toHaveCount(4);
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await expect.poll(() => trackStates(page)).toEqual(["ended", "ended"]);
  const saved = await databaseSnapshot(page);
  expect(saved.sources).toHaveLength(4);
  expect(new Set(saved.sources.map((source) => source.id)).size).toBe(4);
  expect(saved.sources.every((source) => source.origin === "camera")).toBe(
    true,
  );
  await page.reload();
  await expect(page.getByTestId("collection-image")).toHaveCount(4);
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(0);
});

test("navigation unmount stops every media track", async ({ page }) => {
  await instrumentCamera(page);
  await page.goto("/debug/camera");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capture image", exact: true }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "UI gallery", exact: true }).click();
  await expect.poll(() => trackStates(page)).toEqual(["ended"]);
});

test("late camera permission cannot leave a stream alive after close", async ({
  page,
}) => {
  await instrumentCamera(page, true);
  await page.goto("/debug/camera");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!window.testCamera.release))
    .toBe(true);
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await page.evaluate(() => window.testCamera.release!());
  await expect.poll(() => trackStates(page)).toEqual(["ended"]);
  await expect(
    page.getByRole("button", { name: "Capture image", exact: true }),
  ).toHaveCount(0);
});

for (const [name, message] of [
  ["NotAllowedError", "access was denied"],
  ["NotFoundError", "No camera was found"],
  ["NotReadableError", "busy or unavailable"],
] as const) {
  test(`camera ${name} has a useful recovery path`, async ({ page }) => {
    await page.addInitScript((name) => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Camera test", name);
      };
    }, name);
    await page.goto("/debug/camera");
    await page
      .getByRole("button", { name: "Open camera", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start camera", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(
      page.getByRole("button", { name: "Start camera", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Choose images", exact: true }),
    ).toBeEnabled();
  });
}
