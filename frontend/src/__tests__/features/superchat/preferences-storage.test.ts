// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadScopedMessageIds,
  loadSuperChatSettings,
  saveScopedMessageIds,
  saveSuperChatSettings,
} from "@/features/superchat/preferences-storage";

const SETTINGS_KEY = "superchat:settings";

function messageSetKey(scopeKey: string, kind: "pinned" | "deleted"): string {
  return `superchat:${kind}:${scopeKey}`;
}

describe("SuperChat settings storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when settings are missing or malformed", () => {
    const defaults = {
      showToolEvents: false,
      showStructuredSourceWhileStreaming: true,
    };

    expect(loadSuperChatSettings()).toEqual(defaults);
    localStorage.setItem(SETTINGS_KEY, "{not json");
    expect(loadSuperChatSettings()).toEqual(defaults);
  });

  it("fills missing fields and persists explicit values", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ showToolEvents: true }));
    expect(loadSuperChatSettings()).toEqual({
      showToolEvents: true,
      showStructuredSourceWhileStreaming: true,
    });

    saveSuperChatSettings({
      showToolEvents: false,
      showStructuredSourceWhileStreaming: false,
    });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")).toEqual({
      showToolEvents: false,
      showStructuredSourceWhileStreaming: false,
    });
  });
});

describe("scoped SuperChat message IDs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads pinned and deleted IDs as de-duplicated sets", () => {
    localStorage.setItem(
      messageSetKey("project-a", "pinned"),
      JSON.stringify(["m1", "m1", "m2"]),
    );
    localStorage.setItem(
      messageSetKey("project-a", "deleted"),
      JSON.stringify(["m3"]),
    );

    const result = loadScopedMessageIds("project-a");

    expect([...result.pinnedIds]).toEqual(["m1", "m2"]);
    expect([...result.deletedIds]).toEqual(["m3"]);
  });

  it("treats non-array values as empty without discarding the other set", () => {
    localStorage.setItem(
      messageSetKey("project-a", "pinned"),
      JSON.stringify({ id: "m1" }),
    );
    localStorage.setItem(
      messageSetKey("project-a", "deleted"),
      JSON.stringify(["m2"]),
    );

    const result = loadScopedMessageIds("project-a");

    expect([...result.pinnedIds]).toEqual([]);
    expect([...result.deletedIds]).toEqual(["m2"]);
  });

  it("resets both sets when either stored value is malformed", () => {
    localStorage.setItem(
      messageSetKey("project-a", "pinned"),
      JSON.stringify(["m1"]),
    );
    localStorage.setItem(messageSetKey("project-a", "deleted"), "{not json");

    const result = loadScopedMessageIds("project-a");

    expect([...result.pinnedIds]).toEqual([]);
    expect([...result.deletedIds]).toEqual([]);
  });

  it("persists each kind and scope independently", () => {
    saveScopedMessageIds("project-a", "pinned", new Set(["m1", "m2"]));
    saveScopedMessageIds("project-a", "deleted", new Set(["m3"]));
    saveScopedMessageIds("project-b", "pinned", new Set(["m4"]));

    expect(JSON.parse(localStorage.getItem(messageSetKey("project-a", "pinned")) || "null"))
      .toEqual(["m1", "m2"]);
    expect(JSON.parse(localStorage.getItem(messageSetKey("project-a", "deleted")) || "null"))
      .toEqual(["m3"]);
    expect(JSON.parse(localStorage.getItem(messageSetKey("project-b", "pinned")) || "null"))
      .toEqual(["m4"]);
  });
});
