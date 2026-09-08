import type { MeshBasicMaterial } from "three";
import type { Axis } from "./types";

/** Thin 45-degree lines anchored in the plane's millimeter coordinates. */
export function addSectionHatching(
  material: MeshBasicMaterial,
  axis: Axis,
  spacing: number,
  reverse: boolean,
) {
  const coordinates = { x: "yz", y: "xz", z: "xy" }[axis];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sectionSpacing = { value: spacing };
    shader.vertexShader =
      `varying vec2 sectionPoint;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\nsectionPoint = position.${coordinates};`,
      );
    shader.fragmentShader =
      `varying vec2 sectionPoint;\nuniform float sectionSpacing;\n${shader.fragmentShader}`.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
       float sectionPhase = (sectionPoint.x ${reverse ? "-" : "+"} sectionPoint.y) / (sectionSpacing * 1.41421356);
       float sectionPixel = max(fwidth(sectionPhase), 0.00001);
       float sectionDistance = abs(fract(sectionPhase + 0.5) - 0.5);
       float sectionLine = 1.0 - smoothstep(sectionPixel * 0.3, sectionPixel * 0.8, sectionDistance);
       // Fade dense lines at distant zoom levels to avoid moire.
       float sectionVisibility = 1.0 - smoothstep(0.2, 0.65, sectionPixel);
       diffuseColor.rgb *= 1.0 - 0.12 * sectionLine * sectionVisibility;`,
      );
  };
  material.customProgramCacheKey = () =>
    `section-hatch:${coordinates}:${reverse}`;
}
