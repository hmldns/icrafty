export const CAMERA_ASPECTS = [
  { id: "1:1", label: "Square · 1:1", width: 1, height: 1 },
  { id: "4:3", label: "Landscape · 4:3", width: 4, height: 3 },
  { id: "3:4", label: "Portrait · 3:4", width: 3, height: 4 },
  { id: "16:9", label: "Wide · 16:9", width: 16, height: 9 },
  { id: "9:16", label: "Tall · 9:16", width: 9, height: 16 },
] as const;

export type CameraAspectId = (typeof CAMERA_ASPECTS)[number]["id"];

/** Match the centered object-fit: cover preview without stretching the image. */
export function cameraCrop(
  sourceWidth: number,
  sourceHeight: number,
  aspect: { width: number; height: number },
) {
  const scale = Math.min(
    sourceWidth / aspect.width,
    sourceHeight / aspect.height,
  );
  const width = aspect.width * scale;
  const height = aspect.height * scale;
  // Whole ratio units keep the PNG's aspect exact, with no upscaling.
  const outputScale = Math.floor(scale);
  return {
    x: (sourceWidth - width) / 2,
    y: (sourceHeight - height) / 2,
    width,
    height,
    outputWidth: aspect.width * outputScale,
    outputHeight: aspect.height * outputScale,
  };
}
