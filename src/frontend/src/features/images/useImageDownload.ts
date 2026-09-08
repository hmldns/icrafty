import { useEffect, useRef, useState } from "react";
import { flattenImage } from "../annotation/geometry";
import { downloadPng, errorMessage } from "./imageIO";
import type { CollectionImage } from "./types";

export function useImageDownload(image: CollectionImage) {
  const operation = useRef<AbortController | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => () => operation.current?.abort(), []);

  const download = async () => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setDownloading(true);
    setError("");
    setStatus("");
    try {
      const png = await flattenImage(
        image.source,
        image.draft.history.present,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      downloadPng(png, image.source.name);
      setStatus(`Downloaded ${image.source.name} as PNG.`);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  };

  return { download, downloading, error, status };
}
