// Copyright (c) 2026 AI anime
import type { CanvasEventMap } from './canvasEventBus';

export type ExternalFileChannel = Extract<
  keyof CanvasEventMap,
  | 'upload-node/external-file'
  | 'video-node/external-file'
  | 'audio-node/external-file'
>;

const MAX_PENDING_FILES = 64;
const pendingFiles = new Map<string, File>();

function pendingKey(channel: ExternalFileChannel, nodeId: string): string {
  return `${channel}\u0000${nodeId}`;
}

export function stashExternalFile(
  channel: ExternalFileChannel,
  nodeId: string,
  file: File,
): void {
  const key = pendingKey(channel, nodeId);
  if (pendingFiles.size >= MAX_PENDING_FILES && !pendingFiles.has(key)) {
    const oldest = pendingFiles.keys().next();
    if (!oldest.done) pendingFiles.delete(oldest.value);
  }
  pendingFiles.set(key, file);
}

export function takeExternalFile(
  channel: ExternalFileChannel,
  nodeId: string,
): File | null {
  const key = pendingKey(channel, nodeId);
  const file = pendingFiles.get(key);
  if (!file) return null;
  pendingFiles.delete(key);
  return file;
}
