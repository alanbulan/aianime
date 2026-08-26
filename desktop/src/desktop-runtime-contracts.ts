// Copyright (c) 2026 AI anime

export const AUTH_COOKIE_NAME = "ai_anime_session";

const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function commercialPlatform(
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  return platform;
}

export function commercialArchitecture(arch: string = process.arch): string {
  return arch === "x64" ? "x86_64" : arch;
}

export function isSameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

export function isAllowedExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function desktopSessionCookie(
  origin: string,
  username: string,
  nowMs: number = Date.now(),
) {
  return {
    url: origin,
    name: AUTH_COOKIE_NAME,
    value: `desktop.${Buffer.from(username, "utf8").toString("base64url")}`,
    path: "/",
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax" as const,
    expirationDate: nowMs / 1000 + AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}
