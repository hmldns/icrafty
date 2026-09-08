import type { CSSProperties } from "react";

const paths = {
  arrow: "M5 19 19 5M7 5h12v12",
  right: "M4 12h16m-6-6 6 6-6 6",
  camera: "M8 6 9.5 3h5L16 6h4v14H4V6h4ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  image: "M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M15 7h.01",
  pen: "m4 20 1-5L16 4l4 4L9 19l-5 1Zm10-14 4 4",
  text: "M4 4h16M12 4v16M8 20h8",
  rectangle: "M4 5h16v14H4z",
  undo: "m9 5-5 5 5 5M4 10h10a6 6 0 0 1 0 12",
  redo: "m15 5 5 5-5 5M20 10H10a6 6 0 0 0 0 12",
  close: "m6 6 12 12M6 18 18 6",
  plus: "M12 4v16M4 12h16",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  upload: "M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5",
  check: "m5 12 4 4L19 6",
  link: "m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  lock: "M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4M12 14v3",
  info: "M12 8h.01M12 11v6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  stop: "M6 6h12v12H6z",
  fit: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
