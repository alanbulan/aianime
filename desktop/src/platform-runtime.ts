import { posix, win32 } from "node:path";

function pathApi(platform: NodeJS.Platform) {
  return platform === "win32" ? win32 : posix;
}

export function executableName(
  name: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32" ? `${name}.exe` : name;
}

export function bundledBackendPath(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathApi(platform).join(
    resourcesPath,
    "backend",
    executableName("ai-anime-backend", platform),
  );
}

export interface InstalledWorldRuntimePaths {
  root: string;
  worldRuntimePath: string;
  splatTransformCliPath: string;
  splatTransformNodePath: string;
}

export function installedWorldRuntimePaths(
  userDataPath: string,
  platform: NodeJS.Platform = process.platform,
): InstalledWorldRuntimePaths {
  const paths = pathApi(platform);
  const root = paths.join(userDataPath, "dependencies", "world", "current");
  return {
    root,
    worldRuntimePath: paths.join(
      root,
      "world-runtime",
      executableName("ai-anime-world-runtime", platform),
    ),
    splatTransformCliPath: paths.join(
      root,
      "splat-transform",
      "node_modules",
      "@playcanvas",
      "splat-transform",
      "bin",
      "cli.mjs",
    ),
    splatTransformNodePath: paths.join(
      root,
      "splat-transform",
      executableName("node", platform),
    ),
  };
}

export function bundledFfmpegPath(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathApi(platform).join(
    resourcesPath,
    "bin",
    executableName("ffmpeg", platform),
  );
}

export function developmentFfmpegPath(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathApi(platform).join(
    appPath,
    "runtime",
    "ffmpeg",
    executableName("ffmpeg", platform),
  );
}

export function bundledWhisperModelPath(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathApi(platform).join(
    resourcesPath,
    "whisper",
    "faster-whisper-base",
  );
}

export function developmentSplatTransformCliPath(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathApi(platform).join(
    appPath,
    "node_modules",
    "@playcanvas",
    "splat-transform",
    "bin",
    "cli.mjs",
  );
}

export function developmentSplatTransformNodePath(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathApi(platform).join(
    appPath,
    "runtime",
    "splat-transform",
    executableName("node", platform),
  );
}

export function developmentWhisperModelPath(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return pathApi(platform).join(
    appPath,
    "runtime",
    "whisper",
    "faster-whisper-base",
  );
}

export function packagedVideoCodec(
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") return "libopenh264";
  if (platform === "darwin") return "h264_videotoolbox";
  return "libx264";
}
