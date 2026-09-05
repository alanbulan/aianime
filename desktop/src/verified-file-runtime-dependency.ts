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
import {
  fetchRuntimeDependencyManifest,
  type RuntimeDependencyId,
} from "./runtime-dependency-manifest.js";

const INSTALL_RECEIPT = "install.json";
const VERIFY_CACHE_MS = 30_000;

export type VerifiedFileDependencyPhase =
  | "manifest"
  | "downloading"
  | "verifying"
  | "checking"
  | "complete";

export interface VerifiedFileDependencyProgress {
  phase: VerifiedFileDependencyPhase;
  message: string;
  transferredBytes?: number;
  totalBytes?: number;
  percent?: number;
}

export interface VerifiedFileDependencyFile {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  urls: readonly string[];
}

export interface VerifiedFileDependencyPackage {
  version: string;
  files: readonly VerifiedFileDependencyFile[];
}

export interface VerifiedFileDependencyDefinition<Id extends RuntimeDependencyId> {
  id: Id;
  directoryName: string;
  displayName: string;
  accelerator: string;
  packageInfo: VerifiedFileDependencyPackage;
  supported?: (platform: NodeJS.Platform, arch: string) => boolean;
  unsupportedMessage?: string;
  readyMessage?: string;
  notInstalledMessage?: string;
}

export interface VerifiedFileDependencyStatus<Id extends string> {
  id: Id;
  supported: boolean;
  installed: boolean;
  healthy: boolean;
  installing: boolean;
  state: "unsupported" | "not-installed" | "incomplete" | "ready" | "installing";
  platform: NodeJS.Platform;
  arch: string;
  accelerator: string;
  version?: string;
  downloadSizeBytes: number;
  installedSizeBytes: number;
  message: string;
}

interface VerifiedFileInstallReceipt<Id extends string> {
  schemaVersion: 1;
  id: Id;
  version: string;
  files: Array<{
    relativePath: string;
    sizeBytes: number;
    sha256: string;
  }>;
  installedAt: string;
}

function packageSize(packageInfo: VerifiedFileDependencyPackage): number {
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

export function isVerifiedFileDownloadUrlAllowed(value: string): boolean {
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

function validatePackage(
  displayName: string,
  packageInfo: VerifiedFileDependencyPackage,
): void {
  if (typeof packageInfo.version !== "string" || !packageInfo.version.trim()
    || !Array.isArray(packageInfo.files) || packageInfo.files.length === 0) {
    throw new Error(`${displayName}文件清单为空`);
  }
  const paths = new Set<string>();
  for (const file of packageInfo.files) {
    if (
      !file || typeof file !== "object"
      || typeof file.relativePath !== "string"
      || !isSafeRelativePath(file.relativePath)
      || paths.has(file.relativePath)
      || !Number.isSafeInteger(file.sizeBytes)
      || file.sizeBytes <= 0
      || !/^[a-f0-9]{64}$/iu.test(file.sha256)
      || !Array.isArray(file.urls)
      || file.urls.length === 0
      || !file.urls.every(isVerifiedFileDownloadUrlAllowed)
    ) {
      throw new Error(`${displayName}文件清单无效: ${file?.relativePath ?? "unknown"}`);
    }
    paths.add(file.relativePath);
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

export class VerifiedFileRuntimeDependencyManager<Id extends RuntimeDependencyId> {
  readonly root: string;
  private readonly definition: VerifiedFileDependencyDefinition<Id>;
  private readonly packageInfo: VerifiedFileDependencyPackage;
  private readonly dependencyRoot: string;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly fetchImpl: typeof fetch;
  private installing = false;
  private verification: { at: number; error: Error | null } | null = null;
  private verificationInFlight: Promise<Error | null> | null = null;

  constructor(
    userDataPath: string,
    definition: VerifiedFileDependencyDefinition<Id>,
    options: {
      platform?: NodeJS.Platform;
      arch?: string;
      packageInfo?: VerifiedFileDependencyPackage;
      fetchImpl?: typeof fetch;
    } = {},
  ) {
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.definition = definition;
    this.packageInfo = options.packageInfo ?? definition.packageInfo;
    this.fetchImpl = options.fetchImpl ?? fetch;
    validatePackage(definition.displayName, this.packageInfo);
    this.dependencyRoot = resolve(
      userDataPath,
      "dependencies",
      definition.directoryName,
    );
    this.root = join(this.dependencyRoot, "current");
    const resolvedUserData = resolve(userDataPath);
    if (!this.dependencyRoot.startsWith(`${resolvedUserData}${sep}`)) {
      throw new Error(`${definition.displayName}安装目录无效`);
    }
  }

  async status(): Promise<VerifiedFileDependencyStatus<Id>> {
    const totalBytes = packageSize(this.packageInfo);
    const supported = this.definition.supported?.(this.platform, this.arch) ?? true;
    const base = {
      id: this.definition.id,
      supported,
      installing: this.installing,
      platform: this.platform,
      arch: this.arch,
      accelerator: this.definition.accelerator,
      downloadSizeBytes: totalBytes,
    };
    if (!supported) {
      return {
        ...base,
        installed: false,
        healthy: false,
        state: "unsupported",
        installedSizeBytes: 0,
        message:
          this.definition.unsupportedMessage
          ?? `当前平台不支持${this.definition.displayName}。`,
      };
    }
    if (this.installing) {
      return {
        ...base,
        installed: existsSync(this.root),
        healthy: false,
        state: "installing",
        installedSizeBytes: existsSync(this.root) ? totalBytes : 0,
        message: `正在安装${this.definition.displayName}。`,
      };
    }

    const receipt = await this.readReceipt();
    if (!existsSync(this.root)) {
      return {
        ...base,
        installed: false,
        healthy: false,
        state: "not-installed",
        installedSizeBytes: 0,
        message:
          this.definition.notInstalledMessage
          ?? `${this.definition.displayName}尚未安装。`,
      };
    }
    if (!receipt) {
      return {
        ...base,
        installed: true,
        healthy: false,
        state: "incomplete",
        installedSizeBytes: 0,
        message: `${this.definition.displayName}安装记录缺失，请重新安装。`,
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
      message:
        this.definition.readyMessage
        ?? `${this.definition.displayName}完整，可以使用。`,
    };
  }

  async install(
    onProgress: (progress: VerifiedFileDependencyProgress) => void = () => undefined,
  ): Promise<VerifiedFileDependencyStatus<Id>> {
    const supported = this.definition.supported?.(this.platform, this.arch) ?? true;
    if (!supported) throw new Error(`当前平台不支持${this.definition.displayName}`);
    if (this.installing) throw new Error(`${this.definition.displayName}正在安装`);
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
        message: `正在准备${this.definition.displayName}安装清单…`,
        totalBytes,
        percent: 0,
      });
      const downloadPackage = await this.fetchDownloadPackage();
      for (const file of downloadPackage.files) {
        const targetPath = join(stagingPath, file.relativePath);
        await mkdir(dirname(targetPath), { recursive: true });
        await this.downloadFile(
          file,
          targetPath,
          completedBytes,
          totalBytes,
          onProgress,
        );
        completedBytes += file.sizeBytes;
      }

      const receipt: VerifiedFileInstallReceipt<Id> = {
        schemaVersion: 1,
        id: this.definition.id,
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
        message: `正在检查${this.definition.displayName}完整性…`,
        transferredBytes: totalBytes,
        totalBytes,
        percent: 100,
      });

      if (existsSync(this.root)) {
        await rename(this.root, previousPath);
        movedCurrent = true;
      }
      await rename(stagingPath, this.root);
      if (movedCurrent) await rm(previousPath, { recursive: true, force: true });
      onProgress({
        phase: "complete",
        message: `${this.definition.displayName}安装完成。`,
        transferredBytes: totalBytes,
        totalBytes,
        percent: 100,
      });
    } catch (error) {
      if (movedCurrent && !existsSync(this.root) && existsSync(previousPath)) {
        await rename(previousPath, this.root).catch(() => undefined);
      }
      throw error;
    } finally {
      this.installing = false;
      this.verification = null;
      await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
    }
    return await this.status();
  }

  private async downloadFile(
    file: VerifiedFileDependencyFile,
    targetPath: string,
    completedBytes: number,
    totalBytes: number,
    onProgress: (progress: VerifiedFileDependencyProgress) => void,
  ): Promise<void> {
    let lastError: unknown;
    let urls = [...file.urls];
    let refreshed = false;
    while (urls.length > 0) {
      const url = urls.shift()!;
      try {
        const response = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(3_600_000),
          redirect: "error",
        });
        if (response.status === 403 && !refreshed) {
          await response.body?.cancel();
          refreshed = true;
          const freshPackage = await this.fetchDownloadPackage();
          const freshFile = freshPackage.files.find((entry) => entry.relativePath === file.relativePath)!;
          urls = [...freshFile.urls];
          continue;
        }
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw new Error(`HTTP ${response.status}`);
        }
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
      `${this.definition.displayName}文件下载或校验失败（${file.relativePath}）：${String(lastError)}`,
    );
  }

  private async fetchDownloadPackage(): Promise<VerifiedFileDependencyPackage> {
    const value = await fetchRuntimeDependencyManifest(
      this.definition.id, this.platform, this.arch, this.fetchImpl, this.packageInfo.version,
    );
    if (!value || typeof value !== "object") throw new Error("依赖清单格式无效");
    const manifest = value as {
      schemaVersion?: unknown;
      package?: Partial<VerifiedFileDependencyPackage> & {
        id?: unknown; platform?: unknown; arch?: unknown;
      };
    };
    const candidate = manifest.package;
    if (
      manifest.schemaVersion !== 1
      || candidate?.id !== this.definition.id
      || candidate.platform !== this.platform
      || candidate.arch !== this.arch
      || candidate.version !== this.packageInfo.version
      || !Array.isArray(candidate.files)
      || candidate.files.length !== this.packageInfo.files.length
    ) {
      throw new Error("依赖清单与当前平台或客户端锁定版本不匹配");
    }
    const packageInfo = candidate as VerifiedFileDependencyPackage;
    validatePackage(this.definition.displayName, packageInfo);
    for (const expected of this.packageInfo.files) {
      const actual = packageInfo.files.find((file) => file.relativePath === expected.relativePath);
      if (!actual || actual.sizeBytes !== expected.sizeBytes
        || actual.sha256.toLowerCase() !== expected.sha256.toLowerCase()) {
        throw new Error(`依赖清单与客户端锁定文件不匹配: ${expected.relativePath}`);
      }
    }
    return packageInfo;
  }

  private async verifyFile(
    path: string,
    file: VerifiedFileDependencyFile,
  ): Promise<void> {
    const details = await stat(path).catch(() => null);
    if (!details?.isFile() || details.size !== file.sizeBytes) {
      throw new Error(`${this.definition.displayName}文件大小校验失败: ${file.relativePath}`);
    }
    const digest = await sha256File(path);
    if (digest.toLowerCase() !== file.sha256.toLowerCase()) {
      throw new Error(`${this.definition.displayName}文件 SHA-256 校验失败: ${file.relativePath}`);
    }
  }

  private async verifyInstalledFiles(): Promise<Error | null> {
    const cached = this.verification;
    if (cached && Date.now() - cached.at < VERIFY_CACHE_MS) return cached.error;
    if (this.verificationInFlight) return this.verificationInFlight;
    const run = (async () => {
      try {
        for (const file of this.packageInfo.files) {
          await this.verifyFile(join(this.root, file.relativePath), file);
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

  private async readReceipt(): Promise<VerifiedFileInstallReceipt<Id> | null> {
    try {
      const value = JSON.parse(
        await readFile(join(this.root, INSTALL_RECEIPT), "utf8"),
      ) as Partial<VerifiedFileInstallReceipt<Id>>;
      if (
        value.schemaVersion !== 1
        || value.id !== this.definition.id
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
      return value as VerifiedFileInstallReceipt<Id>;
    } catch {
      return null;
    }
  }
}
