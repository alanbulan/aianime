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
// 人脸直过用的 YuNet 人脸检测模型取自 OpenCV 官方 HuggingFace 仓库。
// 注意：GitHub 上同名文件由 Git LFS 托管，raw / jsdelivr 只会返回 LFS 指针
// （131 字节），因此这里必须走 HF 的 resolve 端点。
const YUNET_SHA256 =
  "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4";
const YUNET_REPOSITORY = "opencv/face_detection_yunet";
const modelUrls = (path: string) => [
  `https://hf-mirror.com/Xenova/modnet/resolve/${MODNET_REVISION}/${path}`,
  `https://huggingface.co/Xenova/modnet/resolve/${MODNET_REVISION}/${path}`,
];
const runtimeUrls = (name: string) => [
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_RUNTIME_VERSION}/dist/${name}`,
  `https://unpkg.com/onnxruntime-web@${ONNX_RUNTIME_VERSION}/dist/${name}`,
];
const yunetUrls = (path: string) => [
  `https://hf-mirror.com/${YUNET_REPOSITORY}/resolve/main/${path}`,
  `https://huggingface.co/${YUNET_REPOSITORY}/resolve/main/${path}`,
];
// 人脸直过的 Haar 兜底路径需要 OpenCV WASM 与三份级联。上游用的是
// 定制构建 fast-opencv-wasm@4.10.0-14，无法从官方渠道取得同样的构建，
// 因此按 commit 锁定到上游仓库（该文件未走 Git LFS）。
// 下载源按「国内可达性」排序：jsdelivr 主站 → jsdelivr 备用 CDN → GitHub 直连。
const OPENCV_REVISION = "ddbba868507fc3b424169801c5f37c551884493e";
const opencvUrls = (path: string) => [
  `https://cdn.jsdelivr.net/gh/xuanyustudio/seedance2-real-people@${OPENCV_REVISION}/${path}`,
  `https://fastly.jsdelivr.net/gh/xuanyustudio/seedance2-real-people@${OPENCV_REVISION}/${path}`,
  `https://raw.githubusercontent.com/xuanyustudio/seedance2-real-people/${OPENCV_REVISION}/${path}`,
];

export const MATTE_DEPENDENCY_PACKAGE: MatteDependencyPackage = {
  version: `modnet-${MODNET_REVISION.slice(0, 12)}+ort-${ONNX_RUNTIME_VERSION}+yunet-${YUNET_SHA256.slice(0, 12)}+haar-${OPENCV_REVISION.slice(0, 12)}`,
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
      relativePath: "models/yunet/yunet_2023mar.onnx",
      sizeBytes: 232_589,
      sha256: YUNET_SHA256,
      urls: yunetUrls("face_detection_yunet_2023mar.onnx"),
    },
    {
      relativePath: "models/haar/haarcascade_frontalface_default.xml",
      sizeBytes: 930_127,
      sha256:
        "0f7d4527844eb514d4a4948e822da90fbb16a34a0bbbbc6adc6498747a5aafb0",
      urls: opencvUrls("models/haarcascade_frontalface_default.xml"),
    },
    {
      relativePath: "models/haar/haarcascade_profileface.xml",
      sizeBytes: 828_514,
      sha256:
        "b39a4a3be45539db146a7fc1d3e761a292c196eb88421185e6a615b3055e612d",
      urls: opencvUrls("models/haarcascade_profileface.xml"),
    },
    {
      relativePath: "models/haar/haarcascade_eye.xml",
      sizeBytes: 341_406,
      sha256:
        "71cc64fc305a355dc60067880f6fbbd43dd155bd63ee3844661a1bda34b2fd8c",
      urls: opencvUrls("models/haarcascade_eye.xml"),
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
    {
      relativePath: "opencv/opencv.js",
      sizeBytes: 335_420,
      sha256:
        "72517f5dcdc924b51928f15d51df421f3c1231ebc2823d69bc3ef5734a2f878d",
      urls: opencvUrls("opencv.js"),
    },
    {
      relativePath: "opencv/opencv_js.wasm",
      sizeBytes: 8_043_937,
      sha256:
        "93d75757b940d81c7ff694e53259b96bd5f695eab905116f7b65f1c6d2c5340c",
      urls: opencvUrls("opencv_js.wasm"),
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
        displayName: "图片处理运行环境",
        accelerator: "WebGPU（WASM 回退）",
        packageInfo: MATTE_DEPENDENCY_PACKAGE,
        readyMessage: "抠图模型、人脸检测模型与本地推理运行时完整，可以使用。",
        notInstalledMessage: "图片处理运行环境尚未安装；使用抠图或人脸直过前请先在此安装。",
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
