import { expect, test } from "@playwright/test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CatalogError, createModelCatalog } from "../tooling/modelCatalog";

test("catalog contains paths and rejects traversal, symlink files/directories, non-model and oversized files", async () => {
  await mkdir("tooling/.test-models", { recursive: true });
  const temporary = await mkdtemp(resolve("tooling/.test-models/containment-"));
  const root = resolve(temporary, "root");
  await mkdir(resolve(root, "nested"), { recursive: true });
  try {
    await writeFile(
      resolve(root, "nested/valid.STL"),
      "solid valid\nendsolid valid",
    );
    await writeFile(resolve(root, "readme.txt"), "Not a model");
    await writeFile(
      resolve(temporary, "outside.step"),
      "private outside bytes",
    );
    await symlink(
      resolve(temporary, "outside.step"),
      resolve(root, "escape.step"),
    );
    await symlink(temporary, resolve(root, "escape-directory"));
    await symlink(
      resolve(root, "nested/valid.STL"),
      resolve(root, "internal.stl"),
    );
    const catalog = createModelCatalog(root);
    expect((await catalog.list()).map((entry) => entry.path)).toEqual([
      "nested/valid.STL",
    ]);
    expect((await catalog.read("nested/valid.STL")).toString()).toContain(
      "solid valid",
    );
    for (const path of [
      "../outside.step",
      "/etc/passwd.step",
      "C:/outside.step",
      "nested/../../outside.step",
      "nested\\valid.STL",
      "nested/./valid.STL",
      "readme.txt",
      "bad\0.stl",
    ])
      await expect(catalog.read(path)).rejects.toMatchObject({ status: 400 });
    for (const path of [
      "escape.step",
      "escape-directory/outside.step",
      "internal.stl",
    ])
      await expect(catalog.read(path)).rejects.toMatchObject({ status: 403 });
    await expect(catalog.read("missing.step")).rejects.toMatchObject({
      status: 404,
    });
    await writeFile(
      resolve(root, "oversized.stl"),
      Buffer.alloc(50 * 1024 * 1024 + 1),
    );
    await expect(catalog.read("oversized.stl")).rejects.toMatchObject({
      status: 413,
    });
    await expect(
      createModelCatalog(resolve(temporary, "missing")).list(),
    ).rejects.toBeInstanceOf(CatalogError);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("gallery HTTP relay reports errors, bounds paths and disables caching", async ({
  request,
}) => {
  const catalog = await request.get("/__model_gallery/catalog");
  expect(catalog.status()).toBe(200);
  expect(catalog.headers()["cache-control"]).toBe("no-store");
  expect((await catalog.json()).entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "rounded-cube.step", format: "step" }),
    ]),
  );
  const sample = await request.get(
    "/__model_gallery/file?path=rounded-cube.step",
  );
  expect((await sample.body()).byteLength).toBe(20532);
  for (const path of [
    "../package.json",
    "/tmp/private.step",
    "..%2Foutside.step",
    "C:\\private.step",
  ]) {
    const response = await request.get(
      `/__model_gallery/file?path=${encodeURIComponent(path)}`,
    );
    expect(response.status()).toBe(400);
  }
  expect((await request.post("/__model_gallery/catalog")).status()).toBe(405);
  expect((await request.get("/__model_gallery/missing")).status()).toBe(404);
});
