import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LoadingState, Notice } from "../../components/ui/primitives";
import { decodeImage, errorMessage } from "../images/imageIO";
import { LIMITS, type Mark, type SourceImage } from "../images/types";
import { drawMarks, imagePoint, withModelOutline } from "./geometry";

export type Tool = Mark["kind"];
export function AnnotationCanvas({
  source,
  marks,
  tool,
  color,
  width,
  text,
  fontSize,
  zoom,
  disabled,
  onAdd,
  onReady,
  onError,
}: {
  source: SourceImage;
  marks: Mark[];
  tool: Tool;
  color: string;
  width: number;
  text: string;
  fontSize: number;
  zoom: "fit" | number;
  disabled: boolean;
  onAdd: (mark: Mark) => void;
  onReady: (ready: boolean) => void;
  onError: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [fit, setFit] = useState(1);
  const [active, setActive] = useState<Mark | null>(null);
  const drag = useRef<{ pointerId: number; mark: Mark } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    onReady(false);
    void decodeImage(source.blob, controller.signal)
      .then((bitmap) => {
        if (controller.signal.aborted) {
          bitmap.close();
          return;
        }
        bitmapRef.current = bitmap;
        setReady(true);
        onReady(true);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => {
      controller.abort();
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, [source.blob, onReady]);
  useEffect(() => {
    const element = stageRef.current!;
    const observer = new ResizeObserver(() => {
      setFit(
        Math.max(
          0.01,
          Math.min(
            (element.clientWidth - 48) / source.width,
            (element.clientHeight - 48) / source.height,
            1,
          ),
        ),
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [source.width, source.height]);
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    const bitmap = bitmapRef.current;
    if (!context || !bitmap) return;
    context.clearRect(0, 0, source.width, source.height);
    context.drawImage(bitmap, 0, 0);
    drawMarks(context, active ? [...marks, active] : marks);
  }, [source.width, source.height, ready, marks, active]);

  const position = (event: ReactPointerEvent<HTMLCanvasElement>) =>
    imagePoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      source.width,
      source.height,
    );
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (
      disabled ||
      !ready ||
      event.button !== 0 ||
      !event.isPrimary ||
      drag.current
    )
      return;
    event.preventDefault();
    if (marks.length >= LIMITS.marks) {
      onError(
        "This image has 300 marks. Clear some marks or undo before adding more.",
      );
      return;
    }
    const at = position(event);
    const base = { id: crypto.randomUUID(), color, width };
    if (tool === "text") {
      if (!text.trim()) {
        onError("Enter a text label, then click the image to place it.");
        return;
      }
      onAdd({ ...base, kind: "text", at, text: text.trim(), fontSize });
      return;
    }
    const mark: Mark = withModelOutline(
      source,
      tool === "pen"
        ? { ...base, kind: "pen", points: [at] }
        : { ...base, kind: tool, from: at, to: at },
    );
    drag.current = { pointerId: event.pointerId, mark };
    event.currentTarget.setPointerCapture(event.pointerId);
    setActive(mark);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const at = position(event);
    const mark = current.mark;
    if (mark.kind === "pen") {
      const last = mark.points.at(-1)!;
      if (Math.hypot(at.x - last.x, at.y - last.y) < 0.5) return;
      current.mark = {
        ...mark,
        points: [...mark.points.slice(0, LIMITS.points - 1), at],
      };
    } else if (mark.kind === "arrow" || mark.kind === "rectangle")
      current.mark = { ...mark, to: at };
    setActive(current.mark);
  };
  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    pointerMove(event);
    const mark = drag.current.mark;
    drag.current = null;
    setActive(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    onAdd(mark);
  };
  const scale = zoom === "fit" ? fit : zoom;
  return (
    <div
      ref={stageRef}
      className="canvas-stage"
      tabIndex={0}
      aria-label="Image editing area. Use the toolbar to choose a drawing tool."
    >
      {!ready && !error && (
        <LoadingState>Preparing original image…</LoadingState>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          className={`annotation-canvas annotation-canvas--${tool}`}
          data-testid="annotation-canvas"
          aria-label={`Annotation canvas for ${source.name}`}
          width={source.width}
          height={source.height}
          style={{
            width: source.width * scale,
            height: source.height * scale,
            visibility: ready ? "visible" : "hidden",
          }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setActive(null);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setActive(null);
          }}
        />
      </div>
    </div>
  );
}
