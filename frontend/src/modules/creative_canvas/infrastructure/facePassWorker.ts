// Copyright (c) 2026 AI anime
/// <reference lib="webworker" />
import { env, InferenceSession, Tensor } from 'onnxruntime-web';

import {
  fitWithinMaxEdge,
  type FacePassDetection,
  type FacePassPoint,
  type FacePassRect,
} from '../domain/facePassGeometry';

/**
 * YuNet 检测（module worker，用 onnxruntime-web）。
 *
 * 检测参数与上游 seedance2-real-people/lib/detectors/yunet.js 逐项对齐：
 * letterbox 到固定 640、RGB 通道、score = sqrt(sigmoidClamp(cls) * sigmoidClamp(obj))、
 * 阈值 0.5、NMS 0.3 + topK 5000、脸框取整而关键点保留浮点。
 *
 * 这里只负责检测；方块绘制与 Haar 兜底在 facePassComposeWorker 里用 opencv 完成，
 * 以保持与上游相同的绘制路径。
 */
const NET_SIZE = 640;
const STRIDES = [8, 16, 32] as const;
const SCORE_THRESHOLD = 0.5;
const NMS_THRESHOLD = 0.3;
const TOP_K = 5000;
/** 上游把 letterbox 区域留成 0，即黑边。 */
const LETTERBOX_FILL = '#000000';
const RUNTIME_DEPENDENCY_ROOT = '/api/v1/runtime-dependencies/matte';
const MODEL_URL = `${RUNTIME_DEPENDENCY_ROOT}/models/yunet/yunet_2023mar.onnx`;
const WASM_MODULE_URL = `${RUNTIME_DEPENDENCY_ROOT}/runtime/ort-wasm-simd-threaded.asyncify.mjs`;
const WASM_BINARY_URL = `${RUNTIME_DEPENDENCY_ROOT}/runtime/ort-wasm-simd-threaded.asyncify.wasm`;
const RUNTIME_GUIDANCE =
  '人脸直过运行环境未安装或不完整，请前往“设置 > 环境依赖”安装后重试。';

type InboundMessage = {
  type: 'detect';
  id: number;
  blob: Blob;
};

type OutboundMessage =
  | { type: 'result'; id: number; faces: FacePassDetection[] }
  | { type: 'error'; id: number; message: string };

interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
}

interface FaceCandidate {
  score: number;
  box: FacePassRect;
  landmarks: FacePassPoint[];
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

env.wasm.wasmPaths = {
  mjs: WASM_MODULE_URL,
  wasm: WASM_BINARY_URL,
};
if (!ctx.crossOriginIsolated) {
  env.wasm.numThreads = 1;
}

let sessionPromise: Promise<InferenceSession> | null = null;

function getSession(): Promise<InferenceSession> {
  if (!sessionPromise) {
    const loading = InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
    });
    sessionPromise = loading;
    void loading.catch(() => {
      if (sessionPromise === loading) {
        sessionPromise = null;
      }
    });
  }
  return sessionPromise;
}

async function getSessionWithGuidance(): Promise<InferenceSession> {
  try {
    return await getSession();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${RUNTIME_GUIDANCE}${detail}`);
  }
}

/** 上游 sigmoidClamp：把越界值夹到 0/1 边界。 */
function sigmoidClamp(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function clampToImage(value: number, edge: number): number {
  return Math.max(0, Math.min(edge - 1, value));
}

function resolveLetterbox(
  width: number,
  height: number,
): { letterbox: Letterbox; scaledWidth: number; scaledHeight: number } {
  const scale = Math.min(NET_SIZE / width, NET_SIZE / height);
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  return {
    letterbox: {
      scale,
      padX: Math.floor((NET_SIZE - scaledWidth) / 2),
      padY: Math.floor((NET_SIZE - scaledHeight) / 2),
    },
    scaledWidth,
    scaledHeight,
  };
}

function buildInputTensor(
  source: OffscreenCanvas,
  scaledWidth: number,
  scaledHeight: number,
  letterbox: Letterbox,
): Tensor {
  const canvas = new OffscreenCanvas(NET_SIZE, NET_SIZE);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('无法初始化画布');
  }
  // 上游用 sharp 的默认 lanczos3 缩放；这里取浏览器可用的最高插值质量以贴近。
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = LETTERBOX_FILL;
  context.fillRect(0, 0, NET_SIZE, NET_SIZE);
  context.drawImage(
    source,
    letterbox.padX,
    letterbox.padY,
    scaledWidth,
    scaledHeight,
  );

  const { data } = context.getImageData(0, 0, NET_SIZE, NET_SIZE);
  const plane = NET_SIZE * NET_SIZE;
  const tensorData = new Float32Array(plane * 3);
  for (let index = 0; index < plane; index += 1) {
    const offset = index * 4;
    // 上游经 sharp.removeAlpha() 得到 RGB 顺序。
    tensorData[index] = data[offset];
    tensorData[plane + index] = data[offset + 1];
    tensorData[2 * plane + index] = data[offset + 2];
  }
  return new Tensor('float32', tensorData, [1, 3, NET_SIZE, NET_SIZE]);
}

function intersectionOverUnion(a: FacePassRect, b: FacePassRect): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  if (intersection <= 0) {
    return 0;
  }
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/** 上游 nms：按分数取前 TOP_K，再用 IoU 抑制。 */
function applyNms(candidates: readonly FaceCandidate[]): FaceCandidate[] {
  const order = candidates
    .map((candidate, index) => ({ index, score: candidate.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map((entry) => entry.index);

  const kept: FaceCandidate[] = [];
  const suppressed = new Set<number>();
  for (const index of order) {
    if (suppressed.has(index)) {
      continue;
    }
    const candidate = candidates[index];
    if (!candidate) {
      continue;
    }
    kept.push(candidate);
    for (const other of order) {
      if (other === index || suppressed.has(other)) {
        continue;
      }
      const target = candidates[other];
      if (
        target &&
        intersectionOverUnion(candidate.box, target.box) >= NMS_THRESHOLD
      ) {
        suppressed.add(other);
      }
    }
  }
  return kept;
}

function decodeFaces(
  outputs: Record<string, { data: ArrayLike<number> }>,
  letterbox: Letterbox,
  imageWidth: number,
  imageHeight: number,
): FacePassDetection[] {
  const { scale, padX, padY } = letterbox;
  const candidates: FaceCandidate[] = [];

  for (const stride of STRIDES) {
    const cls = outputs[`cls_${stride}`]?.data;
    const obj = outputs[`obj_${stride}`]?.data;
    const bbox = outputs[`bbox_${stride}`]?.data;
    const kps = outputs[`kps_${stride}`]?.data;
    if (!cls || !obj || !bbox || !kps) {
      continue;
    }

    const features = NET_SIZE / stride;
    const positions = features * features;
    for (let index = 0; index < positions; index += 1) {
      // 上游：score = sqrt(sigmoidClamp(cls) * sigmoidClamp(obj))
      const score = Math.sqrt(
        sigmoidClamp(Number(cls[index])) * sigmoidClamp(Number(obj[index])),
      );
      if (score < SCORE_THRESHOLD) {
        continue;
      }

      const row = Math.floor(index / features);
      const column = index % features;
      const centerX = (column + Number(bbox[index * 4])) * stride;
      const centerY = (row + Number(bbox[index * 4 + 1])) * stride;
      const boxWidth = Math.exp(Number(bbox[index * 4 + 2])) * stride;
      const boxHeight = Math.exp(Number(bbox[index * 4 + 3])) * stride;

      const landmarks: FacePassPoint[] = [];
      for (let point = 0; point < 5; point += 1) {
        landmarks.push({
          x: clampToImage(
            ((Number(kps[index * 10 + point * 2]) + column) * stride - padX) /
              scale,
            imageWidth,
          ),
          y: clampToImage(
            ((Number(kps[index * 10 + point * 2 + 1]) + row) * stride - padY) /
              scale,
            imageHeight,
          ),
        });
      }

      candidates.push({
        score,
        box: {
          x: (centerX - boxWidth / 2 - padX) / scale,
          y: (centerY - boxHeight / 2 - padY) / scale,
          width: boxWidth / scale,
          height: boxHeight / scale,
        },
        landmarks,
      });
    }
  }

  return applyNms(candidates).map((candidate) => ({
    // 上游对最终脸框取整（关键点保持浮点）。
    box: {
      x: Math.round(candidate.box.x),
      y: Math.round(candidate.box.y),
      width: Math.round(candidate.box.width),
      height: Math.round(candidate.box.height),
    },
    score: candidate.score,
    landmarks: candidate.landmarks,
  }));
}

ctx.onmessage = async (event: MessageEvent<InboundMessage>) => {
  const message = event.data;
  if (message.type !== 'detect') {
    return;
  }

  let sourceBitmap: ImageBitmap | null = null;
  try {
    const session = await getSessionWithGuidance();
    sourceBitmap = await createImageBitmap(message.blob, {
      imageOrientation: 'from-image',
      // 上游用 sharp 解码且不做色彩管理，这里同样禁用，避免灰度值偏移。
      colorSpaceConversion: 'none',
    });
    const target = fitWithinMaxEdge(sourceBitmap.width, sourceBitmap.height);

    const canvas = new OffscreenCanvas(target.width, target.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法初始化画布');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(sourceBitmap, 0, 0, target.width, target.height);

    const { letterbox, scaledWidth, scaledHeight } = resolveLetterbox(
      target.width,
      target.height,
    );
    const input = buildInputTensor(canvas, scaledWidth, scaledHeight, letterbox);
    const outputs = await session.run({ input });
    const faces = decodeFaces(
      outputs as unknown as Record<string, { data: ArrayLike<number> }>,
      letterbox,
      target.width,
      target.height,
    );

    ctx.postMessage({
      type: 'result',
      id: message.id,
      faces,
    } satisfies OutboundMessage);
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    } satisfies OutboundMessage);
  } finally {
    sourceBitmap?.close();
  }
};
