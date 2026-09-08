import { useEffect, useMemo, useRef, useState } from "react";
import type { SourceImage } from "../images/types";
import type { ModelSnapshot } from "../models/types";
import type { CameraItem, HistoryRecord, MessageRecord, ModelItem } from "./historyTypes";
import { projectHistory, readToolResult } from "./projectHistory";
import { sameVersion, snapshotVersion, type AssetSource, type ChatAsset, type ChatFlowFixture, type PhotoAttachment, type VersionRef } from "./types";

/** Local commands alter presentation records; a future adapter can supply these changes. */
export function useChatFlow(fixture: ChatFlowFixture) {
  const [assets, setAssets] = useState(fixture.assets);
  const [records, setRecords] = useState<readonly HistoryRecord[]>(fixture.history);
  const [selection, selectVersion] = useState(fixture.initialSelection);
  const [attachments, setAttachments] = useState<readonly PhotoAttachment[]>([]);
  const [text, setText] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const urls = useRef(new Set<string>());
  const captureNumber = useRef(0);
  const snapshotNumber = useRef(0);
  const items = useMemo(() => projectHistory(records, { assets, models: fixture.models }), [records, assets, fixture.models]);

  useEffect(() => () => {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);

  function attach(photo: PhotoAttachment) {
    setAttachments((current) => current.some((item) => sameVersion(item, photo)) ? current : [...current, { ...photo }]);
    setAnnouncement(`${photo.assetTitle}, v${photo.versionNumber} attached.`);
  }

  function removeAttachment(ref: VersionRef) {
    setAttachments((current) => current.filter((item) => !sameVersion(item, ref)));
    setAnnouncement("Image removed from this message.");
  }

  function keepImage(blob: Blob, title: string, source: AssetSource): PhotoAttachment {
    const imageSrc = URL.createObjectURL(blob);
    urls.current.add(imageSrc);
    const id = crypto.randomUUID();
    const asset: ChatAsset = {
      id, title, source, currentVersionId: `${id}-v1`,
      versions: [{ id: `${id}-v1`, number: 1, label: "Original", imageSrc,
        imageAlt: title, note: "Kept in this conversation until you leave or refresh.", marks: [] }],
    };
    setAssets((current) => [...current, asset]);
    return snapshotVersion([asset], { assetId: id, versionId: asset.currentVersionId });
  }

  async function capture(item: CameraItem, source: SourceImage) {
    const number = ++captureNumber.current;
    const photo = keepImage(source.blob, `Camera photo ${number}`, { kind: "camera", runId: item.tool.toolCallId, capture: item.photos.length + 1 });
    setRecords((current) => current.map((record) => {
      if (record.type !== "tool_call" || record.toolCallId !== item.tool.toolCallId) return record;
      const output = readToolResult(record.rawOutput);
      const photos = Array.isArray(output?.photos) ? output.photos : [];
      return { ...record, rawOutput: { ...output, photos: [...photos, { assetId: photo.assetId, versionId: photo.versionId }] } };
    }));
    attach(photo);
  }

  function snapshot(item: ModelItem, result: ModelSnapshot) {
    const number = ++snapshotNumber.current;
    const photo = keepImage(result.png, `Cap view ${number}`, {
      kind: "model-snapshot", modelName: item.model.name, view: "Chosen camera view",
    });
    attach(photo);
  }

  function submit() {
    if (!text.trim() && attachments.length === 0) return;
    const input: MessageRecord = {
      type: "message", id: `local-${crypto.randomUUID()}`, author: "you", origin: "local",
      text: text.trim(), attachments: attachments.map((photo) => ({ ...photo })),
    };
    setRecords((current) => [...current, input]);
    setAttachments([]);
    setText("");
    setAnnouncement("Message added locally. Its image versions are fixed.");
  }

  return { assets, items, selection, selectVersion, attachments, text, setText, announcement,
    attach, capture, snapshot, removeAttachment, submit };
}
