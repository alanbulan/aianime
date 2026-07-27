import { useSyncExternalStore } from "react";

type UpdateAvailabilityState = "idle" | "available" | "dismissed";
type Listener = () => void;

let state: UpdateAvailabilityState = "idle";
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function markUpdateAvailable(): void {
  if (state !== "idle") return;
  state = "available";
  notify();
}

export function dismissUpdateAvailable(): void {
  if (state !== "available") return;
  state = "dismissed";
  notify();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return state === "available";
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetUpdateAvailableForTests(): void {
  state = "idle";
  listeners.clear();
}
