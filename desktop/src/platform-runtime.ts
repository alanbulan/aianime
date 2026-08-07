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

export function packagedVideoCodec(
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") return "libopenh264";
  if (platform === "darwin") return "h264_videotoolbox";
  return "libx264";
}

export function releaseInstallerCommand(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  return platform === "darwin"
    ? { command: "/usr/bin/open", args: [filePath] }
    : { command: filePath, args: [] };
}
