// Copyright (c) 2026 AI anime

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

const INSTALL_RECEIPT = "install.json";
const MATTE_VERIFY_CACHE_MS = 30_000;

export type MatteDependencyPhase =
  | "manifest"
  | "downloading"
  | "verifying"
  | "checking"
  | "complete";

export interface MatteDependencyProgress {
  phase: MatteDependencyPhase;
  message: string;
  transferredBytes?: number;
  totalBytes?: number;
  percent?: number;
}

export interface InstalledMatteRuntimePaths {
  root: string;
  modelRoot: string;
  runtimeRoot: string;
}

export interface MatteDependencyFile {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  urls: readonly string[];
}

export interface MatteDependencyPackage {
  version: string;
  files: readonly MatteDependencyFile[];
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

interface MatteInstallReceipt {
  schemaVersion: 1;
  id: "matte";
  version: string;
  files: Array<{
    relativePath: string;
    sizeBytes: number;
    sha256: string;
  }>;
  installedAt: string;
}

export interface MatteDependencyStatus {
  id: "matte";
  supported: true;
  installed: boolean;
  healthy: boolean;
  installing: boolean;
  state: "not-installed" | "incomplete" | "ready" | "installing";
  platform: NodeJS.Platform;
  arch: string;
  accelerator: string;
  version?: string;
  downloadSizeBytes: number;
  installedSizeBytes: number;
  message: string;
}

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

function packageSize(packageInfo: MatteDependencyPackage): number {
  return packageInfo.files.reduce((total, file) => total + file.sizeBytes, 0);
}

function isSafeRelativePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return Boolean(
    normalized
      && !normalized.startsWith("/")
      && !/^[a-z]:/iu.test(normalized)
      && !normalized.split("/").includes(".."),
  );
}

function isDownloadUrlAllowed(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:"
      || (parsed.protocol === "http:"
        && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname))
    );
  } catch {
    return false;
  }
}

function validatePackage(packageInfo: MatteDependencyPackage): void {
  if (!packageInfo.version.trim() || packageInfo.files.length === 0) {
    throw new Error("抠图运行环境清单为空");
  }
  for (const file of packageInfo.files) {
    if (
      !isSafeRelativePath(file.relativePath)
      || !Number.isSafeInteger(file.sizeBytes)
      || file.sizeBytes <= 0
      || !/^[a-f0-9]{64}$/iu.test(file.sha256)
      || file.urls.length === 0
      || !file.urls.every(isDownloadUrlAllowed)
    ) {
      throw new Error(`抠图运行环境文件清单无效: ${file.relativePath}`);
    }
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveHash, rejectHash) => {
    const input = createReadStream(path);
    input.on("data", (chunk) => hash.update(chunk));
    input.once("end", resolveHash);
    input.once("error", rejectHash);
  });
  return hash.digest("hex");
}

export class MatteRuntimeDependencyManager {
  readonly paths: InstalledMatteRuntimePaths;
  private readonly packageInfo: MatteDependencyPackage;
  private readonly dependencyRoot: string;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly fetchImpl: typeof fetch;
  private installing = false;
  private verification: { at: number; error: Error | null } | null = null;
  private verificationInFlight: Promise<Error | null> | null = null;

  constructor(
    userDataPath: string,
    options: {
      platform?: NodeJS.Platform;
      arch?: string;
      packageInfo?: MatteDependencyPackage;
      fetchImpl?: typeof fetch;
    } = {},
  ) {
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.packageInfo = options.packageInfo ?? MATTE_DEPENDENCY_PACKAGE;
    this.fetchImpl = options.fetchImpl ?? fetch;
    validatePackage(this.packageInfo);
    this.paths = installedMatteRuntimePaths(userDataPath);
    this.dependencyRoot = resolve(userDataPath, "dependencies", "matte");
    const resolvedUserData = resolve(userDataPath);
    if (!this.dependencyRoot.startsWith(`${resolvedUserData}${sep}`)) {
      throw new Error("抠图运行环境安装目录无效");
    }
  }

  async status(): Promise<MatteDependencyStatus> {
    const totalBytes = packageSize(this.packageInfo);
    const base = {
      id: "matte" as const,
      supported: true as const,
      installing: this.installing,
      platform: this.platform,
      arch: this.arch,
      accelerator: "WebGPU（WASM 回退）",
      downloadSizeBytes: totalBytes,
    };
    if (this.installing) {
      return {
        ...base,
        installed: existsSync(this.paths.root),
        healthy: false,
        state: "installing",
        installedSizeBytes: existsSync(this.paths.root) ? totalBytes : 0,
        message: "正在安装图片抠图运行环境。",
      };
    }

    const receipt = await this.readReceipt();
    if (!existsSync(this.paths.root)) {
      return {
        ...base,
        installed: false,
        healthy: false,
        state: "not-installed",
        installedSizeBytes: 0,
        message: "图片抠图运行环境尚未安装；使用抠图前请先在此安装。",
      };
    }
    if (!receipt) {
      return {
        ...base,
        installed: true,
        healthy: false,
        state: "incomplete",
        installedSizeBytes: 0,
        message: "图片抠图运行环境安装记录缺失，请重新安装。",
      };
    }

    const failure = await this.verifyInstalledFiles();
    if (failure) {
      return {
        ...base,
        installed: true,
        healthy: false,
        state: "incomplete",
        version: receipt.version,
        installedSizeBytes: totalBytes,
        message: failure.message,
      };
    }
    return {
      ...base,
      installed: true,
      healthy: true,
      state: "ready",
      version: receipt.version,
      installedSizeBytes: totalBytes,
      message: "图片抠图模型与本地推理运行时完整，可以使用。",
    };
  }

  async install(
    onProgress: (progress: MatteDependencyProgress) => void = () => undefined,
  ): Promise<MatteDependencyStatus> {
    if (this.installing) throw new Error("图片抠图运行环境正在安装");
    this.installing = true;
    this.verification = null;
    const nonce = `${process.pid}-${Date.now()}`;
    const stagingPath = join(this.dependencyRoot, `.staging-${nonce}`);
    const previousPath = join(this.dependencyRoot, `.previous-${nonce}`);
    let movedCurrent = false;
    try {
      await mkdir(stagingPath, { recursive: true });
      const totalBytes = packageSize(this.packageInfo);
      let completedBytes = 0;
      onProgress({
        phase: "manifest",
        message: "正在准备抠图模型与本地推理运行时…",
        totalBytes,
        percent: 0,
      });
      for (const file of this.packageInfo.files) {
        const targetPath = join(stagingPath, file.relativePath);
        await mkdir(dirname(targetPath), { recursive: true });
        await this.downloadFile(file, targetPath, completedBytes, totalBytes, onProgress);
        completedBytes += file.sizeBytes;
      }

      const receipt: MatteInstallReceipt = {
        schemaVersion: 1,
        id: "matte",
        version: this.packageInfo.version,
        files: this.packageInfo.files.map((file) => ({
          relativePath: file.relativePath,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
        })),
        installedAt: new Date().toISOString(),
      };
      await writeFile(
        join(stagingPath, INSTALL_RECEIPT),
        `${JSON.stringify(receipt, null, 2)}\n`,
        "utf8",
      );
      onProgress({
        phase: "checking",
        message: "正在检查抠图运行环境完整性…",
        transferredBytes: totalBytes,
        totalBytes,
        percent: 100,
      });

      if (existsSync(this.paths.root)) {
        await rename(this.paths.root, previousPath);
        movedCurrent = true;
      }
      await rename(stagingPath, this.paths.root);
      if (movedCurrent) await rm(previousPath, { recursive: true, force: true });
      onProgress({
        phase: "complete",
        message: "图片抠图运行环境安装完成。",
        transferredBytes: totalBytes,
        totalBytes,
        percent: 100,
      });
    } catch (error) {
      if (movedCurrent && !existsSync(this.paths.root) && existsSync(previousPath)) {
        await rename(previousPath, this.paths.root).catch(() => undefined);
      }
      throw error;
    } finally {
      this.installing = false;
      this.verification = null;
      await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
      await rm(previousPath, { recursive: true, force: true }).catch(() => undefined);
    }
    return await this.status();
  }

  private async downloadFile(
    file: MatteDependencyFile,
    targetPath: string,
    completedBytes: number,
    totalBytes: number,
    onProgress: (progress: MatteDependencyProgress) => void,
  ): Promise<void> {
    let lastError: unknown;
    for (const url of file.urls) {
      try {
        const response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(3_600_000),
        });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        const destination = await open(targetPath, "w");
        let fileBytes = 0;
        try {
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await destination.write(value);
            fileBytes += value.byteLength;
            const transferredBytes = completedBytes + fileBytes;
            onProgress({
              phase: "downloading",
              message: `正在下载 ${file.relativePath}…`,
              transferredBytes,
              totalBytes,
              percent: Math.min(99, (transferredBytes / totalBytes) * 100),
            });
          }
          await destination.sync();
        } finally {
          await destination.close();
        }
        onProgress({
          phase: "verifying",
          message: `正在校验 ${file.relativePath}…`,
          transferredBytes: completedBytes + file.sizeBytes,
          totalBytes,
          percent: ((completedBytes + file.sizeBytes) / totalBytes) * 100,
        });
        await this.verifyFile(targetPath, file);
        return;
      } catch (error) {
        lastError = error;
        await rm(targetPath, { force: true }).catch(() => undefined);
      }
    }
    throw new Error(
      `抠图运行环境文件下载或校验失败（${file.relativePath}）：${String(lastError)}`,
    );
  }

  private async verifyFile(path: string, file: MatteDependencyFile): Promise<void> {
    const details = await stat(path).catch(() => null);
    if (!details?.isFile() || details.size !== file.sizeBytes) {
      throw new Error(`抠图运行环境文件大小校验失败: ${file.relativePath}`);
    }
    const digest = await sha256File(path);
    if (digest.toLowerCase() !== file.sha256.toLowerCase()) {
      throw new Error(`抠图运行环境文件 SHA-256 校验失败: ${file.relativePath}`);
    }
  }

  private async verifyInstalledFiles(): Promise<Error | null> {
    const cached = this.verification;
    if (cached && Date.now() - cached.at < MATTE_VERIFY_CACHE_MS) {
      return cached.error;
    }
    if (this.verificationInFlight) return this.verificationInFlight;
    const run = (async () => {
      try {
        for (const file of this.packageInfo.files) {
          await this.verifyFile(join(this.paths.root, file.relativePath), file);
        }
        return null;
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    })();
    this.verificationInFlight = run;
    try {
      const error = await run;
      this.verification = { at: Date.now(), error };
      return error;
    } finally {
      this.verificationInFlight = null;
    }
  }

  private async readReceipt(): Promise<MatteInstallReceipt | null> {
    try {
      const value = JSON.parse(
        await readFile(join(this.paths.root, INSTALL_RECEIPT), "utf8"),
      ) as Partial<MatteInstallReceipt>;
      if (
        value.schemaVersion !== 1
        || value.id !== "matte"
        || value.version !== this.packageInfo.version
        || !Array.isArray(value.files)
        || value.files.length !== this.packageInfo.files.length
      ) {
        return null;
      }
      for (const expected of this.packageInfo.files) {
        const actual = value.files.find(
          (file) => file.relativePath === expected.relativePath,
        );
        if (
          !actual
          || actual.sizeBytes !== expected.sizeBytes
          || actual.sha256.toLowerCase() !== expected.sha256.toLowerCase()
        ) {
          return null;
        }
      }
      return value as MatteInstallReceipt;
    } catch {
      return null;
    }
  }
}
