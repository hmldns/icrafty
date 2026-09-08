import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

interface Position { x: number; y: number }
const gutter = 12;

/** One pointer-captured drag handle; resize and keyboard movement stay inside the viewport. */
export function useFloatingPosition() {
  const element = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const drag = useRef<{ pointerId: number; start: Position; origin: Position } | null>(null);
  function bounded(next: Position): Position {
    const box = element.current?.getBoundingClientRect();
    return {
      x: Math.max(gutter, Math.min(next.x, innerWidth - (box?.width ?? 0) - gutter)),
      y: Math.max(gutter, Math.min(next.y, innerHeight - (box?.height ?? 0) - gutter)),
    };
  }
  useEffect(() => {
    const adjust = () => setPosition(current => {
      if (!current) return current;
      const next = bounded(current);
      return next.x === current.x && next.y === current.y ? current : next;
    });
    const observer = new ResizeObserver(adjust);
    if (element.current) observer.observe(element.current);
    window.addEventListener("resize", adjust);
    return () => { observer.disconnect(); window.removeEventListener("resize", adjust); };
  }, []);
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const box = element.current?.getBoundingClientRect();
    if (!box) return;
    drag.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: box.x, y: box.y } };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setPosition(bounded({ x: current.origin.x + event.clientX - current.start.x, y: current.origin.y + event.clientY - current.start.y }));
  };
  const endDrag = () => { drag.current = null; };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const box = element.current?.getBoundingClientRect();
    if (!direction || !box) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 40 : 10;
    setPosition(bounded({ x: box.x + direction[0]! * step, y: box.y + direction[1]! * step }));
  };
  const style: CSSProperties | undefined = position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined;
  return { element, style, handle: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onLostPointerCapture: endDrag, onKeyDown } };
}
