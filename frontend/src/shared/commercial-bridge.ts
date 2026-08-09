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
    const message = error.message.replace(
      /^Error invoking remote method '[^']+': (?:(?:[A-Za-z][A-Za-z0-9]*Error): )?/,
      "",
    );
    throw new Error(message || error.message);
  }
}
