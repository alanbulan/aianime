// Copyright (c) 2026 AI anime
/// <reference lib="webworker" />
import { pipeline } from '@huggingface/transformers';

const MATTE_MODEL = 'Xenova/modnet';

type InboundMessage =
  | { type: 'preload'; id: number }
  | { type: 'matte'; id: number; blob: Blob };

type OutboundMessage =
  | { type: 'ready'; id: number }
  | { type: 'result'; id: number; blob: Blob }
  | { type: 'error'; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

if (!ctx.crossOriginIsolated) {
  try {
    Object.defineProperty(ctx.navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => 1,
    });
  } catch {
    // A rejected read-only override only preserves the harmless runtime warning.
  }
}

async function detectGpu(): Promise<boolean> {
  const gpu = (
    ctx.navigator as unknown as {
      gpu?: { requestAdapter(): Promise<unknown> };
    }
  ).gpu;
  if (!gpu) {
    return false;
  }
  try {
    return (await gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}

type MatteImage = { toBlob(): Promise<Blob> };
type RemoveBackground = (input: string) => Promise<MatteImage>;
let removerPromise: Promise<RemoveBackground> | null = null;

function getRemover(): Promise<RemoveBackground> {
  if (!removerPromise) {
    const loading = (async () => {
      const useGpu = await detectGpu();
      const remover = await pipeline('background-removal', MATTE_MODEL, {
        device: useGpu ? 'webgpu' : 'wasm',
        dtype: useGpu ? 'fp16' : 'q8',
      });
      return remover as unknown as RemoveBackground;
    })();
    removerPromise = loading;
    void loading.catch(() => {
      if (removerPromise === loading) {
        removerPromise = null;
      }
    });
  }
  return removerPromise;
}

ctx.onmessage = async (event: MessageEvent<InboundMessage>) => {
  const message = event.data;
  try {
    if (message.type === 'preload') {
      await getRemover();
      ctx.postMessage({ type: 'ready', id: message.id } satisfies OutboundMessage);
      return;
    }
    const remover = await getRemover();
    const url = URL.createObjectURL(message.blob);
    try {
      const image = await remover(url);
      const blob = await image.toBlob();
      ctx.postMessage({
        type: 'result',
        id: message.id,
        blob,
      } satisfies OutboundMessage);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    } satisfies OutboundMessage);
  }
};
