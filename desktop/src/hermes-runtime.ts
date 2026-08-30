import { statSync } from "node:fs";
import { posix, win32 } from "node:path";

interface HermesRuntimePathOptions {
  packaged: boolean;
  repositoryRoot: string;
  resourcesPath: string;
  platform?: NodeJS.Platform;
}

export interface HermesRuntimePaths {
  cliPath: string;
  assetsPath: string;
}

function pathApi(platform: NodeJS.Platform) {
  return platform === "win32" ? win32 : posix;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function developmentHermesCliPath(
  repositoryRoot: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathApi(platform).join(
    repositoryRoot,
    "desktop",
    "hermes-runtime",
    "hermes_acp.py",
  );
}

export function packagedHermesCliPath(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathApi(platform).join(
    resourcesPath,
    "hermes",
    "hermes-acp",
    platform === "win32" ? "hermes-acp.exe" : "hermes-acp",
  );
}

export function resolveHermesRuntimePaths(
  options: HermesRuntimePathOptions,
): HermesRuntimePaths {
  const platform = options.platform ?? process.platform;
  const paths = pathApi(platform);
  const cliPath = options.packaged
    ? packagedHermesCliPath(options.resourcesPath, platform)
    : developmentHermesCliPath(options.repositoryRoot, platform);
  const assetsPath = options.packaged
    ? paths.join(options.resourcesPath, "hermes-assets")
    : paths.join(options.repositoryRoot, ".hermes");

  if (!isFile(cliPath)) {
    throw new Error(`内置 Hermes ACP 运行时缺失：${cliPath}`);
  }
  if (!isDirectory(assetsPath)) {
    throw new Error(`内置 Hermes Agent 工具资产缺失：${assetsPath}`);
  }
  return { cliPath, assetsPath };
}
