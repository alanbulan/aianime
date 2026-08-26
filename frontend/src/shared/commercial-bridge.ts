const COMMERCIAL_IPC_ERROR_PREFIX = "AI_ANIME_COMMERCIAL_ERROR:";

export class CommercialBridgeError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(
    message: string,
    options: { status: number; code: string | null; requestId: string | null },
  ) {
    super(message);
    this.name = "CommercialBridgeError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
  }
}

export function getCommercialBridge(): Readonly<AIAnimeCommercialBridge> | null {
  return window.aiAnimeDesktop?.commercial ?? null;
}

export function requireCommercialBridge(
  message = "Commercial Gateway requires the Electron desktop app",
): Readonly<AIAnimeCommercialBridge> {
  const commercial = getCommercialBridge();
  if (!commercial) throw new Error(message);
  return commercial;
}

export async function invokeCommercial<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const encodedIndex = error.message.indexOf(COMMERCIAL_IPC_ERROR_PREFIX);
    if (encodedIndex >= 0) {
      const encoded = error.message.slice(
        encodedIndex + COMMERCIAL_IPC_ERROR_PREFIX.length,
      );
      try {
        const payload = JSON.parse(encoded) as Record<string, unknown>;
        if (
          typeof payload.message === "string" &&
          typeof payload.status === "number" &&
          (typeof payload.code === "string" || payload.code === null) &&
          (typeof payload.requestId === "string" || payload.requestId === null)
        ) {
          throw new CommercialBridgeError(payload.message, {
            status: payload.status,
            code: payload.code,
            requestId: payload.requestId,
          });
        }
      } catch (decodedError) {
        if (decodedError instanceof CommercialBridgeError) throw decodedError;
      }
    }
    const message = error.message.replace(
      /^Error invoking remote method '[^']+': (?:(?:Error|[A-Za-z][A-Za-z0-9]*Error): )?/,
      "",
    );
    throw new Error(message || error.message);
  }
}
