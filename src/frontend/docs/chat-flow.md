# Chat flow mock

Open `/debug/chat` from the workshop or the Chat navigation link. This is a local
UI rehearsal with a fixed mug-cap repair story. Illustrations, annotations,
camera history, and the model snapshot are fixtures. The mock does not open a
camera, run a model viewer or editor, contact an agent, or store inputs. Leaving
the route or refreshing restores the fixture history.

## Try the flow

1. Open either capture in the **Camera run** card. It selects that capture's
   original version in the asset inspector, including when a newer version exists.
2. Browse the four assets and choose a version under **Version history**. The
   preview and version label show exactly what **Attach v… to input** will add.
3. Attach one or more versions, optionally add a message, then choose
   **Add mock input**. Text alone or images alone also work. Empty input is disabled.
4. Select another asset or revision. Queued attachments and earlier inputs keep
   their chosen images. Opening a submitted thumbnail inspects its exact version.
5. Remove queued images with their labeled remove buttons. The same image version
   cannot be attached twice to one input; different versions of an asset may be
   attached together for comparison.

**Browse assets** moves focus to the assets heading. Camera captures, submitted
images, and lineage links move focus to the selected asset's heading. Native radio
buttons support arrow keys. **View input** returns to the composer. The history
and attachment strips scroll independently and can be reached with the keyboard;
submitting scrolls history to the new input and returns focus to the message field.

## Fixture lineage

- **Mug rim** comes from camera run 1, capture 1. Original **v1** remains available.
  **v2 · Marked rim** adds Arrow and Text marks and demonstrates the outcome of
  replacing the current image within the same asset. The fixture chat input and
  camera card still show v1.
- **Mug profile** is capture 2, with one original version.
- **Rim study** is an independent saved copy of Mug rim v2 with an additional
  Rectangle mark. Its own history starts at v1; the source asset stays at v2.
- **Cap concept** is an illustrated snapshot with a fixed `mug-cap.step` source
  label and isometric view. It is an image fixture, not an evaluated CAD result.

The 82 mm label is illustrative fixture content, not a measured or verified fit.
The SVGs in `public/chat-flow/` are deterministic project illustrations, with no
external assets or image service. Marks are already drawn into these files.

## Component boundary

`ChatDebugPage` supplies `mugCapFixture` to `ChatFlow`. `ChatFlowFixture` contains
assets, initial history, and an initial version selection. All UI data types are
local to `src/features/chat-flow/types.ts`; they do not change the image workspace's
storage contracts. References in a fixture must resolve to one of its versions.
Mount a new `ChatFlow` instance when replacing the whole fixture.

`ChatAsset` owns a source relationship, a fixed revision list, and a current
version ID. A `VersionRef` identifies one asset and one image version.
`snapshotVersion` captures that version's identity, title, labels, image URL, and
alt text into a `PhotoAttachment`. Both the queue and the submitted message hold
these values; history rendering never resolves an asset's current version. A
future data provider must supply stable image URLs for each immutable version.

`AssetView`, `CameraRunCard`, `PhotoStrip`, `ChatHistory`, and `ChatComposer` accept
typed data and callbacks. `useChatFlow` owns the small in-memory selection,
attachment, and submission state. There is no protocol adapter, session manager,
import/export format, backend, or asset persistence implementation.

## Validation

From `src/frontend/`:

```sh
npm run typecheck
npm run build
CRAFTY_TEST_PORT=5307 npm test -- tests/chat-flow.spec.ts tests/routes.spec.ts
```

Set `PLAYWRIGHT_BROWSERS_PATH` to an existing compatible project-local Chromium
cache if needed. The chat tests cover lineage links, exact-version selection and
submission, independent copies, attachment removal, optional text, in-memory reset,
keyboard focus, scrollable strips, and 390/320 px layouts. The route regressions
exercise the existing directory, legacy redirects, gallery, and camera navigation.
Desktop and compact screenshots are inspected during feature acceptance; browser
artifacts stay in the ignored frontend output directories.
