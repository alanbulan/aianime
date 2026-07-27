export type ChunkLoadRecoveryResult = "ignored" | "needs-user-reload";

export function deployedVersionDiffers(
  deployed: string | null,
  running: string,
): boolean {
  return deployed !== null && deployed !== running;
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : "";
    const name = typeof record.name === "string" ? record.name : "";
    return `${name} ${message}`.trim();
  }
  return "";
}

export function isChunkLoadError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}
