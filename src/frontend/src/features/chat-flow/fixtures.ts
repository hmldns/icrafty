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
        illustrative: true,
        imageAlt: "Illustrated camera photo of a green mug seen from above, with its bare rim visible.",
        note: "The first capture, before any marks were added.",
        marks: [],
      },
      {
        id: "rim-v2",
        number: 2,
        label: "Marked rim",
        imageSrc: "/chat-flow/mug-rim-marked.svg",
        illustrative: true,
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
        illustrative: true,
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
        illustrative: true,
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
        illustrative: true,
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
  models: [{ id: "cap-model", name: "mug-cap-concept.stl", url: "/chat-flow/mug-cap-concept.stl", format: "stl" }],
  initialSelection: { assetId: "mug-rim", versionId: "rim-v2" },
  history: [
    {
      type: "message", id: "opening", author: "you", origin: "fixture",
      text: "The cap for my favourite mug is missing. Can we make a simple replacement?",
      attachments: [],
    },
    {
      type: "message", id: "request-photos", author: "crafty", origin: "fixture",
      text: "Let’s look at the opening and the lip first. Take a view from above and one from the side.",
      attachments: [],
    },
    {
      type: "tool_call", toolCallId: "camera-run-1", name: "camera.capture",
      title: "A closer look at the mug", status: "completed",
      rawInput: { views: ["rim", "profile"] },
      rawOutput: {
        view: "camera", caption: "Choose the photos you want to share, or open the camera to take another view.",
        photos: [{ assetId: "mug-rim", versionId: "rim-v1" }, { assetId: "mug-side", versionId: "side-v1" }],
      },
    },
    {
      type: "message", id: "first-photo-input", author: "you", origin: "fixture",
      text: "Here’s the opening. I’ve marked the diameter too.",
      attachments: [snapshotVersion(assets, { assetId: "mug-rim", versionId: "rim-v1" })],
    },
    {
      type: "tool_call", toolCallId: "marked-rim", name: "images.show",
      title: "The rim, with your measurement", status: "completed",
      rawInput: { assetId: "mug-rim", versionId: "rim-v2" },
      rawOutput: JSON.stringify({
        view: "image", image: { assetId: "mug-rim", versionId: "rim-v2" },
        caption: "The arrow picks out the opening. This marked version can travel with your next message.",
      }),
    },
    {
      type: "message", id: "introduce-model", author: "crafty", origin: "fixture",
      text: "A shallow cap with a small lip could work. Turn this first shape around and show me the view you want to discuss.",
      attachments: [],
    },
    {
      type: "tool_call", toolCallId: "cap-preview", name: "models.show",
      title: "A first shape for the cap", status: "completed",
      rawInput: { modelId: "cap-model" },
      rawOutput: { structuredContent: {
        view: "model", modelId: "cap-model", caption: "Drag to turn the cap. Attach a snapshot of the view you choose.",
      } },
    },
    {
      type: "tool_call", toolCallId: "design-note", name: "repair.note",
      title: "Keep the handle clear", status: "completed",
      rawInput: { topic: "handle clearance" },
      rawOutput: { summary: "Leave space around the handle when refining the lip." },
    },
  ],
};
