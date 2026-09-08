import { canvasBlob, decodeImage } from "../images/imageIO";
import {
  LIMITS,
  type EditHistory,
  type Mark,
  type Point,
  type SourceImage,
} from "../images/types";

const INK = "#252923";
const PAPER = "#ffffff";
export const ANNOTATION_COLORS = [
  { name: "Vermilion", value: "#bc402a" },
  { name: "Ink", value: INK },
  { name: "Paper", value: PAPER },
  { name: "Blue", value: "#245fbb" },
  { name: "Green", value: "#32714a" },
] as const;

/** Persist the edge on new model marks so editor, drafts and PNGs agree. */
export function withModelOutline(source: SourceImage, mark: Mark): Mark {
  if (source.origin !== "model" || mark.outline) return mark;
  return {
    ...mark,
    outline: {
      color: mark.color.toLowerCase() === PAPER ? INK : PAPER,
      width:
        mark.kind === "text"
          ? Math.max(1.5, mark.fontSize / 20)
          : Math.max(1.5, mark.width / 4),
    },
  };
}

export function imagePoint(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
  width: number,
  height: number,
): Point {
  return {
    x: Math.max(
      0,
      Math.min(width, ((clientX - bounds.left) * width) / bounds.width),
    ),
    y: Math.max(
      0,
      Math.min(height, ((clientY - bounds.top) * height) / bounds.height),
    ),
  };
}
export function commitMarks(history: EditHistory, marks: Mark[]): EditHistory {
  return {
    past: [...history.past, history.present].slice(-LIMITS.history),
    present: marks,
    future: [],
  };
}
export function undoHistory(history: EditHistory): EditHistory {
  const previous = history.past.at(-1);
  return previous
    ? {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      }
    : history;
}
export function redoHistory(history: EditHistory): EditHistory {
  const next = history.future[0];
  return next
    ? {
        past: [...history.past, history.present],
        present: next,
        future: history.future.slice(1),
      }
    : history;
}

export function drawMarks(
  context: CanvasRenderingContext2D,
  marks: readonly Mark[],
) {
  for (const mark of marks) {
    context.save();
    context.strokeStyle = mark.color;
    context.fillStyle = mark.color;
    context.lineWidth = mark.width;
    context.lineCap = "round";
    context.lineJoin = "round";
    const stroke = () => {
      if (mark.outline) {
        context.strokeStyle = mark.outline.color;
        context.lineWidth = mark.width + mark.outline.width * 2;
        context.stroke();
      }
      context.strokeStyle = mark.color;
      context.lineWidth = mark.width;
      context.stroke();
    };
    context.beginPath();
    if (mark.kind === "pen") {
      const first = mark.points[0];
      if (first) {
        if (mark.points.length === 1) {
          if (mark.outline) {
            context.fillStyle = mark.outline.color;
            context.arc(
              first.x,
              first.y,
              mark.width / 2 + mark.outline.width,
              0,
              Math.PI * 2,
            );
            context.fill();
            context.beginPath();
            context.fillStyle = mark.color;
          }
          context.arc(first.x, first.y, mark.width / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.moveTo(first.x, first.y);
          mark.points
            .slice(1)
            .forEach((point) => context.lineTo(point.x, point.y));
          stroke();
        }
      }
    } else if (mark.kind === "text") {
      context.font = `600 ${mark.fontSize}px system-ui, sans-serif`;
      context.textBaseline = "top";
      if (mark.outline) {
        context.strokeStyle = mark.outline.color;
        context.lineWidth = mark.outline.width * 2;
        context.strokeText(mark.text, mark.at.x, mark.at.y);
      }
      context.fillText(mark.text, mark.at.x, mark.at.y);
    } else if (mark.kind === "rectangle") {
      context.rect(
        mark.from.x,
        mark.from.y,
        mark.to.x - mark.from.x,
        mark.to.y - mark.from.y,
      );
      stroke();
    } else {
      const angle = Math.atan2(
        mark.to.y - mark.from.y,
        mark.to.x - mark.from.x,
      );
      const head = Math.max(mark.width * 4, 14);
      context.moveTo(mark.from.x, mark.from.y);
      context.lineTo(mark.to.x, mark.to.y);
      context.moveTo(
        mark.to.x - head * Math.cos(angle - Math.PI / 6),
        mark.to.y - head * Math.sin(angle - Math.PI / 6),
      );
      context.lineTo(mark.to.x, mark.to.y);
      context.lineTo(
        mark.to.x - head * Math.cos(angle + Math.PI / 6),
        mark.to.y - head * Math.sin(angle + Math.PI / 6),
      );
      stroke();
    }
    context.restore();
  }
}

export async function flattenImage(
  source: SourceImage,
  marks: readonly Mark[],
  signal?: AbortSignal,
): Promise<Blob> {
  const bitmap = await decodeImage(source.blob, signal);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "The browser could not create an export canvas. Try a smaller image.",
      );
    context.drawImage(bitmap, 0, 0);
    drawMarks(context, marks);
    return await canvasBlob(canvas);
  } finally {
    bitmap.close();
  }
}
