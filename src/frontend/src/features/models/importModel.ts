import { MODEL_LIMITS, type ImportedModel, type ModelSource } from "./types";
import type { ImportReply } from "./import.worker";

async function sourceBytes(
  data: ModelSource["data"],
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  if (data instanceof Blob) {
    if (data.size > MODEL_LIMITS.bytes)
      throw new Error(
        "This model is larger than 50 MB. Choose a smaller file.",
      );
    return data.arrayBuffer();
  }
  const url = new URL(data, window.location.href);
  if (
    !["http:", "https:", "blob:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use a browser-safe HTTP, HTTPS, or blob model URL without credentials.",
    );
  const response = await fetch(url, {
    signal,
    mode: "cors",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Model request returned HTTP ${response.status}. Refresh the gallery or choose a local file.`,
    );
  }
  if (!response.body)
    throw new Error("The model request returned no readable data.");
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  try {
    if (Number(response.headers.get("content-length")) > MODEL_LIMITS.bytes)
      throw new Error("This model is larger than 50 MB.");
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MODEL_LIMITS.bytes)
        throw new Error("This model is larger than 50 MB.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return new Blob(chunks).arrayBuffer();
}

/** One short-lived worker per import. Aborting also terminates synchronous WASM work. */
export async function importModel(
  source: ModelSource,
  signal: AbortSignal,
): Promise<ImportedModel> {
  const timeout = AbortSignal.timeout(MODEL_LIMITS.timeoutMs);
  const combined = AbortSignal.any([signal, timeout]);
  try {
    const bytes = await sourceBytes(source.data, combined);
    combined.throwIfAborted();
    return await new Promise<ImportedModel>((resolve, reject) => {
      const worker = new Worker(
        new URL("./import.worker.ts", import.meta.url),
        { type: "module" },
      );
      const finish = (error?: Error, model?: ImportedModel) => {
        combined.removeEventListener("abort", cancel);
        worker.terminate();
        if (error) reject(error);
        else if (model) resolve(model);
      };
      const cancel = () =>
        finish(new DOMException("Model loading cancelled", "AbortError"));
      combined.addEventListener("abort", cancel, { once: true });
      worker.onmessage = (event: MessageEvent<ImportReply>) => {
        if ("error" in event.data) finish(new Error(event.data.error));
        else finish(undefined, event.data.model);
      };
      worker.onerror = () =>
        finish(
          new Error(
            "The model worker could not load. Check that its JavaScript and WASM assets are served, then retry.",
          ),
        );
      worker.onmessageerror = () =>
        finish(new Error("The model worker returned unreadable data."));
      worker.postMessage({ bytes, format: source.format }, [bytes]);
    });
  } catch (cause) {
    if (signal.aborted)
      throw new DOMException("Model loading cancelled", "AbortError");
    if (timeout.aborted)
      throw new Error("Model loading exceeded 60 seconds. Try a smaller file.");
    if (cause instanceof TypeError)
      throw new Error(
        "Could not fetch this model. Check its URL and CORS permissions, or choose a local file.",
      );
    throw cause;
  }
}
