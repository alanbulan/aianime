import { describe, expect, it } from "vitest";

import {
  loadReadNotificationKeys,
  markNotificationKeysRead,
} from "./notification-read-storage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("notification read storage", () => {
  it("persists read keys per account and keeps new notifications unread", () => {
    const storage = memoryStorage();

    markNotificationKeysRead("alice", ["announcement:1"], storage);

    expect(loadReadNotificationKeys("alice", storage)).toEqual(
      new Set(["announcement:1"]),
    );
    expect(loadReadNotificationKeys("bob", storage)).toEqual(new Set());
    expect(loadReadNotificationKeys("alice", storage).has("announcement:2")).toBe(false);
  });

  it("recovers from malformed persisted data", () => {
    const storage = memoryStorage();
    storage.setItem("ai-anime:notification-read:v1:alice", "not-json");

    expect(loadReadNotificationKeys("alice", storage)).toEqual(new Set());
  });
});
