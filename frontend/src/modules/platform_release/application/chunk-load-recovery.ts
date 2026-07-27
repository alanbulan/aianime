import { useSyncExternalStore } from "react";

import {
  isChunkLoadError,
  type ChunkLoadRecoveryResult,
} from "@/modules/platform_release/domain/runtime-update";

type RecoveryState = "idle" | "reload-required";
type Listener = () => void;

let recoveryState: RecoveryState = "idle";
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function requestChunkLoadRecovery(
  error: unknown,
): ChunkLoadRecoveryResult {
  if (!isChunkLoadError(error)) return "ignored";
  if (recoveryState !== "reload-required") {
    recoveryState = "reload-required";
    notify();
  }
  return "needs-user-reload";
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return recoveryState === "reload-required";
}

export function useChunkLoadRecoveryRequired(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetChunkLoadRecoveryForTests(): void {
  recoveryState = "idle";
  listeners.clear();
}
