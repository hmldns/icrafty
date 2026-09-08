import { LIMITS, type SourceImage } from "./types";

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return "Browser storage is full. Download your work, then delete some images to make room.";
  return error instanceof Error ? error.message : fallback;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    )
  );
}

export function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

export async function decodeImage(
  blob: Blob,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  checkCancelled(signal);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error(
      "This image could not be decoded. Try a different PNG, JPEG or WebP file.",
    );
  }
  if (signal?.aborted) {
    bitmap.close();
    checkCancelled(signal);
  }
  return bitmap;
}

function imageType(bytes: Uint8Array): string | null {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  const header = String.fromCharCode(...bytes);
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP")
    return "image/webp";
  return null;
}

export async function prepareImage(
  blob: Blob,
  name: string,
  origin: SourceImage["origin"],
  signal?: AbortSignal,
): Promise<SourceImage> {
  if (!blob.size)
    throw new Error("This file is empty. Choose an image with content.");
  if (blob.size > LIMITS.fileBytes)
    throw new Error("This image is larger than 12 MB. Choose a smaller image.");
  const mime = imageType(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
  checkCancelled(signal);
  if (!mime)
    throw new Error(
      "Unsupported image. Choose a PNG, JPEG or WebP; SVG and GIF are not supported.",
    );
  const original = blob.slice(0, blob.size, mime);
  const bitmap = await decodeImage(original, signal);
  const { width, height } = bitmap;
  bitmap.close();
  if (
    width > LIMITS.dimension ||
    height > LIMITS.dimension ||
    width * height > LIMITS.pixels
  )
    throw new Error(
      "This image is too large to edit safely. Use up to 16 megapixels and 8,192 pixels per side.",
    );
  return {
    id: crypto.randomUUID(),
    name: name.slice(0, 160) || "Untitled image",
    origin,
    blob: original,
    width,
    height,
    createdAt: new Date().toISOString(),
  };
}

export async function imageFromUrl(
  value: string,
  signal: AbortSignal,
): Promise<SourceImage> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Enter a full image URL beginning with https:// or http://.",
    );
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use a public HTTP or HTTPS image URL without credentials.",
    );
  checkCancelled(signal);
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), 20_000);
  const cancel = () => timeout.abort();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: timeout.signal,
      });
    } catch {
      checkCancelled(signal);
      if (timeout.signal.aborted)
        throw new Error(
          "The image request timed out. Try again or download the file and add it here.",
        );
      throw new Error(
        "Could not fetch this image. The host may block cross-origin access (CORS), or the network is unavailable. Download it and add the file instead.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `The image host returned HTTP ${response.status}. Check the URL or add a local file.`,
      );
    }
    if (Number(response.headers.get("content-length")) > LIMITS.fileBytes) {
      await response.body?.cancel();
      throw new Error(
        "This image is larger than 12 MB. Choose a smaller image.",
      );
    }
    if (!response.body)
      throw new Error("The image host returned no readable data.");
    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    let length = 0;
    try {
      while (true) {
        const result = await reader.read();
        checkCancelled(signal);
        if (result.done) break;
        length += result.value.byteLength;
        if (length > LIMITS.fileBytes)
          throw new Error(
            "This image is larger than 12 MB. Choose a smaller image.",
          );
        chunks.push(result.value as Uint8Array<ArrayBuffer>);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    let name = "Web image";
    try {
      name = decodeURIComponent(url.pathname.split("/").pop() || name);
    } catch {
      /* Keep a useful fallback for malformed URL escapes. */
    }
    return await prepareImage(new Blob(chunks), name, "url", signal);
  } catch (error) {
    checkCancelled(signal);
    if (timeout.signal.aborted)
      throw new Error(
        "The image request timed out. Try again or add a local file.",
      );
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("PNG export failed. Try a smaller image.")),
        "image/png",
      );
    } catch {
      reject(
        new Error(
          "This image cannot be exported by the browser. Try importing it as a local file.",
        ),
      );
    }
  });
}

let downloadSequence = 0;
export function downloadPng(blob: Blob, name: string): string {
  const base =
    name
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 60) || "image";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${base}-annotated-${timestamp}-${++downloadSequence}.png`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // A short grace period lets browsers consume the download before revocation.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
