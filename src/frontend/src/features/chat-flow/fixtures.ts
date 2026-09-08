import { snapshotVersion, type ChatAsset, type ChatFlowFixture } from "./types";

const assets: readonly ChatAsset[] = [
  {
    id: "mug-rim",
    title: "Mug rim",
    source: { kind: "camera", runId: "camera-run-1", capture: 1 },
    currentVersionId: "rim-v2",
    versions: [
      {
        id: "rim-v1",
        number: 1,
        label: "Original",
        imageSrc: "/chat-flow/mug-rim.svg",
        imageAlt: "Illustrated camera photo of a green mug seen from above, with its bare rim visible.",
        note: "The first capture, before any marks were added.",
        marks: [],
      },
      {
        id: "rim-v2",
        number: 2,
        label: "Marked rim",
        imageSrc: "/chat-flow/mug-rim-marked.svg",
        imageAlt: "The mug rim photo with a terracotta arrow and an 82 mm label across the opening.",
        note: "Replace outcome: the marked image became this asset’s current version. The original is still available as v1.",
        marks: ["arrow", "text"],
        replaces: { assetId: "mug-rim", versionId: "rim-v1" },
      },
    ],
  },
  {
    id: "mug-side",
    title: "Mug profile",
    source: { kind: "camera", runId: "camera-run-1", capture: 2 },
    currentVersionId: "side-v1",
    versions: [
      {
        id: "side-v1",
        number: 1,
        label: "Original",
        imageSrc: "/chat-flow/mug-side.svg",
        imageAlt: "Illustrated camera photo of the green mug from the side, showing the rim and handle.",
        note: "The second capture shows the outside lip and the handle clearance.",
        marks: [],
      },
    ],
  },
  {
    id: "rim-study",
    title: "Rim study",
    source: { kind: "saved-copy", from: { assetId: "mug-rim", versionId: "rim-v2" } },
    currentVersionId: "study-v1",
    versions: [
      {
        id: "study-v1",
        number: 1,
        label: "Seal detail",
        imageSrc: "/chat-flow/rim-study.svg",
        imageAlt: "A saved copy of the marked mug rim photo, with a rectangle and a seal here note at the lip.",
        note: "Save copy outcome: this is a separate asset with its own version history. Mug rim stays at v2.",
        marks: ["arrow", "text", "rectangle"],
      },
    ],
  },
  {
    id: "cap-snapshot",
    title: "Cap concept",
    source: { kind: "model-snapshot", modelName: "mug-cap.step", view: "Isometric" },
    currentVersionId: "cap-v1",
    versions: [
      {
        id: "cap-v1",
        number: 1,
        label: "Model snapshot",
        imageSrc: "/chat-flow/cap-snapshot.svg",
        imageAlt: "Illustrated isometric model snapshot of a circular green replacement cap with a raised edge.",
        note: "A fixed illustration of a model view, saved as an image for the conversation.",
        marks: [],
      },
    ],
  },
];

export const mugCapFixture: ChatFlowFixture = {
  title: "A cap for the everyday mug",
  assets,
  initialSelection: { assetId: "mug-rim", versionId: "rim-v2" },
  history: [
    {
      kind: "message",
      id: "opening",
      author: "you",
      origin: "fixture",
      text: "The cap for my favourite mug is missing. I’d like to make a simple replacement.",
      attachments: [],
    },
    {
      kind: "message",
      id: "request-photos",
      author: "crafty",
      origin: "fixture",
      text: "Let’s start with the opening and the outside lip. A view from above and one from the side will help.",
      attachments: [],
    },
    {
      kind: "camera-run",
      id: "camera-run-1",
      title: "A closer look at the mug",
      caption: "Two captures added to the assets. Open either one to inspect its original version.",
      captures: [
        snapshotVersion(assets, { assetId: "mug-rim", versionId: "rim-v1" }),
        snapshotVersion(assets, { assetId: "mug-side", versionId: "side-v1" }),
      ],
    },
    {
      kind: "message",
      id: "first-photo-input",
      author: "you",
      origin: "fixture",
      text: "Here’s the opening before I added the measurements.",
      attachments: [snapshotVersion(assets, { assetId: "mug-rim", versionId: "rim-v1" })],
    },
  ],
};
