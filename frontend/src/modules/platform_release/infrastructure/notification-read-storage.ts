// Copyright (c) 2026 AI anime

const STORAGE_PREFIX = "ai-anime:notification-read:v1:";

type NotificationReadStorage = Pick<Storage, "getItem" | "setItem">;

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope.trim() || "local")}`;
}

export function loadReadNotificationKeys(
  scope: string,
  storage: NotificationReadStorage = window.localStorage,
): Set<string> {
  try {
    const value = JSON.parse(storage.getItem(storageKey(scope)) ?? "[]");
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

export function markNotificationKeysRead(
  scope: string,
  keys: readonly string[],
  storage: NotificationReadStorage = window.localStorage,
): Set<string> {
  const read = loadReadNotificationKeys(scope, storage);
  keys.forEach((key) => read.add(key));
  try {
    storage.setItem(storageKey(scope), JSON.stringify([...read]));
  } catch {
    // Reading a notification must still work when browser storage is blocked.
  }
  return read;
}
