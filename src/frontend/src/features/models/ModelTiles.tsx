import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ModelFormat } from "./types";
import type { ModelLoadEvent } from "./ModelViewer";

export type TilePlacement = "side" | "top" | "bottom";
const placementKey = "crafty:model-tile-placement";

export function useTilePlacement() {
  const [placement, setPlacement] = useState<TilePlacement>(() => {
    try {
      const saved = localStorage.getItem(placementKey);
      if (saved === "side" || saved === "top" || saved === "bottom")
        return saved;
    } catch {
      /* A denied preference store does not block viewing. */
    }
    return window.matchMedia("(min-width: 901px)").matches ? "side" : "top";
  });
  return [
    placement,
    (next: TilePlacement) => {
      setPlacement(next);
      try {
        localStorage.setItem(placementKey, next);
      } catch {
        /* Session-only preference. */
      }
    },
  ] as const;
}

interface Preview {
  state: ModelLoadEvent["state"];
  url?: string;
}

/** Only the active renderer produces a thumbnail. Keep at most 24 small PNGs. */
export function useModelPreviews() {
  const cache = useRef(new Map<string, Preview>());
  const [previews, setPreviews] = useState<ReadonlyMap<string, Preview>>(
    new Map(),
  );
  const clear = useCallback(() => {
    for (const item of cache.current.values())
      if (item.url) URL.revokeObjectURL(item.url);
    cache.current.clear();
  }, []);
  useEffect(() => clear, [clear]);
  const clearPreviews = useCallback(() => {
    clear();
    setPreviews(new Map());
  }, [clear]);
  return {
    previews,
    clearPreviews,
    recordPreview: (id: string, event: ModelLoadEvent) => {
      const previous = cache.current.get(id);
      if (previous?.url) URL.revokeObjectURL(previous.url);
      cache.current.delete(id);
      cache.current.set(id, {
        state: event.state,
        ...(event.preview ? { url: URL.createObjectURL(event.preview) } : {}),
      });
      while (cache.current.size > 24) {
        const oldest = cache.current.keys().next().value!;
        const item = cache.current.get(oldest)!;
        if (item.url) URL.revokeObjectURL(item.url);
        cache.current.delete(oldest);
      }
      setPreviews(new Map(cache.current));
    },
  };
}

export interface ModelTile {
  id: string;
  name: string;
  format: ModelFormat;
}

export function ModelTiles({
  tiles,
  selected,
  previews,
  onSelect,
}: {
  tiles: ModelTile[];
  selected: string;
  previews: ReadonlyMap<string, Preview>;
  onSelect: (id: string) => void;
}) {
  const statusId = useId();
  return (
    <nav className="model-tiles card" aria-label="Model files">
      <div className="model-tiles-heading">
        <h2>Model files</h2>
        <span>{tiles.length}</span>
      </div>
      <div
        className="model-tile-scroll"
        tabIndex={0}
        aria-label="Scroll model files"
      >
        {tiles.map((tile, index) => {
          const preview = previews.get(tile.id);
          const active = tile.id === selected;
          const state =
            !active && preview?.state === "loading"
              ? "unopened"
              : (preview?.state ?? (active ? "loading" : "unopened"));
          return (
            <button
              type="button"
              key={tile.id}
              className="model-tile"
              aria-pressed={active}
              aria-label={`Open ${tile.name}`}
              aria-describedby={`${statusId}-${index}`}
              data-model-id={tile.id}
              data-state={state}
              onClick={() => onSelect(tile.id)}
            >
              <span className="model-tile-preview">
                {preview?.url ? (
                  <img src={preview.url} alt="" />
                ) : (
                  <span>{tile.format.toUpperCase()}</span>
                )}
              </span>
              <span className="model-tile-name" title={tile.name}>
                {tile.name}
              </span>
              <span className="model-tile-status" id={`${statusId}-${index}`}>
                {state === "loading"
                  ? "Loading…"
                  : state === "error"
                    ? "Could not load"
                    : active
                      ? "Selected"
                      : preview?.url
                        ? "Preview"
                        : "Not previewed"}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
