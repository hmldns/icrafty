import { expect, test } from "@playwright/test";
import {
  databaseSnapshot,
  downloadCurrent,
  drawLine,
  inspectDownload,
  trackStates,
  uploadImage,
} from "./helpers";

test("draft storage failure stays candid, permits export, and can be retried", async ({
  page,
}) => {
  await page.goto("/debug/camera");
  await uploadImage(page);
  await page.evaluate(() => {
    window.testDraftBlocked = true;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "drafts" && window.testDraftBlocked)
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, value, key);
    };
  });
  await drawLine(page);
  await expect(
    page.getByText("Draft not saved", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "memory only",
  );
  const pixels = await inspectDownload(page, await downloadCurrent(page));
  expect(pixels.line).toEqual([188, 64, 42, 255]);
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await page.evaluate(() => {
    window.testDraftBlocked = false;
  });
  await page.getByRole("button", { name: "Retry saving" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Annotate workpiece.png" }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
});

test("thumbnail and download object URLs are released after their use", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.testUrls = { created: new Set(), revoked: new Set() };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object) => {
      const url = create(object);
      window.testUrls.created.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.testUrls.revoked.add(url);
      revoke(url);
    };
  });
  await page.goto("/debug/camera");
  await uploadImage(page);
  await downloadCurrent(page);
  await page.getByRole("button", { name: "Close Annotate image" }).click();
  await page
    .getByRole("button", { name: "Delete workpiece.png", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete image", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...window.testUrls.created].filter(
            (url) => !window.testUrls.revoked.has(url),
          ).length,
      ),
    )
    .toBe(0);
  expect((await databaseSnapshot(page)).sources).toHaveLength(0);
});

test("switching devices releases the old stream and requests the selected camera", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.testCamera = { calls: [], streams: [] };
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.enumerateDevices = async () =>
      ["camera-a", "camera-b"].map((id, index) => ({
        kind: "videoinput" as const,
        deviceId: id,
        groupId: "test",
        label: `Test camera ${index + 1}`,
        toJSON() {
          return {};
        },
      }));
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.testCamera.calls.push(constraints ?? {});
      const video = constraints?.video as MediaTrackConstraints | undefined;
      const chosen =
        (video?.deviceId as ConstrainDOMStringParameters | undefined)?.exact ??
        "camera-a";
      // Chromium still supplies fake media; only the choice of labels is simulated.
      const stream = await original({ audio: false, video: true });
      for (const track of stream.getVideoTracks()) {
        const settings = track.getSettings.bind(track);
        track.getSettings = () => ({ ...settings(), deviceId: String(chosen) });
      }
      window.testCamera.streams.push(stream);
      return stream;
    };
  });
  await page.goto("/debug/camera");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capture image", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Camera device", { exact: true })
    .selectOption("camera-b");
  await expect.poll(() => trackStates(page)).toEqual(["ended", "live"]);
  await expect(
    page.getByRole("button", { name: "Capture image", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => window.testCamera.calls[1])).toMatchObject({
    video: { deviceId: { exact: "camera-b" } },
  });
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  await expect.poll(() => trackStates(page)).toEqual(["ended", "ended"]);
});
