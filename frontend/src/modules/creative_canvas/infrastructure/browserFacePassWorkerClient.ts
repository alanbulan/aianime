// Copyright (c) 2026 AI anime
import type { FacePassDetection } from '../domain/facePassGeometry';
import type { FacePassOptions } from '../domain/facePassOptions';
import facePassHaarWorkerUrl from './facePassHaarWorker.js?url';

/**
 * 人脸直过的编排入口：YuNet 检测（module worker，onnxruntime）→
 * Haar 兜底与绘制（classic worker，opencv.js）。
 *
 * 拆成两个 worker 是因为 opencv.js 是 UMD，只能在能识别 importScripts 的
 * classic worker 里挂载；而 Vite 的 ?worker 在 dev 下固定产出 module worker，
 * 所以 Haar 那一路用原生 .js 源文件配合 ?url 创建。
 */

export interface FacePassWorkerResult {
  blob: Blob;
  /** 检出的人脸数量。 */
  faceCount: number;
  /** 实际遮挡的方块数量。 */
  eyeCount: number;
}

type DetectOutboundMessage =
  | { type: 'result'; id: number; faces: FacePassDetection[] }
  | { type: 'error'; id: number; message: string };

type ComposeOutboundMessage =
  | {
      type: 'result';
      id: number;
      blob: Blob;
      faceCount: number;
      eyeCount: number;
    }
  | { type: 'error'; id: number; message: string };

interface DetectPendingEntry {
  resolve: (faces: FacePassDetection[]) => void;
  reject: (error: Error) => void;
}

interface ComposePendingEntry {
  resolve: (result: FacePassWorkerResult) => void;
  reject: (error: Error) => void;
}

let detectWorker: Worker | null = null;
let composeWorker: Worker | null = null;
let nextRequestId = 1;
const pendingDetect = new Map<number, DetectPendingEntry>();
const pendingCompose = new Map<number, ComposePendingEntry>();

function rejectAll<T extends { reject: (error: Error) => void }>(
  pending: Map<number, T>,
  error: Error,
): void {
  for (const entry of pending.values()) {
    entry.reject(error);
  }
  pending.clear();
}

function ensureDetectWorker(): Worker {
  if (detectWorker) {
    return detectWorker;
  }
  const worker = new Worker(new URL('./facePassWorker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (event: MessageEvent<DetectOutboundMessage>) => {
    const message = event.data;
    const entry = pendingDetect.get(message.id);
    if (!entry) {
      return;
    }
    pendingDetect.delete(message.id);
    if (message.type === 'result') {
      entry.resolve(message.faces);
    } else {
      entry.reject(new Error(message.message));
    }
  };
  worker.onerror = (event) => {
    rejectAll(pendingDetect, new Error(event.message || 'face pass detect worker crashed'));
    worker.terminate();
    detectWorker = null;
  };
  detectWorker = worker;
  return worker;
}

function ensureComposeWorker(): Worker {
  if (composeWorker) {
    return composeWorker;
  }
  // 不传 type: 'module'，保持 classic worker。
  const worker = new Worker(facePassHaarWorkerUrl);
  worker.onmessage = (event: MessageEvent<ComposeOutboundMessage>) => {
    const message = event.data;
    const entry = pendingCompose.get(message.id);
    if (!entry) {
      return;
    }
    pendingCompose.delete(message.id);
    if (message.type === 'result') {
      entry.resolve({
        blob: message.blob,
        faceCount: message.faceCount,
        eyeCount: message.eyeCount,
      });
    } else {
      entry.reject(new Error(message.message));
    }
  };
  worker.onerror = (event) => {
    rejectAll(pendingCompose, new Error(event.message || 'face pass compose worker crashed'));
    worker.terminate();
    composeWorker = null;
  };
  composeWorker = worker;
  return worker;
}

function detectFaces(blob: Blob): Promise<FacePassDetection[]> {
  const worker = ensureDetectWorker();
  const id = nextRequestId++;
  return new Promise<FacePassDetection[]>((resolve, reject) => {
    pendingDetect.set(id, { resolve, reject });
    worker.postMessage({ type: 'detect', id, blob });
  });
}

function composeImage(
  blob: Blob,
  options: FacePassOptions,
  yunetFaces: FacePassDetection[],
): Promise<FacePassWorkerResult> {
  const worker = ensureComposeWorker();
  const id = nextRequestId++;
  return new Promise<FacePassWorkerResult>((resolve, reject) => {
    pendingCompose.set(id, { resolve, reject });
    worker.postMessage({ type: 'compose', id, blob, options, yunetFaces });
  });
}

export async function facePassImageInBrowserWorker(
  blob: Blob,
  options: FacePassOptions,
): Promise<FacePassWorkerResult> {
  const yunetFaces = options.detector === 'onnx' ? await detectFaces(blob) : [];
  return await composeImage(blob, options, yunetFaces);
}
