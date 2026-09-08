import { useEffect, useState } from "react";
import { canvasBlob, checkCancelled } from "./imageIO";
import type { CollectionImage } from "./types";

const thumbnails = new WeakMap<Blob, Blob>();
const waiting: (() => void)[] = [];
let active = 0;

/** Resize the shared flattened output; never render another set of marks over it. */
async function thumbnail(
  source: Blob,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<Blob> {
  const cached = thumbnails.get(source);
  if (cached) return cached;
  // At most two decodes at once, each producing a bitmap no larger than 384px.
  await new Promise<void>((resolve) => {
    const start = () => {
      active += 1;
      resolve();
    };
    if (active < 2) start();
    else waiting.push(start);
  });
  let bitmap: ImageBitmap | undefined;
  try {
    checkCancelled(signal);
    const scale = Math.min(1, 384 / Math.max(width, height));
    bitmap = await createImageBitmap(source, {
      resizeWidth: Math.max(1, Math.round(width * scale)),
      resizeHeight: Math.max(1, Math.round(height * scale)),
      resizeQuality: "high",
    });
    checkCancelled(signal);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Preview canvas unavailable.");
    context.drawImage(bitmap, 0, 0);
    const png = await canvasBlob(canvas);
    checkCancelled(signal);
    thumbnails.set(source, png);
    return png;
  } finally {
    bitmap?.close();
    active -= 1;
    waiting.shift()?.();
  }
}

export function ImageThumbnail({ image }: { image: CollectionImage }) {
  const blob = image.saved?.png ?? image.source.blob;
  const { width, height } = image.source;
  const [preview, setPreview] = useState<{
    input: Blob;
    url?: string;
    failed?: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void thumbnail(blob, width, height, controller.signal)
      .then((png) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(png);
        setPreview({ input: blob, url });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPreview({ input: blob, failed: true });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob, width, height]);

  // A new saved version must never briefly display the previous version's pixels.
  const current = preview?.input === blob ? preview : null;
  if (!current?.url)
    return (
      <span className="small muted" role="status">
        {current?.failed
          ? "Preview unavailable · open image to inspect"
          : "Preparing preview…"}
      </span>
    );
  return (
    <img
      src={current.url}
      alt=""
      loading="lazy"
      data-thumbnail-version={image.saved?.id ?? "original"}
      onError={() => setPreview({ input: blob, failed: true })}
    />
  );
}
