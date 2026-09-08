import { expect, test } from "@playwright/test";
import {
  captureModel,
  modelSources,
  pngPixels,
  ready,
  canvasPixels,
} from "./model-helpers";

test("production emits and loads real STEP, module worker and WASM without the dev relay", async ({
  page,
}) => {
  const assets: string[] = [];
  const errors: string[] = [];
  page.on("response", (response) => {
    if (response.status() === 200) assets.push(response.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/debug/models");
  const primary = await ready(page);
  await expect(
    page.getByText(
      "Local folder discovery is available with the development server.",
      { exact: false },
    ),
  ).toBeVisible();
  expect(
    assets.some((url) => /\/assets\/rounded-cube-.+\.step$/.test(url)),
  ).toBe(true);
  expect(
    assets.some((url) => /\/assets\/import\.worker-.+\.js$/.test(url)),
  ).toBe(true);
  // Some browser versions omit worker fetches from Page events; inspect its emitted URL too.
  const wasm = await page.request.get(
    assets.find((url) => url.endsWith(".wasm")) ??
      (
        await page.request
          .get(assets.find((url) => /import\.worker-.+\.js$/.test(url))!)
          .then((response) => response.text())
      ).match(/\/assets\/occt-import-js-[^"']+\.wasm/)![0],
  );
  expect(wasm.status()).toBe(200);
  expect((await wasm.body()).byteLength).toBeGreaterThan(7_000_000);
  expect(wasm.headers()["content-type"]).toContain("application/wasm");
  expect((await canvasPixels(page, primary)).foreground).toBeGreaterThan(5000);
  await primary.getByRole("button", { name: "Add X plane" }).click();
  await captureModel(page);
  const source = (await modelSources(page))[0]!;
  expect(source.model?.sha256).toBe(
    "370c5474e50dc94923f0dacb5113f7258233601620ab530d937c18571869d49e",
  );
  expect((await pngPixels(page, source.base64)).foreground).toBeGreaterThan(
    2000,
  );
  expect(errors).toEqual([]);
});
