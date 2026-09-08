declare module "occt-import-js" {
  interface OcctMesh {
    name: string;
    color?: [number, number, number];
    attributes: { position: { array: number[] }; normal?: { array: number[] } };
    index: { array: number[] };
  }
  export default function initialize(options: {
    locateFile: (path: string) => string;
  }): Promise<{
    ReadStepFile(
      bytes: Uint8Array,
      settings: object,
    ): { success: boolean; meshes?: OcctMesh[] };
  }>;
}
