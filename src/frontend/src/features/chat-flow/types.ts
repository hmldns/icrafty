import type { ChatModel, HistoryRecord } from "./historyTypes";

/** Local presentation data. Asset identity and an image version are separate. */
export interface VersionRef {
  readonly assetId: string;
  readonly versionId: string;
}

export interface ImageVersion {
  readonly id: string;
  readonly number: number;
  readonly label: string;
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly illustrative?: boolean;
  readonly note: string;
  readonly marks: readonly ("arrow" | "text" | "rectangle")[];
  readonly replaces?: VersionRef;
}

export type AssetSource =
  | { readonly kind: "upload" | "generated" | "cad" }
  | { readonly kind: "camera"; readonly runId: string; readonly capture: number }
  | { readonly kind: "saved-copy"; readonly from: VersionRef }
  | {
      readonly kind: "model-snapshot";
      readonly modelName: string;
      readonly view: string;
    };

export interface ChatAsset {
  readonly id: string;
  readonly title: string;
  readonly source: AssetSource;
  readonly currentVersionId: string;
  readonly versions: readonly [ImageVersion, ...ImageVersion[]];
}

/** Captured display data: rendering an input never follows an asset's current version. */
export interface PhotoAttachment extends VersionRef {
  readonly assetTitle: string;
  readonly versionNumber: number;
  readonly versionLabel: string;
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly illustrative?: boolean;
}

export interface ChatInput {
  readonly text: string;
  readonly attachments: readonly PhotoAttachment[];
}

export interface ChatFlowFixture {
  readonly title: string;
  readonly assets: readonly ChatAsset[];
  readonly history: readonly HistoryRecord[];
  readonly models: readonly ChatModel[];
  readonly initialSelection: VersionRef;
}

export function resolveVersion(assets: readonly ChatAsset[], ref: VersionRef) {
  const asset = assets.find((item) => item.id === ref.assetId);
  const version = asset?.versions.find((item) => item.id === ref.versionId);
  if (!asset || !version) {
    throw new Error("Chat fixture refers to a missing image version.");
  }
  return { asset, version };
}

export function snapshotVersion(
  assets: readonly ChatAsset[],
  ref: VersionRef,
): PhotoAttachment {
  const { asset, version } = resolveVersion(assets, ref);
  return {
    assetId: asset.id,
    versionId: version.id,
    assetTitle: asset.title,
    versionNumber: version.number,
    versionLabel: version.label,
    imageSrc: version.imageSrc,
    imageAlt: version.imageAlt,
    illustrative: version.illustrative,
  };
}

export function sameVersion(left: VersionRef, right: VersionRef) {
  return left.assetId === right.assetId && left.versionId === right.versionId;
}

export function versionKey(ref: VersionRef) {
  return `${ref.assetId}/${ref.versionId}`;
}
