import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cadRecord, cadResult, checkFixture } from "./cad-fixture";
import type { AgentEvent, AgentImage, AgentRecord, AgentSnapshot } from "../src/features/agent-chat/types";
import { drawLine, instrumentCamera, makeImage, trackStates } from "./helpers";

/** Explicit application-API fixture. Real ACP/MCP framing is tested by agent/. */
async function harness(page: Page) {
  const states = new Map<string, AgentSnapshot>();
  const sockets = new Map<string, WebSocketRoute>();
  const events = new Map<string, AgentEvent[]>();
  const commands: { id: string; action: string; body: any }[] = [];
  const cursors: number[] = [];
  const bytes = new Map<string, Buffer>();
  let sequence = 0;
  const create = (id: string, title: string): AgentSnapshot => {
    const snapshot: AgentSnapshot = { schemaVersion: 1, session: { id, title, updatedAt: new Date().toISOString(),
      runtime: "ready", activeTurnId: null, turnStatus: null, error: null, model: "Explicit browser fixture", permissions: [] },
      records: [], assets: [], interactions: [], cursor: sequence };
    states.set(id, snapshot); events.set(id, []); return snapshot;
  };
  create("a", "Mug repair"); create("b", "Handle repair");
  function emit(id: string, kind: AgentEvent["kind"], payload: any) {
    const state = states.get(id)!;
    if (kind === "session") state.session = payload;
    if (kind === "asset") state.assets.push(payload);
    if (kind === "record") {
      const key = (item: AgentRecord) => item.type === "tool_call" ? item.toolCallId : item.id;
      const index = state.records.findIndex(item => key(item) === key(payload));
      if (index < 0) state.records.push(payload); else state.records[index] = payload;
    }
    const event = { seq: ++sequence, kind, payload } as AgentEvent;
    state.cursor = sequence; events.get(id)!.push(event); sockets.get(id)?.send(JSON.stringify(event));
    return event;
  }
  function finish(id: string) {
    emit(id, "session", { ...states.get(id)!.session, activeTurnId: null, turnStatus: "completed", permissions: [] });
  }
  await page.routeWebSocket("**/api/agent/sessions/*/events?*", socket => {
    const url = new URL(socket.url());
    const id = url.pathname.split("/")[4]!;
    const cursor = Number(url.searchParams.get("after"));
    cursors.push(cursor); sockets.set(id, socket);
    for (const event of events.get(id) ?? []) if (event.seq > cursor) socket.send(JSON.stringify(event));
  });
  await page.route("**/api/agent/**", async route => {
    const request = route.request(), url = new URL(request.url());
    const parts = url.pathname.split("/").slice(3);
    const id = parts[1] ?? "", action = parts[2] ?? "";
    let result: unknown;
    if (parts.length === 1) {
      result = request.method() === "POST" ? create("c", "New chat") : { sessions: [...states.values()].map(s => s.session) };
    } else {
      const state = states.get(id)!;
      if (!state) { await route.fulfill({ status: 404, json: { detail: "Missing chat" } }); return; }
      if (request.method() === "GET" && action === "images") {
        await route.fulfill({ body: bytes.get(parts[3]!)!, contentType: "image/png",
          headers: url.searchParams.has("download") ? { "Content-Disposition": "attachment; filename=sketch.png" } : {} });
        return;
      }
      if (request.method() === "POST") {
        const body = action === "images" ? null : request.postDataJSON();
        commands.push({ id, action, body });
        if (action === "images") {
          const aid = `image-${sequence}`;
          bytes.set(aid, request.postDataBuffer()!);
          const asset: AgentImage = { id: aid, versionId: "1", title: url.searchParams.get("title")!,
            width: 800, height: 600, mimeType: "image/png", size: bytes.get(aid)!.length,
            digest: "test-digest", origin: "upload", url: `/api/agent/sessions/${id}/images/${aid}` };
          emit(id, "asset", asset); result = asset;
        } else if (action === "messages") {
          emit(id, "record", { type: "message", id: body.clientMessageId, author: "you", origin: "agent", text: body.text, imageIds: body.imageIds });
          emit(id, "session", { ...state.session, activeTurnId: body.clientMessageId, turnStatus: "running" });
          result = { id: body.clientMessageId };
        } else if (action === "cancel" || action === "permissions") {
          finish(id); result = state;
        } else if (action === "measurements") {
          const record = state.records.find(r => r.type === "tool_call" && (r.rawOutput as any)?.requestId === parts[3])!;
          if (record.type === "tool_call") {
            emit(id, "record", { ...record, rawOutput: { ...(record.rawOutput as object), status: "answered", answers: body.answers } });
            emit(id, "record", { type: "message", id: body.clientMessageId, author: "you", origin: "agent", text: "Measurements submitted", imageIds: [] });
            emit(id, "session", { ...state.session, activeTurnId: body.clientMessageId, turnStatus: "running" });
          }
          result = { id: body.clientMessageId };
        } else if (action === "captures") {
          const record = state.records.find(r => r.type === "tool_call" && r.toolCallId === parts[3])!;
          emit(id, "record", { ...record, rawOutput: { schema_version: 1, view: "camera", caption: "Show the rim",
            photos: [{ assetId: body.assetId, versionId: "1" }], interactionStatus: "captured" } });
          result = state;
        } else {
          emit(id, "session", { ...state.session, runtime: action === "stop" ? "stopped" : "ready" }); result = state;
        }
      } else result = state;
    }
    await route.fulfill({ json: result });
  });
  return { states, sockets, commands, cursors, bytes, create, emit, finish };
}

const history = (page: Page) => page.getByRole("list", { name: "Chat history", exact: true });
const choose = (page: Page, title: string) => page.getByRole("complementary", { name: "Chats" }).getByRole("list").getByRole("button", { name: new RegExp(title) }).click();

test("CAD progress stays in place, preserves failed checks and resolves late image references", async ({ page }) => {
  const app = await harness(page);
  const image = await makeImage(page);
  await page.goto("/");
  const card = page.getByRole("article", { name: "Cylinder evidence", exact: true });
  app.emit("a", "record", cadRecord(cadResult()));
  await expect(card.getByText("Rendering view…", { exact: true })).toBeVisible();
  const ref = { assetId: "cad-image", versionId: "1" };
  const completed = cadResult({ operationVersion: 3, status: "completed", phase: "published", publicationId: "publication-1",
    outputs: [{ id: "iso", kind: "png", status: "ready", image: ref }, { id: "top", kind: "png", status: "error", reason: { code: "render_failed", message: "Top view could not render" } }],
    images: [ref], metrics: [checkFixture], interpretation: "**Adjust the width** before using this draft." });
  app.emit("a", "record", cadRecord(completed));
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Loading image reference…", { exact: true })).toBeVisible();
  await expect(card.locator('[data-check-status="fail"]')).toContainText("19.7 mm");
  await expect(card.getByText("Top view could not render", { exact: true })).toBeVisible();
  await expect(card.getByRole("link", { name: /Download STEP/ })).toHaveCount(0);
  app.bytes.set(ref.assetId, image.buffer);
  app.emit("a", "asset", { id: ref.assetId, versionId: "1", title: "Cylinder iso", origin: "cad", width: 800, height: 600,
    mimeType: "image/png", size: image.buffer.length, digest: "test-image", url: `/api/agent/sessions/a/images/${ref.assetId}` });
  await expect(card.getByRole("img", { name: "Cylinder iso" })).toBeVisible();
  await expect(card.locator('.cad-interpretation strong')).toHaveText("Adjust the width");
  await card.getByRole("button", { name: "Attach view", exact: true }).click();
  await expect(page.getByRole("list", { name: "Selected attachments", exact: true }).getByRole("img")).toHaveCount(1);
  await page.reload();
  await expect(card.getByRole("img", { name: "Cylinder iso" })).toBeVisible();
  app.emit("a", "record", cadRecord(cadResult({ operationVersion: 2 })));
  await expect(card.locator('.cad-result')).toHaveAttribute("data-operation-status", "completed");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("CAD STEP preview uses recorded bytes, survives progress, downloads and releases on collapse", async ({ page }) => {
  const app = await harness(page);
  const bytes = await readFile("tooling/models/rounded-cube.step");
  const file = { id: "step-1", url: "/api/agent/sessions/a/cad/artifacts/step-1", downloadUrl: "/api/agent/sessions/a/cad/artifacts/step-1?download=true",
    filename: "part.step", format: "step", mediaType: "model/step", sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  let loads = 0;
  await page.route("**/cad/artifacts/step-1*", route => {
    loads++;
    return route.fulfill({ body: bytes, contentType: "model/step", headers: route.request().url().includes("download=true") ? { "Content-Disposition": 'attachment; filename="part.step"' } : {} });
  });
  const result = cadResult({ status: "completed", phase: "published", outputs: [{ id: "solid", kind: "step", status: "ready", file }],
    requestedOutputs: [{ id: "solid", kind: "step", parts: ["body"] }], downloads: [file],
    model: { ...file, revisionId: "revision-1", geometryDigest: "c".repeat(64), units: "mm", frame: "right-handed-z-up" } });
  app.emit("a", "record", cadRecord(result));
  await page.goto("/");
  const card = page.getByRole("article", { name: "Cylinder evidence", exact: true });
  expect(loads).toBe(0);
  await card.getByRole("button", { name: "Open 3D preview", exact: true }).click();
  await expect(card.locator('.chat-inline-model')).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  const initialLoads = loads; // React StrictMode may abort and remount the initial effect.
  await card.locator('canvas').evaluate(canvas => canvas.setAttribute('data-retained', 'yes'));
  app.emit("a", "record", cadRecord({ ...result, operationVersion: 2, interpretation: "Added a note." }));
  await expect(card.getByText("Added a note.", { exact: true })).toBeVisible();
  await expect(card.locator('canvas')).toHaveAttribute("data-retained", "yes");
  expect(loads).toBe(initialLoads);
  await card.getByRole("button", { name: "Attach this view", exact: true }).click();
  await expect(page.getByRole("list", { name: "Selected attachments", exact: true }).getByRole("img")).toHaveCount(1);
  // Download navigations bypass page routing in Chromium. Native byte delivery is
  // covered by backend/live checks; verify this link and its identical bytes here.
  await expect(card.getByRole("link", { name: /Download STEP/ })).toHaveAttribute("href", file.downloadUrl);
  await expect(card.getByRole("link", { name: /Download STEP/ })).toHaveAttribute("download", "part.step");
  const downloadHash = await page.evaluate(async url => {
    const data = await (await fetch(url)).arrayBuffer();
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), value => value.toString(16).padStart(2, "0")).join("");
  }, file.downloadUrl);
  expect(downloadHash).toBe(file.sha256);
  await card.locator('.chat-interaction-toggle').click();
  await expect(card.locator('canvas')).toHaveCount(0);
});

test("per-image CAD publication keeps distinct cards and cancellation uses its operation", async ({ page }) => {
  const app = await harness(page);
  const image = await makeImage(page);
  for (const aid of ["iso", "top"]) {
    app.bytes.set(aid, image.buffer);
    app.emit("a", "asset", { id: aid, versionId: "1", title: aid, origin: "cad", width: 800, height: 600,
      mimeType: "image/png", size: image.buffer.length, digest: "test-image", url: `/api/agent/sessions/a/images/${aid}` });
  }
  const outputs = ["iso", "top"].map(id => ({ id, kind: "png", status: "ready", image: { assetId: id, versionId: "1" } }));
  const result = cadResult({ status: "completed", phase: "published", outputs, images: [outputs[0]!.image],
    presentation: { messageMode: "per_image", index: 0, count: 2 } });
  app.emit("a", "record", cadRecord(result));
  app.emit("a", "record", cadRecord({ ...result, images: [outputs[1]!.image], presentation: { messageMode: "per_image", index: 1, count: 2 } }, ":1"));
  let cancelled = false;
  await page.route("**/cad/operations/cancellable/cancel", async route => {
    cancelled = true;
    app.emit("a", "record", cadRecord(cadResult({ operationId: "cancellable", status: "cancelled", phase: "cancelled", title: "Another part" })));
    await route.fulfill({ json: {} });
  });
  await page.goto("/");
  const cards = page.getByRole("article", { name: "Cylinder evidence", exact: true });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByRole("img")).toHaveCount(1);
  await expect(cards.nth(1).getByRole("img")).toHaveCount(1);
  await expect(cards.nth(0).getByRole("img")).toHaveAttribute("alt", "iso");
  await expect(cards.nth(1).getByRole("img")).toHaveAttribute("alt", "top");
  app.emit("a", "record", cadRecord(cadResult({ operationId: "cancellable", title: "Another part" })));
  const active = page.getByRole("article", { name: "Another part", exact: true });
  await active.getByRole("button", { name: "Stop CAD", exact: true }).click();
  await expect(active.locator('.cad-result')).toHaveAttribute("data-operation-status", "cancelled");
  expect(cancelled).toBe(true);
});

test("main repair surface sends sample photos and measurement answers in the real components", async ({ page }) => {
  const app = await harness(page);
  const file = await makeImage(page);
  const sample = { id: "mug-cap", title: "A cap for my mug", description: "Four views of the mug.", prompt: "I need a cap. Ask for measurements.",
    photos: ["side", "rim", "top", "angle"].map(id => ({ id, title: `Mug ${id}`, url: `/sample-${id}.png`, digest: "fixture" })) };
  await page.route("**/api/agent/samples", route => route.fulfill({ json: { samples: [sample] } }));
  await page.route("**/sample-*.png", route => route.fulfill({ body: file.buffer, contentType: "image/png" }));
  await page.goto("/");
  await expect(page).toHaveURL("/?repair=a");
  await expect(page).toHaveTitle("icrafty · Your repairs");
  await expect(page.getByRole("complementary", { name: "Repairs" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Repairs" }).getByRole("link", { name: "icrafty home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "UI gallery", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try the mug cap", exact: true }).click();
  await expect(history(page).getByRole("img")).toHaveCount(4);
  expect(app.commands.filter(command => command.action === "images")).toHaveLength(4);
  const sent = app.commands.find(command => command.action === "messages")!;
  expect(sent.body.text).toBe(sample.prompt);
  expect(sent.body.imageIds).toHaveLength(4);
  const image = app.states.get("c")!.assets[0]!;
  const form = { view: "measurements", requestId: "rim-measurements", title: "Measure the rim", caption: "Use your caliper.",
    fields: [{ id: "diameter", label: "Inside diameter", kind: "number", unit: "mm", hint: "Place the small jaws inside the rim." },
      { id: "depth", label: "Seat depth", kind: "number", unit: "mm" }, { id: "fit", label: "Intended fit", kind: "text" }],
    photos: [{ assetId: image.id, versionId: "1" }], status: "awaiting_answers", answers: {} };
  app.emit("c", "record", { type: "tool_call", toolCallId: "measure", name: "measurements.request", title: "Request measurements", status: "completed", rawOutput: form });
  const card = page.getByRole("article", { name: "Measure the rim", exact: true });
  await expect(card.getByRole("list", { name: "Measurement reference photos" }).getByRole("img")).toHaveCount(1);
  await card.getByLabel("Inside diameter · mm").fill("83.4");
  await card.getByLabel("Intended fit").fill("Lift-off dust cover");
  await expect(card.getByRole("button", { name: "Send measurements", exact: true })).toBeDisabled();
  app.finish("c");
  await card.locator(".chat-interaction-toggle").click();
  await expect(card.locator(".chat-interaction-body")).toHaveCSS("height", "0px");
  await card.locator(".chat-interaction-toggle").click();
  await expect(card.getByLabel("Inside diameter · mm")).toHaveValue("83.4");
  await card.getByRole("button", { name: "Send measurements", exact: true }).click();
  await expect(card.getByText("Measurements sent", { exact: true })).toBeVisible();
  expect(app.commands.filter(command => command.action === "measurements")).toHaveLength(1);
  expect(app.commands.at(-1)!.body.answers).toEqual({ diameter: "83.4", fit: "Lift-off dust cover" });
  await expect(card.getByText("Not measured", { exact: true })).toBeVisible();
  app.emit("c", "record", { type: "message", id: "after-measurements", author: "crafty", origin: "agent", text: "I can now draft the cap with that fit.", imageIds: [] });
  app.finish("c");
  await expect(history(page).getByText("I can now draft the cap with that fit.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL("/?repair=c");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(card.getByText("83.4 mm", { exact: true })).toBeVisible();
  await expect(history(page).getByText("Measurements submitted", { exact: true })).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(844);
  await expect(page.getByRole("textbox", { name: "Message (optional)" })).toBeVisible();
  await page.getByRole("button", { name: "Show repairs", exact: true }).click();
  await expect(page.getByRole("button", { name: "New repair", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New repair", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Show repairs", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "New repair", exact: true })).not.toBeVisible();
});

test("real mounted components upload, stream, show MCP images, download and restore saved history", async ({ page }) => {
  const app = await harness(page);
  await page.goto("/debug/agent");
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  await page.getByRole("button", { name: "Photos", exact: true }).click();
  await page.getByLabel("Upload chat images").setInputFiles(await makeImage(page));
  await expect(page.getByRole("list", { name: "Saved chat images" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Back to chat", exact: true }).click();
  await page.getByRole("textbox").fill("Inspect this cap");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(history(page).getByRole("img")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  const asset = app.states.get("c")!.assets[0]!;
  app.emit("c", "record", { type: "message", id: "reply", author: "crafty", origin: "agent", text: "A pale", imageIds: [] });
  const reply = history(page).getByRole("article", { name: "Live message from icrafty" });
  await expect(reply.getByText("A pale", { exact: true })).toBeVisible();
  await expect(reply).toHaveAttribute("aria-busy", "true");
  await expect(reply.getByText("Writing…", { exact: true })).toBeVisible();
  const caret = reply.locator(".chat-streaming-caret");
  const blink = await caret.evaluate(async element => {
    const animation = element.getAnimations()[0]!;
    animation.pause(); await animation.ready;
    animation.currentTime = 0;
    const lit = getComputedStyle(element).opacity;
    animation.currentTime = Number(animation.effect!.getTiming().duration) * .75;
    const dark = getComputedStyle(element).opacity;
    const previous = element.previousElementSibling!.getBoundingClientRect();
    const cursor = element.getBoundingClientRect();
    animation.play();
    return { lit, dark, inline: cursor.x >= previous.right && cursor.top < previous.bottom };
  });
  expect(blink).toEqual({ lit: "1", dark: "0", inline: true });
  app.emit("c", "record", { type: "message", id: "reply", author: "crafty", origin: "agent", text: "A pale blue cap.", imageIds: [] });
  await expect(reply.getByText("A pale blue cap.", { exact: true })).toBeVisible();
  await expect(reply).toHaveCount(1);
  app.emit("c", "record", { type: "tool_call", toolCallId: "published", name: "images.show", title: "Cap sketch", status: "completed",
    rawOutput: { schema_version: 1, view: "image", image: { assetId: asset.id, versionId: "1" }, caption: "The concept" } });
  app.finish("c");
  await expect(reply.getByText("Writing…", { exact: true })).toHaveCount(0);
  await expect(caret).toHaveCount(0);
  const card = page.getByRole("article", { name: "workpiece.png", exact: true });
  await expect(card.getByRole("img")).toBeVisible();
  await expect(history(page).getByText("A pale blue cap.", { exact: true })).toHaveCount(1);
  await card.getByRole("button", { name: "Versions & details", exact: true }).click();
  // Chromium's download navigation bypasses page routing; real download bytes are
  // checked by the HTTP suite and live acceptance. Check the mounted link here.
  await expect(page.getByRole("link", { name: "Download image", exact: true })).toHaveAttribute("href", `${asset.url}?download=true`);
  await page.getByRole("dialog").getByRole("button", { name: "Attach image", exact: true }).click();
  await expect(page.getByRole("list", { name: "Selected attachments" }).getByRole("img")).toHaveCount(1);
  expect(app.commands.find(c => c.action === "messages")!.body.imageIds).toEqual([asset.id]);
  await page.reload();
  await choose(page, "New chat");
  await expect(card.getByRole("img")).toBeVisible();
  expect(app.commands.filter(c => c.action === "open")).toHaveLength(0);
});

test("image generation shows real tool progress and waits for preview bytes", async ({ page }) => {
  const app = await harness(page);
  await page.goto("/debug/agent");
  await expect.poll(() => app.sockets.has("a")).toBe(true);
  const call = { type: "tool_call" as const, toolCallId: "generation", name: "tool", title: "Image generation" };
  app.emit("a", "record", { ...call, status: "pending" });
  const activity = page.getByRole("article", { name: "Image generation", exact: true });
  await expect(activity).toContainText("Waiting to start…");
  app.emit("a", "record", { ...call, status: "in_progress" });
  await expect(activity).toContainText("Generating image…");
  await expect(activity).toHaveAttribute("aria-busy", "true");
  await expect(activity.locator(".spinner")).toBeVisible();
  await activity.locator(".chat-interaction-toggle").click();
  await expect(activity.getByText("Preview unavailable", { exact: true })).toHaveCount(0);
  app.emit("a", "record", { ...call, status: "completed" });
  await expect(activity).toContainText("Completed");
  await expect(activity.locator(".spinner")).toHaveCount(0);
  await expect(activity).not.toHaveAttribute("aria-busy", "true");

  const file = await makeImage(page);
  const image: AgentImage = { id: "generated", versionId: "1", title: "Generated cap", origin: "generated",
    width: 800, height: 600, size: file.buffer.length, digest: "fixture", mimeType: "image/png",
    url: "/delayed-generated-cap.png" };
  let releaseImage!: () => void;
  const released = new Promise<void>(resolve => { releaseImage = resolve; });
  await page.route(image.url, async route => {
    await released;
    await route.fulfill({ body: file.buffer, contentType: "image/png" });
  });
  app.emit("a", "asset", image);
  app.emit("a", "record", { type: "tool_call", toolCallId: "published", name: "images.show", title: "Cap sketch", status: "completed",
    rawOutput: { view: "image", image: { assetId: image.id, versionId: "1" }, caption: "The concept" } });
  const card = page.getByRole("article", { name: "Generated cap", exact: true });
  await expect(card.getByRole("status")).toHaveText("Loading preview…");
  await expect(card.locator(".chat-image-preview")).toHaveAttribute("aria-busy", "true");
  releaseImage();
  await expect(card.getByRole("img")).toBeVisible();
  await expect(card.getByRole("status")).toHaveCount(0);
  expect(await card.getByRole("img").evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  app.emit("a", "record", { ...call, toolCallId: "failed-generation", status: "failed" });
  const failed = page.locator('[data-tool-call-id="failed-generation"]');
  await expect(failed).toContainText("Could not complete");
  await expect(failed.locator(".spinner")).toHaveCount(0);
});

test("pasted attachments edit in place, retain Undo across chats, and send the saved pixels", async ({ page }) => {
  const app = await harness(page);
  await page.goto("/debug/agent");
  const file = await makeImage(page);
  await page.getByRole("textbox").evaluate((element, base64) => {
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], "pasted.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, file.buffer.toString("base64"));
  const selected = page.getByRole("list", { name: "Selected attachments" });
  await expect(selected.getByRole("img")).toHaveCount(1);
  const original = app.states.get("a")!.assets[0]!;
  const originalBytes = app.bytes.get(original.id)!;
  // A past message referencing this asset must keep its original bytes.
  app.emit("a", "record", { type: "message", id: "past", author: "you", origin: "agent", text: "Previous photo", imageIds: [original.id] });
  await selected.getByRole("link", { name: /^Annotate pasted.png/ }).click();
  const editor = page.getByRole("dialog", { name: "Annotate image" });
  await expect(editor.getByRole("button", { name: "Save image", exact: true })).toBeEnabled();
  await expect(page.getByRole("list", { name: "Saved chat images" })).toHaveCount(0);
  await expect(editor.locator(".revision-details")).toHaveCount(0);
  await drawLine(page);
  await editor.getByRole("button", { name: "Save image", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(selected.getByRole("img")).toHaveCount(1);
  await expect(selected.getByRole("img")).toHaveAttribute("src", /^blob:/);
  expect(app.commands.filter(c => c.action === "images")).toHaveLength(1);
  await choose(page, "Handle repair");
  await expect(page.getByRole("list", { name: "Selected attachments" })).toHaveCount(0);
  await choose(page, "Mug repair");
  await selected.getByRole("link", { name: /^Annotate pasted.png/ }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  await editor.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("0 marks");
  await editor.getByRole("button", { name: /^Redo/ }).click();
  await expect(page.getByTestId("mark-count")).toHaveText("1 mark");
  await editor.getByRole("button", { name: "Save image", exact: true }).click();
  const preview = await selected.getByRole("img").evaluate(async image => {
    const blob = await (await fetch((image as HTMLImageElement).src)).blob();
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByRole("textbox").fill("Measure the marked rim");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(selected).toHaveCount(0);
  const sent = app.commands.find(c => c.action === "messages")!;
  expect(sent.body.imageIds).toHaveLength(1);
  expect(sent.body.imageIds[0]).not.toBe(original.id);
  const submittedBytes = app.bytes.get(sent.body.imageIds[0])!;
  expect(submittedBytes).toEqual(Buffer.from(preview));
  expect(submittedBytes).not.toEqual(originalBytes);
  expect(app.bytes.get(original.id)).toEqual(originalBytes);
  await expect(history(page).getByRole("img").first()).toHaveAttribute("src", original.url);
  await expect(history(page).getByRole("img").last()).toHaveAttribute("src", app.states.get("a")!.assets.at(-1)!.url);
});

test("session switches preserve drafts, isolate events, and offer actual permission choices and Stop", async ({ page }) => {
  const app = await harness(page);
  await page.goto("/debug/agent");
  await page.getByRole("textbox").fill("Keep this draft");
  await choose(page, "Handle repair");
  await page.getByRole("textbox").fill("Work on the handle");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Codex is working…" })).toBeVisible();
  const state = app.states.get("b")!.session;
  app.emit("b", "session", { ...state, turnStatus: "waiting_permission", permissions: [{ id: "permission", toolCall: { title: "Read local image" },
    options: [{ optionId: "reject", name: "Deny this action", kind: "reject_once" }] }] });
  await expect(page.getByRole("button", { name: "Deny this action", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Waiting for your approval" })).toBeVisible();
  await page.getByRole("button", { name: "Deny this action", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await expect(page.locator(".agent-activity")).toHaveCount(0);
  expect(app.commands.find(c => c.action === "permissions")!.body.optionId).toBe("reject");
  await choose(page, "Mug repair");
  await expect(page.getByRole("textbox")).toHaveValue("Keep this draft");
  await expect(history(page).getByText("Work on the handle", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  expect(app.commands.at(-1)?.action).toBe("cancel");
});

test("thoughts and replies stream Markdown in compact expandable blocks with running animation", async ({ page }) => {
  const app = await harness(page);
  await page.goto("/debug/agent");
  await page.getByRole("textbox").fill("Design the cap");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Codex is working…", { exact: true })).toBeVisible();
  expect(await page.locator(".agent-working-dots i").first().evaluate(el => getComputedStyle(el).animationName)).toBe("agent-working");
  const turnId = app.states.get("a")!.session.activeTurnId!;
  app.emit("a", "record", { type: "thought", id: "thinking", turnId, text: "**Checking fit**" });
  const thoughts = page.getByRole("article", { name: "Thinking", exact: true });
  await expect(thoughts.locator("strong").filter({ hasText: "Checking fit" })).toBeVisible();
  await expect(thoughts).toHaveAttribute("data-streaming", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(thoughts.locator(".chat-streaming-caret")).toHaveCSS("animation-name", "none");
  await expect(thoughts.locator(".chat-streaming-caret")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect((await thoughts.getByRole("button").boundingBox())!.height).toBeLessThan(48);
  const fullThought = "**Checking fit**\n\n- Measure the rim\n- Use `calipers`\n\n[Measurement notes](https://example.test/notes)";
  app.emit("a", "record", { type: "thought", id: "thinking", turnId, text: fullThought });
  await expect(thoughts.getByRole("listitem")).toHaveCount(2);
  await expect(thoughts.locator("code")).toHaveText("calipers");
  await thoughts.getByRole("button").click();
  app.emit("a", "record", { type: "thought", id: "thinking", turnId, text: fullThought + "\n\nKeep clearance." });
  await expect(thoughts.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Expand items", exact: true }).click();
  await expect(thoughts.getByRole("link", { name: "Measurement notes" })).toHaveAttribute("href", "https://example.test/notes");
  app.emit("a", "record", { type: "message", id: "reply", author: "crafty", origin: "agent", text: "## Fit\n\nUse **calipers**.\n\n```python\nclearance = 0.2\n```\n\n| Part | Size |\n| --- | --- |\n| Rim | 80 mm |\n\n<script>alert(1)</script>", imageIds: [] });
  const reply = history(page).getByRole("article", { name: "Live message from icrafty" });
  await expect(reply.getByRole("heading", { name: "Fit" })).toBeVisible();
  await expect(reply.locator("pre code")).toHaveText("clearance = 0.2\n");
  await expect(reply.getByRole("cell", { name: "80 mm" })).toBeVisible();
  await expect(reply.locator("script")).toHaveCount(0);
  await expect(thoughts).not.toHaveAttribute("data-streaming", "true");
  app.finish("a");
  await expect(page.locator(".agent-activity")).toHaveCount(0);
  await page.reload();
  await expect(thoughts.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  await thoughts.getByRole("button").click();
  await expect(thoughts.getByText("Keep clearance.", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("reconnect continues after durable cursor without duplicating history or opening ACP", async ({ page }) => {
  const app = await harness(page);
  await page.goto("/debug/agent");
  await expect.poll(() => app.sockets.has("a")).toBe(true);
  const event = app.emit("a", "record", { type: "message", id: "one", author: "crafty", origin: "agent", text: "Saved reply", imageIds: [] });
  await expect(history(page).getByText("Saved reply", { exact: true })).toHaveCount(1);
  app.sockets.get("a")!.send(JSON.stringify(event));
  app.sockets.get("a")!.close({ code: 1012, reason: "Test reconnect" });
  await expect.poll(() => app.cursors.length).toBe(2);
  expect(app.cursors[1]).toBe(event.seq);
  await expect(history(page).getByText("Saved reply", { exact: true })).toHaveCount(1);
  expect(app.commands).toEqual([]);
});

test("MCP camera captures upload into the request and composer and release tracks on session switch", async ({ page }) => {
  const app = await harness(page);
  app.emit("a", "record", { type: "tool_call", toolCallId: "camera", name: "camera.capture", title: "Fresh photo", status: "completed",
    rawOutput: { schema_version: 1, view: "camera", caption: "Show the rim", photos: [] } });
  await instrumentCamera(page);
  await page.goto("/debug/agent");
  const card = page.getByRole("article", { name: "Camera request", exact: true });
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(0);
  await card.getByRole("button", { name: "Open camera", exact: true }).click();
  const widget = page.getByRole("region", { name: "Camera widget", exact: true });
  await widget.getByRole("button", { name: "Capture image", exact: true }).click();
  await expect(card.getByRole("list", { name: "Camera photos" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Selected attachments" }).getByRole("img")).toHaveCount(1);
  await card.locator(".chat-interaction-toggle").click();
  await expect(widget).toHaveAttribute("data-compact", "true");
  expect(await trackStates(page)).toEqual(["live"]);
  await choose(page, "Handle repair");
  await expect.poll(() => trackStates(page)).toEqual(["ended"]);
  await choose(page, "Mug repair");
  await expect(card.getByRole("list", { name: "Camera photos" }).getByRole("listitem")).toHaveCount(1);
  expect(await page.evaluate(() => window.testCamera.calls.length)).toBe(1);
});

test("mobile layout and backend errors remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/agent/**", route => route.fulfill({ status: 503, json: { detail: "Start the local agent service" } }));
  await page.goto("/debug/agent");
  await expect(page.getByText("Start the local agent service", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
