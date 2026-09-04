// Copyright (c) 2026 AI anime

import { join } from "node:path";
import { COMMERCIAL_RUNTIME_DEPENDENCIES_URL } from "./commercial-api-client.js";
import {
  VerifiedFileRuntimeDependencyManager,
  type VerifiedFileDependencyPackage,
  type VerifiedFileDependencyProgress,
  type VerifiedFileDependencyStatus,
} from "./verified-file-runtime-dependency.js";

export type WorldModelsDependencyPackage = VerifiedFileDependencyPackage;
export type WorldModelsDependencyProgress = VerifiedFileDependencyProgress;
export type WorldModelsDependencyStatus =
  VerifiedFileDependencyStatus<"worldModels">;

export interface InstalledWorldModelsRuntimePaths {
  root: string;
  sharpModelPath: string;
  da2ModelRoot: string;
}

const DA2_REVISION = "0d55ccb5e46b8ed4715fae3a4c04fc897f1689f3";

export const WORLD_MODELS_DEPENDENCY_PACKAGE: WorldModelsDependencyPackage = {
  version: `sharp-2572gikvuh+da2-${DA2_REVISION.slice(0, 12)}`,
  files: [
    {
      relativePath: "models/sharp/sharp_2572gikvuh.pt",
      sizeBytes: 2_809_738_232,
      sha256: "94211a75198c47f61fca7d739ba08a215418d8d398d48fddf023baccc24f073d",
      urls: [
        `${COMMERCIAL_RUNTIME_DEPENDENCIES_URL}/models/sharp/sharp_2572gikvuh.pt`,
        "https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt",
      ],
    },
    {
      relativePath: "models/da2/model.safetensors",
      sizeBytes: 1_378_513_064,
      sha256: "d8ea568fc3dfb7d7432e5b763de499dd03fb6dc1c2020d84639f35e2dfa4f78e",
      urls: [
        `${COMMERCIAL_RUNTIME_DEPENDENCIES_URL}/models/da2/model.safetensors`,
        `https://hf-mirror.com/haodongli/DA-2/resolve/${DA2_REVISION}/model.safetensors`,
        `https://huggingface.co/haodongli/DA-2/resolve/${DA2_REVISION}/model.safetensors`,
      ],
    },
  ],
};

function supportsWorldModels(platform: NodeJS.Platform, arch: string): boolean {
  return (
    (platform === "win32" && arch === "x64")
    || (platform === "darwin" && arch === "arm64")
  );
}

function accelerator(platform: NodeJS.Platform, arch: string): string {
  if (platform === "win32" && arch === "x64") {
    return "NVIDIA CUDA（支持 CPU 回退）";
  }
  if (platform === "darwin" && arch === "arm64") {
    return "Apple Silicon MPS（支持 CPU 回退）";
  }
  return "当前平台不支持本地 3D 模型";
}

export function installedWorldModelsRuntimePaths(
  userDataPath: string,
): InstalledWorldModelsRuntimePaths {
  const root = join(userDataPath, "dependencies", "world-models", "current");
  return {
    root,
    sharpModelPath: join(root, "models", "sharp", "sharp_2572gikvuh.pt"),
    da2ModelRoot: join(root, "models", "da2"),
  };
}

export class WorldModelsRuntimeDependencyManager {
  readonly paths: InstalledWorldModelsRuntimePaths;
  private readonly manager: VerifiedFileRuntimeDependencyManager<"worldModels">;

  constructor(
    userDataPath: string,
    options: {
      platform?: NodeJS.Platform;
      arch?: string;
      packageInfo?: WorldModelsDependencyPackage;
      fetchImpl?: typeof fetch;
    } = {},
  ) {
    const platform = options.platform ?? process.platform;
    const arch = options.arch ?? process.arch;
    this.paths = installedWorldModelsRuntimePaths(userDataPath);
    this.manager = new VerifiedFileRuntimeDependencyManager(
      userDataPath,
      {
        id: "worldModels",
        directoryName: "world-models",
        displayName: "导演世界大型模型",
        accelerator: accelerator(platform, arch),
        packageInfo: WORLD_MODELS_DEPENDENCY_PACKAGE,
        supported: supportsWorldModels,
        unsupportedMessage: "当前平台不提供导演世界 SHARP 与 DA-2 本地模型。",
        readyMessage: "SHARP 与 DA-2 模型完整，可以进行本地 3D 重建。",
        notInstalledMessage:
          "导演世界大型模型尚未安装；需要本地 3D 重建时请先在此安装。",
      },
      options,
    );
  }

  async status(): Promise<WorldModelsDependencyStatus> {
    return await this.manager.status();
  }

  async install(
    onProgress: (progress: WorldModelsDependencyProgress) => void = () => undefined,
  ): Promise<WorldModelsDependencyStatus> {
    return await this.manager.install(onProgress);
  }
}
