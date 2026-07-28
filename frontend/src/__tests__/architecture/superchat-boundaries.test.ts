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
      resolve(SRC_ROOT, "__tests__/features/superchat/use-superchat.test.ts"),
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
});
