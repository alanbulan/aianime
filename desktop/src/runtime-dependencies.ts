// Copyright (c) 2026 AI anime

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  executableName,
  installedWorldRuntimePaths,
  type InstalledWorldRuntimePaths,
} from "./platform-runtime.js";
import { COMMERCIAL_RUNTIME_DEPENDENCIES_URL } from "./commercial-api-client.js";

const DEFAULT_RUNTIME_MANIFEST_BASE_URL =
  COMMERCIAL_RUNTIME_DEPENDENCIES_URL;
const INSTALL_RECEIPT = "install.json";
const MAX_PROCESS_OUTPUT = 2 * 1024 * 1024;

export const RUNTIME_DEPENDENCY_CHANNELS = {
  status: "desktop:runtime-dependencies:status",
  install: "desktop:runtime-dependencies:install",
  progress: "desktop:runtime-dependencies:progress",
} as const;

export interface RuntimeDependencyPackage {
  id: "world";
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  archive: "tar.gz";
  sha256: string;
  downloadSizeBytes: number;
  installedSizeBytes: number;
  urls: string[];
}

export interface RuntimeDependencyManifest {
  schemaVersion: 1;
  package: RuntimeDependencyPackage;
}

export type RuntimeDependencyPhase =
  | "manifest"
  | "downloading"
  | "verifying"
  | "extracting"
  | "checking"
  | "complete";

export interface RuntimeDependencyProgress {
  phase: RuntimeDependencyPhase;
  message: string;
  transferredBytes?: number;
  totalBytes?: number;
  percent?: number;
}

export interface RuntimeDependencyStatus {
  id: "world";
  supported: boolean;
  installed: boolean;
  healthy: boolean;
  installing: boolean;
  state: "unsupported" | "not-installed" | "incomplete" | "ready" | "installing";
  platform: NodeJS.Platform;
  arch: string;
  accelerator: string;
  version?: string;
  downloadSizeBytes?: number;
  installedSizeBytes?: number;
  message: string;
}

interface InstallReceipt {
  schemaVersion: 1;
  id: "world";
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  sha256: string;
  downloadSizeBytes: number;
  installedSizeBytes: number;
  installedAt: string;
}

function supportedPlatform(platform: NodeJS.Platform, arch: string): boolean {
  return (platform === "win32" && arch === "x64") || (platform === "darwin" && arch === "arm64");
}

function acceleratorLabel(platform: NodeJS.Platform, arch: string): string {
  if (platform === "win32" && arch === "x64") return "NVIDIA CUDA（支持 CPU 回退）";
  if (platform === "darwin" && arch === "arm64") return "Apple Silicon MPS（支持 CPU 回退）";
  return "当前平台暂无预编译运行环境";
}

export function runtimeDependencyManifestUrl(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const override = environment.AI_ANIME_RUNTIME_MANIFEST_URL?.trim();
  if (override) {
    return override.replaceAll("{platform}", platform).replaceAll("{arch}", arch);
  }
  const base =
    environment.AI_ANIME_RUNTIME_DOWNLOAD_BASE_URL?.trim().replace(/\/+$/u, "") ||
    DEFAULT_RUNTIME_MANIFEST_BASE_URL;
  return `${base}/${platform}-${arch}/manifest.json`;
}

function pathsAtRoot(
  root: string,
  platform: NodeJS.Platform,
): InstalledWorldRuntimePaths {
  return {
    root,
    worldRuntimePath: join(
      root,
      "world-runtime",
      executableName("ai-anime-world-runtime", platform),
    ),
    splatTransformCliPath: join(
      root,
      "splat-transform",
      "node_modules",
      "@playcanvas",
      "splat-transform",
      "bin",
      "cli.mjs",
    ),
    splatTransformNodePath: join(
      root,
      "splat-transform",
      executableName("node", platform),
    ),
  };
}

function validDownloadUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname))
    );
  } catch {
    return false;
  }
}

function parseManifest(
  value: unknown,
  platform: NodeJS.Platform,
  arch: string,
): RuntimeDependencyManifest {
  if (!value || typeof value !== "object") throw new Error("运行环境清单格式无效");
  const manifest = value as Partial<RuntimeDependencyManifest>;
  const packageInfo = manifest.package as Partial<RuntimeDependencyPackage> | undefined;
  if (
    manifest.schemaVersion !== 1 ||
    packageInfo?.id !== "world" ||
    packageInfo.platform !== platform ||
    packageInfo.arch !== arch ||
    packageInfo.archive !== "tar.gz" ||
    typeof packageInfo.version !== "string" ||
    !/^[a-f0-9]{64}$/iu.test(String(packageInfo.sha256 || "")) ||
    !Number.isFinite(packageInfo.downloadSizeBytes) ||
    !Number.isFinite(packageInfo.installedSizeBytes) ||
    !Array.isArray(packageInfo.urls) ||
    packageInfo.urls.length === 0 ||
    !packageInfo.urls.every((url) => typeof url === "string" && validDownloadUrl(url))
  ) {
    throw new Error("运行环境清单字段不完整或与当前平台不匹配");
  }
  return manifest as RuntimeDependencyManifest;
}

async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      env: {
        ...process.env,
        HF_ENDPOINT: process.env.HF_ENDPOINT?.trim() || "https://hf-mirror.com",
        HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET?.trim() || "1",
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_PROCESS_OUTPUT) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_PROCESS_OUTPUT) stderr += chunk.toString("utf8");
    });
    const timer = setTimeout(() => {
      child.kill();
      rejectProcess(new Error(`运行环境检查超时: ${command}`));
    }, options.timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectProcess(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolveProcess({ stdout, stderr });
        return;
      }
      rejectProcess(
        new Error(
          `${command} 执行失败（code=${String(code)}, signal=${String(signal)}）：${stderr || stdout}`,
        ),
      );
    });
  });
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

async function verifyArchiveEntries(archivePath: string): Promise<void> {
  const { stdout } = await runProcess("tar", ["-tzf", archivePath], {
    timeoutMs: 120_000,
  });
  const entries = stdout.split(/\r?\n/u).filter(Boolean);
  if (entries.length === 0) throw new Error("运行环境压缩包为空");
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean);
    if (
      normalized.startsWith("/") ||
      /^[a-z]:/iu.test(normalized) ||
      parts.includes("..") ||
      !["world-runtime", "splat-transform"].includes(parts[0] || "")
    ) {
      throw new Error(`运行环境压缩包包含非法路径: ${entry}`);
    }
  }
}

async function checkRuntime(paths: InstalledWorldRuntimePaths): Promise<void> {
  for (const required of [
    paths.worldRuntimePath,
    paths.splatTransformNodePath,
    paths.splatTransformCliPath,
  ]) {
    const details = await stat(required).catch(() => null);
    if (!details?.isFile()) throw new Error(`缺少运行环境文件: ${required}`);
  }
  if (process.platform !== "win32") {
    await chmod(paths.worldRuntimePath, 0o755);
    await chmod(paths.splatTransformNodePath, 0o755);
  }
  const smoke = await runProcess(paths.worldRuntimePath, ["--runtime-smoke-check"], {
    timeoutMs: 300_000,
  });
  if (!smoke.stdout.includes("AI_ANIME_WORLD_RUNTIME_SMOKE")) {
    throw new Error("3D 推理运行环境完整性标记缺失");
  }
  const splat = await runProcess(
    paths.splatTransformNodePath,
    [paths.splatTransformCliPath, "--help"],
    { timeoutMs: 60_000 },
  );
  if (!splat.stdout.includes("Transform and Filter Gaussian Splats")) {
    throw new Error("3DGS 转换运行环境检查失败");
  }
}

export class RuntimeDependencyManager {
  readonly paths: InstalledWorldRuntimePaths;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly dependencyRoot: string;
  private installing = false;

  constructor(
    userDataPath: string,
    options: { platform?: NodeJS.Platform; arch?: string } = {},
  ) {
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.paths = installedWorldRuntimePaths(userDataPath, this.platform);
    this.dependencyRoot = resolve(userDataPath, "dependencies", "world");
    const resolvedUserData = resolve(userDataPath);
    if (!this.dependencyRoot.startsWith(`${resolvedUserData}${sep}`)) {
      throw new Error("运行环境安装目录无效");
    }
  }

  async status(): Promise<RuntimeDependencyStatus> {
    const supported = supportedPlatform(this.platform, this.arch);
    const base = {
      id: "world" as const,
      supported,
      installing: this.installing,
      platform: this.platform,
      arch: this.arch,
      accelerator: acceleratorLabel(this.platform, this.arch),
    };
    if (!supported) {
      return {
        ...base,
        installed: false,
        healthy: false,
        state: "unsupported",
        message: "当前仅提供 Windows x64 与 macOS Apple Silicon 预编译运行环境。",
      };
    }
    if (this.installing) {
      return {
        ...base,
        installed: existsSync(this.paths.root),
        healthy: false,
        state: "installing",
        message: "正在安装导演世界 3D 运行环境。",
      };
    }

    const receipt = await this.readReceipt();
    if (!existsSync(this.paths.root) || !receipt) {
      return {
        ...base,
        installed: false,
        healthy: false,
        state: "not-installed",
        message: "导演世界 3D 运行环境尚未安装。",
      };
    }
    try {
      await checkRuntime(this.paths);
      return {
        ...base,
        installed: true,
        healthy: true,
        state: "ready",
        version: receipt.version,
        downloadSizeBytes: receipt.downloadSizeBytes,
        installedSizeBytes: receipt.installedSizeBytes,
        message: "导演世界 3D 运行环境完整，可以使用。",
      };
    } catch (error) {
      return {
        ...base,
        installed: true,
        healthy: false,
        state: "incomplete",
        version: receipt.version,
        downloadSizeBytes: receipt.downloadSizeBytes,
        installedSizeBytes: receipt.installedSizeBytes,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async install(
    onProgress: (progress: RuntimeDependencyProgress) => void = () => undefined,
  ): Promise<RuntimeDependencyStatus> {
    if (!supportedPlatform(this.platform, this.arch)) {
      throw new Error("当前平台没有可安装的导演世界 3D 运行环境");
    }
    if (this.installing) throw new Error("导演世界 3D 运行环境正在安装");
    this.installing = true;
    const nonce = `${process.pid}-${Date.now()}`;
    const archivePath = join(this.dependencyRoot, `.world-${nonce}.tar.gz`);
    const stagingPath = join(this.dependencyRoot, `.staging-${nonce}`);
    const previousPath = join(this.dependencyRoot, `.previous-${nonce}`);
    let movedCurrent = false;
    try {
      await mkdir(this.dependencyRoot, { recursive: true });
      onProgress({ phase: "manifest", message: "正在获取国内镜像安装清单…" });
      const manifest = await this.fetchManifest();
      await this.downloadArchive(manifest.package, archivePath, onProgress);

      onProgress({ phase: "verifying", message: "正在校验安装包完整性…" });
      const digest = await sha256File(archivePath);
      if (digest.toLowerCase() !== manifest.package.sha256.toLowerCase()) {
        throw new Error("运行环境安装包 SHA-256 校验失败");
      }
      await verifyArchiveEntries(archivePath);

      onProgress({ phase: "extracting", message: "正在解压运行环境…" });
      await mkdir(stagingPath, { recursive: true });
      await runProcess("tar", ["-xzf", archivePath, "-C", stagingPath], {
        timeoutMs: 900_000,
      });

      onProgress({ phase: "checking", message: "正在检查 3D 推理与转换组件…" });
      const stagingPaths = pathsAtRoot(stagingPath, this.platform);
      await checkRuntime(stagingPaths);
      const receipt: InstallReceipt = {
        schemaVersion: 1,
        id: "world",
        version: manifest.package.version,
        platform: this.platform,
        arch: this.arch,
        sha256: manifest.package.sha256,
        downloadSizeBytes: manifest.package.downloadSizeBytes,
        installedSizeBytes: manifest.package.installedSizeBytes,
        installedAt: new Date().toISOString(),
      };
      await writeFile(
        join(stagingPath, INSTALL_RECEIPT),
        `${JSON.stringify(receipt, null, 2)}\n`,
        "utf8",
      );

      if (existsSync(this.paths.root)) {
        await rename(this.paths.root, previousPath);
        movedCurrent = true;
      }
      await rename(stagingPath, this.paths.root);
      if (movedCurrent) await rm(previousPath, { recursive: true, force: true });
      onProgress({ phase: "complete", message: "导演世界 3D 运行环境安装完成。", percent: 100 });
    } catch (error) {
      if (movedCurrent && !existsSync(this.paths.root) && existsSync(previousPath)) {
        await rename(previousPath, this.paths.root).catch(() => undefined);
      }
      throw error;
    } finally {
      this.installing = false;
      await rm(archivePath, { force: true }).catch(() => undefined);
      await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
      await rm(previousPath, { recursive: true, force: true }).catch(() => undefined);
    }
    return await this.status();
  }

  private async fetchManifest(): Promise<RuntimeDependencyManifest> {
    const response = await fetch(
      runtimeDependencyManifestUrl(this.platform, this.arch),
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok) throw new Error(`运行环境清单下载失败（HTTP ${response.status}）`);
    return parseManifest(await response.json(), this.platform, this.arch);
  }

  private async downloadArchive(
    packageInfo: RuntimeDependencyPackage,
    targetPath: string,
    onProgress: (progress: RuntimeDependencyProgress) => void,
  ): Promise<void> {
    let lastError: unknown;
    for (const url of packageInfo.urls) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3_600_000) });
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }
        const headerSize = Number(response.headers.get("content-length") || 0);
        const totalBytes = headerSize > 0 ? headerSize : packageInfo.downloadSizeBytes;
        const destination = await open(targetPath, "w");
        let transferredBytes = 0;
        try {
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await destination.write(value);
            transferredBytes += value.byteLength;
            onProgress({
              phase: "downloading",
              message: "正在从国内镜像下载 3D 运行环境…",
              transferredBytes,
              totalBytes,
              ...(totalBytes > 0
                ? { percent: Math.min(99, (transferredBytes / totalBytes) * 100) }
                : {}),
            });
          }
          await destination.sync();
        } finally {
          await destination.close();
        }
        return;
      } catch (error) {
        lastError = error;
        await rm(targetPath, { force: true }).catch(() => undefined);
      }
    }
    throw new Error(`所有运行环境下载镜像均失败：${String(lastError)}`);
  }

  private async readReceipt(): Promise<InstallReceipt | null> {
    try {
      const value = JSON.parse(
        await readFile(join(this.paths.root, INSTALL_RECEIPT), "utf8"),
      ) as Partial<InstallReceipt>;
      if (
        value.schemaVersion !== 1 ||
        value.id !== "world" ||
        value.platform !== this.platform ||
        value.arch !== this.arch ||
        typeof value.version !== "string"
      ) {
        return null;
      }
      return value as InstallReceipt;
    } catch {
      return null;
    }
  }
}
