// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");

describe("SuperChat boundaries", () => {
  it("keeps message cache persistence outside the controller hook", () => {
    const cache = readFileSync(
      resolve(SRC_ROOT, "features/superchat/message-cache.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/message-cache.test.ts"),
      "utf8",
    );

    expect(hook).toContain(
      'from "@/features/superchat/message-cache";',
    );
    expect(tests).toContain(
      'from "@/features/superchat/message-cache";',
    );
    for (const ownedOperation of [
      "function denestRaw(",
      "export function sanitizeMessagesForCache(",
      "export function loadCachedMessages(",
      "export function saveCachedMessages(",
      "export function pruneOldMessageCaches(",
      "registerStorageReclaimer(",
    ]) {
      expect(cache).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    expect(cache).toContain('const MESSAGE_CACHE_PREFIX = "superchat:messages:v2:";');
    expect(hook).not.toContain("MESSAGE_CACHE_PREFIX");
  });

  it("keeps active turn persistence and status rules outside the controller hook", () => {
    const activeTurn = readFileSync(
      resolve(SRC_ROOT, "features/superchat/active-turn.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/active-turn.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/active-turn";');
    expect(tests).toContain('from "@/features/superchat/active-turn";');
    for (const ownedOperation of [
      "function activeTurnKey(",
      "function loadActiveTurn(",
      "export function saveActiveTurn(",
      "export function clearActiveTurn(",
      "export function activeTurnIsPending(",
      "export function loadPendingActiveTurn(",
      "export function currentTurnIsLive(",
    ]) {
      expect(activeTurn).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    expect(activeTurn).not.toContain("export function activeTurnKey(");
    expect(activeTurn).not.toContain("export function loadActiveTurn(");
    expect(activeTurn).toContain('const ACTIVE_TURN_PREFIX = "superchat:active-turn:";');
    expect(hook).not.toContain("ACTIVE_TURN_PREFIX");
    expect(hook).not.toContain("hasStructuredContent");
  });

  it("keeps local preference persistence outside the controller hook", () => {
    const storage = readFileSync(
      resolve(SRC_ROOT, "features/superchat/preferences-storage.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/preferences-storage.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/preferences-storage";');
    expect(tests).toContain('from "@/features/superchat/preferences-storage";');
    for (const ownedOperation of [
      "function messageSetKey(",
      "export function loadSuperChatSettings(",
      "export function saveSuperChatSettings(",
      "export function loadScopedMessageIds(",
      "export function saveScopedMessageIds(",
    ]) {
      expect(storage).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    expect(storage).not.toContain("export function messageSetKey(");
    expect(hook).not.toContain("SETTINGS_KEY");
    expect(hook).not.toContain("safeLocalStorageSet");
    expect(hook).not.toContain("localStorage.");
    expect(hook).not.toContain("persistMessageSet");
  });

  it("keeps scope mapping and matching outside the controller hook", () => {
    const scope = readFileSync(
      resolve(SRC_ROOT, "features/superchat/scope.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/scope.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/scope";');
    expect(tests).toContain('from "@/features/superchat/scope";');
    for (const ownedOperation of [
      "export function scopeForProject(",
      "export function scopeSessionKey(",
      "export function scopeMatches(",
      "export function isChatScope(",
    ]) {
      expect(scope).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    expect(hook).not.toContain("function scopeForProject(");
    expect(hook).not.toContain("function scopeSessionKey(");
    expect(hook).not.toContain("function scopeMatches(");
    expect(hook).not.toContain("function isChatScope(");
  });

  it("keeps message timeline reconciliation outside the controller hook", () => {
    const timeline = readFileSync(
      resolve(SRC_ROOT, "features/superchat/message-timeline.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/message-timeline.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/message-timeline";');
    expect(tests).toContain('from "@/features/superchat/message-timeline";');
    expect(tests).not.toContain('from "@/features/superchat/use-superchat";');
    for (const ownedOperation of [
      "export function normalizeHistory(",
      "export function sortMessages(",
      "export function turnCompletedInHistory(",
      "export function mergeHistorySnapshot(",
    ]) {
      expect(timeline).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    for (const privateRule of [
      "function normalizedText(",
      "function assistantTextEquivalent(",
      "function hasEquivalentHistoryMessage(",
      "function hasCompletedTurnInHistory(",
    ]) {
      expect(timeline).toContain(privateRule);
      expect(hook).not.toContain(privateRule);
    }
  });

  it("keeps assistant and tool message projection outside the controller hook", () => {
    const projection = readFileSync(
      resolve(SRC_ROOT, "features/superchat/message-projection.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(SRC_ROOT, "features/superchat/use-superchat.ts"),
      "utf8",
    );
    const tests = readFileSync(
      resolve(SRC_ROOT, "__tests__/features/superchat/message-projection.test.ts"),
      "utf8",
    );

    expect(hook).toContain('from "@/features/superchat/message-projection";');
    expect(tests).toContain('from "@/features/superchat/message-projection";');
    for (const ownedOperation of [
      "export function upsertAssistantMessage(",
      "export function upsertServerAssistantMessage(",
      "export function appendToolMessage(",
      "export function shouldPreserveToolMessage(",
      "export function upsertToolMessage(",
    ]) {
      expect(projection).toContain(ownedOperation);
      expect(hook).not.toContain(ownedOperation);
    }
    for (const privateRule of [
      "function resultText(",
      "function buildToolMessage(",
    ]) {
      expect(projection).toContain(privateRule);
      expect(hook).not.toContain(privateRule);
    }
    expect(projection).toContain(
      'const EXECUTABLE_HIDDEN_TOOL_NAMES = new Set(["freezone_emit_canvas_command"]);',
    );
    expect(hook).not.toContain("EXECUTABLE_HIDDEN_TOOL_NAMES");
  });
});
