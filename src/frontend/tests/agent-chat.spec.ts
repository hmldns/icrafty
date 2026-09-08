import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
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
      const key = (item: AgentRecord) => item.type === "message" ? item.id : item.toolCallId;
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
  app.emit("c", "record", { type: "message", id: "reply", author: "crafty", origin: "agent", text: "A pale blue cap.", imageIds: [] });
  await expect(reply.getByText("A pale blue cap.", { exact: true })).toBeVisible();
  await expect(reply).toHaveCount(1);
  app.emit("c", "record", { type: "tool_call", toolCallId: "published", name: "images.show", title: "Cap sketch", status: "completed",
    rawOutput: { schema_version: 1, view: "image", image: { assetId: asset.id, versionId: "1" }, caption: "The concept" } });
  app.finish("c");
  await expect(reply.getByText("Writing…", { exact: true })).toHaveCount(0);
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
  const state = app.states.get("b")!.session;
  app.emit("b", "session", { ...state, turnStatus: "waiting_permission", permissions: [{ id: "permission", toolCall: { title: "Read local image" },
    options: [{ optionId: "reject", name: "Deny this action", kind: "reject_once" }] }] });
  await expect(page.getByRole("button", { name: "Deny this action", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Deny this action", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  expect(app.commands.find(c => c.action === "permissions")!.body.optionId).toBe("reject");
  await choose(page, "Mug repair");
  await expect(page.getByRole("textbox")).toHaveValue("Keep this draft");
  await expect(history(page).getByText("Work on the handle", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  expect(app.commands.at(-1)?.action).toBe("cancel");
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
  await card.getByRole("button", { name: "Start camera", exact: true }).click();
  await card.getByRole("button", { name: "Capture image", exact: true }).click();
  await expect(card.getByRole("list", { name: "Camera photos" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Selected attachments" }).getByRole("img")).toHaveCount(1);
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
