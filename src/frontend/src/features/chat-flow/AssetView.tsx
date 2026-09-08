import { useId, type Ref } from "react";
import { Icon } from "../../components/ui/Icon";
import { Badge, Button, Card, cx } from "../../components/ui/primitives";
import { resolveVersion, type ChatAsset, type VersionRef } from "./types";

function VersionLink({
  assets,
  versionRef,
  onInspect,
}: {
  assets: readonly ChatAsset[];
  versionRef: VersionRef;
  onInspect: (ref: VersionRef) => void;
}) {
  const { asset, version } = resolveVersion(assets, versionRef);
  return (
    <a
      href="#chat-asset-detail"
      className="chat-text-link"
      onClick={(event) => {
        event.preventDefault();
        onInspect(versionRef);
      }}
    >
      {asset.title} · v{version.number}
    </a>
  );
}

export function AssetView({
  assets,
  selection,
  attached,
  attachmentCount,
  onSelect,
  onInspect,
  onAttach,
  onReturnToInput,
  headingRef,
  detailHeadingRef,
}: {
  assets: readonly ChatAsset[];
  selection: VersionRef;
  attached: boolean;
  attachmentCount: number;
  onSelect: (ref: VersionRef) => void;
  onInspect: (ref: VersionRef) => void;
  onAttach: () => void;
  onReturnToInput: () => void;
  headingRef: Ref<HTMLHeadingElement>;
  detailHeadingRef: Ref<HTMLHeadingElement>;
}) {
  const { asset, version } = resolveVersion(assets, selection);
  const radioGroup = useId();
  const markLabels = { arrow: "Arrow", text: "Text", rectangle: "Rectangle" } as const;
  const sourceLabels = {
    camera: "Camera photo",
    "saved-copy": "Saved copy",
    "model-snapshot": "Model snapshot",
  } as const;
  const versionCount = assets.reduce((count, item) => count + item.versions.length, 0);

  return (
    <Card className="chat-assets">
      <section aria-labelledby="chat-assets-title">
        <div className="section-heading">
          <div>
            <h2 id="chat-assets-title" ref={headingRef} tabIndex={-1}>
              Assets
            </h2>
            <p>{assets.length} assets · {versionCount} image versions</p>
          </div>
          <Icon name="grid" size={20} />
        </div>
        <ul className="chat-asset-grid" aria-label="Fixture assets">
          {assets.map((item) => {
            const currentRef = { assetId: item.id, versionId: item.currentVersionId };
            const current = resolveVersion(assets, currentRef).version;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cx(
                    "chat-asset-button",
                    item.id === asset.id && "chat-asset-button--selected",
                  )}
                  aria-pressed={item.id === asset.id}
                  onClick={() => onSelect(currentRef)}
                >
                  <img src={current.imageSrc} alt="" width="640" height="480" />
                  <span>
                    <strong>{item.title}</strong>
                    <span>{sourceLabels[item.source.kind]}</span>
                    <span>
                      {item.versions.length} {item.versions.length === 1 ? "version" : "versions"}
                      {" · current v"}{current.number}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="chat-asset-detail" aria-labelledby="chat-asset-detail">
        <div className="chat-detail-heading">
          <div>
            <p className="eyebrow">Selected asset</p>
            <h3 id="chat-asset-detail" ref={detailHeadingRef} tabIndex={-1}>
              {asset.title}
            </h3>
          </div>
          <Badge tone={version.id === asset.currentVersionId ? "success" : "neutral"}>
            {version.id === asset.currentVersionId ? "Current" : "Earlier version"} · v{version.number}
          </Badge>
        </div>
        <figure className="chat-asset-preview">
          <img
            src={version.imageSrc}
            alt={version.imageAlt}
            width="640"
            height="480"
          />
          <figcaption>
            v{version.number} · {version.label}
            <span>{version.illustrative ? "Illustrative fixture" : asset.source.kind === "camera" ? "Camera capture" : "Saved view"}</span>
          </figcaption>
        </figure>
        <fieldset className="chat-version-picker">
          <legend>
            Version history <span>· choose what to attach</span>
          </legend>
          {asset.versions.map((item) => (
            <label
              key={item.id}
              className={cx(
                "chat-version-option",
                item.id === version.id && "chat-version-option--selected",
              )}
            >
              <input
                type="radio"
                name={radioGroup}
                value={item.id}
                checked={version.id === item.id}
                onChange={() => onSelect({ assetId: asset.id, versionId: item.id })}
              />
              <span>v{item.number} · {item.label}</span>
              {item.id === asset.currentVersionId && (
                <span className="chat-current-label">Current</span>
              )}
            </label>
          ))}
        </fieldset>
        <div className="chat-lineage">
          <p>
            {asset.source.kind === "camera" ? (
              <>Source: Camera run · capture {asset.source.capture}.</>
            ) : asset.source.kind === "saved-copy" ? (
              <>
                Saved independently from{" "}
                <VersionLink
                  assets={assets}
                  versionRef={asset.source.from}
                  onInspect={onInspect}
                />.
              </>
            ) : (
              <>Source: {asset.source.modelName} · {asset.source.view} view.</>
            )}
          </p>
          <p>{version.note}</p>
          {version.replaces && (
            <p>
              Replaces{" "}
              <VersionLink
                assets={assets}
                versionRef={version.replaces}
                onInspect={onInspect}
              /> within the same asset.
            </p>
          )}
          {version.marks.length > 0 && (
            <ul className="chat-marks" aria-label="Saved annotation marks">
              {version.marks.map((mark) => (
                <li key={mark}><Icon name={mark} size={14} />{markLabels[mark]}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="chat-asset-actions">
          <Button
            icon={attached ? "check" : "plus"}
            disabled={attached}
            onClick={onAttach}
          >
            {attached ? `v${version.number} attached` : `Attach v${version.number} to input`}
          </Button>
          <Button variant="ghost" onClick={onReturnToInput}>
            Back to message{attachmentCount > 0 ? ` (${attachmentCount})` : ""}
            <Icon name="right" size={16} />
          </Button>
        </div>
        <p className="chat-fixture-note">
          Browsing another version keeps attached images as chosen.
        </p>
      </section>
    </Card>
  );
}
