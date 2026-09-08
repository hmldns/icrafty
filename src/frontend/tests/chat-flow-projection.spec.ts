import { expect, test } from "@playwright/test";
import { mugCapFixture } from "../src/features/chat-flow/fixtures";
import { projectHistory, projectToolCall } from "../src/features/chat-flow/projectHistory";
import type { ToolCallRecord } from "../src/features/chat-flow/historyTypes";

const catalog = { assets: mugCapFixture.assets, models: mugCapFixture.models };
const camera = mugCapFixture.history.find((record): record is ToolCallRecord => record.type === "tool_call" && record.name === "camera.capture")!;

test("tool results project to domain items and updates keep their original place", () => {
  const items = projectHistory(mugCapFixture.history, catalog);
  expect(items.map((item) => item.type)).toEqual(["message", "message", "camera", "message", "image", "message", "model", "tool"]);
  const image = items.find((item) => item.type === "image")!;
  expect(image.photo.versionId).toBe("rim-v2");
  expect(image.photo.imageSrc).toBe("/chat-flow/mug-rim-marked.svg");
  const pending = { ...camera, status: "pending" as const, rawOutput: undefined };
  const updated = projectHistory([mugCapFixture.history[0]!, pending, mugCapFixture.history[1]!, camera], catalog);
  expect(updated).toHaveLength(3);
  expect(updated[1]).toMatchObject({ id: `tool-${camera.toolCallId}`, type: "camera", tool: { status: "completed" } });
  expect(updated[2]?.type).toBe("message");
});

test("unknown, incomplete and invalid results retain a generic item without treating input as output", () => {
  for (const record of [
    { ...camera, rawInput: camera.rawOutput, rawOutput: undefined },
    { ...camera, rawOutput: "{incomplete" },
    { ...camera, rawOutput: { view: "camera", caption: "Missing image", photos: [{ assetId: "missing", versionId: "v1" }] } },
    { ...camera, name: "unknown.tool", rawOutput: { summary: "A new activity" } },
    { ...camera, rawOutput: undefined, status: "failed" as const },
  ]) {
    const item = projectToolCall(record, catalog);
    expect(item.type).toBe("tool");
    expect(item.id).toBe(`tool-${camera.toolCallId}`);
    expect("tool" in item && item.tool).toBe(record);
  }
});
