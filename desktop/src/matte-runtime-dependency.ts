// Copyright (c) 2026 AI anime

import { join } from "node:path";
import {
  VerifiedFileRuntimeDependencyManager,
  type VerifiedFileDependencyFile,
  type VerifiedFileDependencyPackage,
  type VerifiedFileDependencyPhase,
  type VerifiedFileDependencyProgress,
  type VerifiedFileDependencyStatus,
} from "./verified-file-runtime-dependency.js";

export type MatteDependencyPhase = VerifiedFileDependencyPhase;
export type MatteDependencyProgress = VerifiedFileDependencyProgress;
export type MatteDependencyFile = VerifiedFileDependencyFile;
export type MatteDependencyPackage = VerifiedFileDependencyPackage;
export type MatteDependencyStatus = VerifiedFileDependencyStatus<"matte">;

export interface InstalledMatteRuntimePaths {
  root: string;
  modelRoot: string;
  runtimeRoot: string;
}

const MODNET_REVISION = "7aaa8a27c987ae9452a60443a7afeb6b2a52843a";
const ONNX_RUNTIME_VERSION = "1.26.0-dev.20260416-b7804b056c";
const modelUrls = (path: string) => [
  `https://hf-mirror.com/Xenova/modnet/resolve/${MODNET_REVISION}/${path}`,
  `https://huggingface.co/Xenova/modnet/resolve/${MODNET_REVISION}/${path}`,
];
const runtimeUrls = (name: string) => [
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_VERSION}/dist/${name}`,
  `https://unpkg.com/onnxruntime-web@${ONNX_RUNTIME_VERSION}/dist/${name}`,
];

export const MATTE_DEPENDENCY_PACKAGE: MatteDependencyPackage = {
  version: `modnet-${MODNET_REVISION.slice(0, 12)}+ort-${ONNX_RUNTIME_VERSION}`,
  files: [
    {
      relativePath: "models/Xenova/modnet/config.json",
      sizeBytes: 83,
      sha256: "e144d8af9b1f09649785c77f592a76bbc69504ae02e43700663b2a9f00d9c8a2",
      urls: modelUrls("config.json"),
    },
    {
      relativePath: "models/Xenova/modnet/preprocessor_config.json",
      sizeBytes: 365,
      sha256: "07d83634b1fdd20142ca6e3fe55ab92b558f56d1b0f005ff3a7926f1c9e1165d",
      urls: modelUrls("preprocessor_config.json"),
    },
    {
      relativePath: "models/Xenova/modnet/onnx/model_quantized.onnx",
      sizeBytes: 6_632_188,
      sha256: "92e49898c3e05a6d7a944fc67a8cb87c4aad754ffb6ebd949528c7d1105fee3a",
      urls: modelUrls("onnx/model_quantized.onnx"),
    },
    {
      relativePath: "models/Xenova/modnet/onnx/model_fp16.onnx",
      sizeBytes: 12_984_781,
      sha256: "25f165da9bfd30830a575f1f0490f1acd995975cb349bc02f3d79332e1fe5cf6",
      urls: modelUrls("onnx/model_fp16.onnx"),
    },
    {
      relativePath: "runtime/ort-wasm-simd-threaded.asyncify.mjs",
      sizeBytes: 47_389,
      sha256: "5959c6733039619c9af710d8e1bae8d6e84402787990637be987c2b1bd6c5fa9",
      urls: runtimeUrls("ort-wasm-simd-threaded.asyncify.mjs"),
    },
    {
      relativePath: "runtime/ort-wasm-simd-threaded.asyncify.wasm",
      sizeBytes: 23_567_050,
      sha256: "e0c0c6d3e73d43b8a249972f8358f845b08cc16fec3c80efafdf8bed40366786",
      urls: runtimeUrls("ort-wasm-simd-threaded.asyncify.wasm"),
    },
  ],
};

export function installedMatteRuntimePaths(
  userDataPath: string,
): InstalledMatteRuntimePaths {
  const root = join(userDataPath, "dependencies", "matte", "current");
  return {
    root,
    modelRoot: join(root, "models"),
    runtimeRoot: join(root, "runtime"),
  };
}

export class MatteRuntimeDependencyManager {
  readonly paths: InstalledMatteRuntimePaths;
  private readonly manager: VerifiedFileRuntimeDependencyManager<"matte">;

  constructor(
    userDataPath: string,
    options: {
      platform?: NodeJS.Platform;
      arch?: string;
      packageInfo?: MatteDependencyPackage;
      fetchImpl?: typeof fetch;
    } = {},
  ) {
    this.paths = installedMatteRuntimePaths(userDataPath);
    this.manager = new VerifiedFileRuntimeDependencyManager(
      userDataPath,
      {
        id: "matte",
        directoryName: "matte",
        displayName: "图片抠图运行环境",
        accelerator: "WebGPU（WASM 回退）",
        packageInfo: MATTE_DEPENDENCY_PACKAGE,
        readyMessage: "图片抠图模型与本地推理运行时完整，可以使用。",
        notInstalledMessage: "图片抠图运行环境尚未安装；使用抠图前请先在此安装。",
      },
      options,
    );
  }

  async status(): Promise<MatteDependencyStatus> {
    return await this.manager.status();
  }

  async install(
    onProgress: (progress: MatteDependencyProgress) => void = () => undefined,
  ): Promise<MatteDependencyStatus> {
    return await this.manager.install(onProgress);
  }
}
