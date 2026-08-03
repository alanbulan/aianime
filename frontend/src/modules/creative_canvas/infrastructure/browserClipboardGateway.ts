// Copyright (c) 2026 AI anime
export interface BrowserClipboardRuntime {
  clipboard?: {
    writeText: (text: string) => Promise<void>;
  };
}

export function clearBrowserClipboard(
  runtime: BrowserClipboardRuntime | null =
    typeof navigator === 'undefined' ? null : navigator,
): Promise<void> {
  return runtime?.clipboard?.writeText('') ?? Promise.resolve();
}
