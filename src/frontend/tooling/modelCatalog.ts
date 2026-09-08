import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { MODEL_LIMITS } from "../src/features/models/types.ts";

export const CATALOG_PATH = "/__model_gallery";
const defaultRoot = fileURLToPath(new URL("./models", import.meta.url));
const supported = /\.(?:step|stp|stl)$/i;
const MAX_ENTRIES = 1000;
const MAX_SCANNED = 10_000;

export interface CatalogEntry {
  path: string;
  format: "step" | "stl";
  size: number;
  modifiedAt: string;
}
export class CatalogError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const within = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

/** All symlinks below the trusted server-start root are excluded, even internal links. */
export function createModelCatalog(configuredRoot = defaultRoot) {
  const configured = resolve(configuredRoot);
  async function rootPath() {
    try {
      const root = await realpath(configured);
      if (!(await lstat(root)).isDirectory()) throw new Error();
      return root;
    } catch {
      throw new CatalogError(
        503,
        "The configured model folder is unavailable. Check CRAFTY_MODEL_ROOT at server start.",
      );
    }
  }
  async function list(): Promise<CatalogEntry[]> {
    const root = await rootPath();
    const files: CatalogEntry[] = [];
    let scanned = 0;
    async function walk(folder: string, depth: number) {
      if (depth > 12)
        throw new CatalogError(
          413,
          "Model folders exceed the 12-level discovery limit.",
        );
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        if (++scanned > MAX_SCANNED)
          throw new CatalogError(
            413,
            "Model folder is too large to scan. Use a smaller root.",
          );
        if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
        const path = join(folder, entry.name);
        const actual = await realpath(path);
        if (!within(root, actual) || (await lstat(path)).isSymbolicLink())
          continue;
        if (entry.isDirectory()) await walk(path, depth + 1);
        else if (entry.isFile() && supported.test(entry.name)) {
          const stat = await lstat(path);
          files.push({
            path: relative(root, path).split(sep).join("/"),
            format: /\.stl$/i.test(entry.name) ? "stl" : "step",
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
          });
          if (files.length > MAX_ENTRIES)
            throw new CatalogError(
              413,
              "More than 1,000 models found. Use a smaller root.",
            );
        }
      }
    }
    try {
      await walk(root, 0);
    } catch (cause) {
      if (cause instanceof CatalogError) throw cause;
      throw new CatalogError(
        503,
        "The model folder changed or could not be read. Refresh to try again.",
      );
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
  async function read(requested: string): Promise<Buffer> {
    if (
      !requested ||
      isAbsolute(requested) ||
      requested.includes("\\") ||
      requested.includes("\0") ||
      /^[a-z]:/i.test(requested) ||
      requested
        .split("/")
        .some(
          (part) =>
            !part || part === "." || part === ".." || part.startsWith("."),
        ) ||
      !supported.test(requested)
    )
      throw new CatalogError(
        400,
        "Choose a relative STEP or STL path from the model gallery.",
      );
    const root = await rootPath();
    let candidate = root;
    try {
      for (const part of requested.split("/")) {
        candidate = join(candidate, part);
        if ((await lstat(candidate)).isSymbolicLink())
          throw new CatalogError(403, "Symlink model paths are not served.");
      }
      const actual = await realpath(candidate);
      if (!within(root, actual))
        throw new CatalogError(
          403,
          "Model path is outside the configured root.",
        );
      const file = await open(
        actual,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const stat = await file.stat();
        if (!stat.isFile())
          throw new CatalogError(
            400,
            "The selected model is not a regular file.",
          );
        // On Linux, validate the opened descriptor too, closing ancestor-symlink races.
        const opened =
          process.platform === "linux"
            ? await realpath(`/proc/self/fd/${file.fd}`)
            : await realpath(candidate);
        if (!within(root, opened))
          throw new CatalogError(
            403,
            "Model path is outside the configured root.",
          );
        if (stat.size > MODEL_LIMITS.bytes)
          throw new CatalogError(
            413,
            "This model is larger than 50 MB. Choose a smaller file.",
          );
        // Bound a file that grows after stat; do not readFile an unbounded descriptor.
        const bytes = Buffer.alloc(
          Math.min(stat.size + 1, MODEL_LIMITS.bytes + 1),
        );
        let used = 0;
        while (used < bytes.length) {
          const next = await file.read(bytes, used, bytes.length - used, used);
          if (!next.bytesRead) break;
          used += next.bytesRead;
        }
        if (used > stat.size)
          throw new CatalogError(
            409,
            "The model changed while being read. Reload it.",
          );
        return bytes.subarray(0, used);
      } finally {
        await file.close();
      }
    } catch (cause) {
      if (cause instanceof CatalogError) throw cause;
      throw new CatalogError(
        404,
        "This model is unavailable. Refresh the gallery to see current files.",
      );
    }
  }
  return { list, read };
}

/** Development-only same-origin relay. No URL proxy or browser-supplied host root. */
export function modelCatalogPlugin(): Plugin {
  const catalog = createModelCatalog(process.env.CRAFTY_MODEL_ROOT);
  return {
    name: "crafty-local-model-catalog",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith(CATALOG_PATH)) {
          next();
          return;
        }
        const send = (status: number, data: object | Buffer) => {
          response.statusCode = status;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.setHeader(
            "Content-Type",
            Buffer.isBuffer(data)
              ? "application/octet-stream"
              : "application/json",
          );
          response.end(Buffer.isBuffer(data) ? data : JSON.stringify(data));
        };
        if (request.method !== "GET") {
          send(405, { error: "Only GET is supported." });
          return;
        }
        void (async () => {
          if (url.pathname === `${CATALOG_PATH}/catalog`)
            send(200, {
              root: "Configured local model folder",
              entries: await catalog.list(),
            });
          else if (url.pathname === `${CATALOG_PATH}/file`)
            send(200, await catalog.read(url.searchParams.get("path") ?? ""));
          else send(404, { error: "Unknown model gallery endpoint." });
        })().catch((cause) =>
          send(cause instanceof CatalogError ? cause.status : 500, {
            error:
              cause instanceof CatalogError
                ? cause.message
                : "The local model gallery could not complete this request.",
          }),
        );
      });
    },
  };
}
