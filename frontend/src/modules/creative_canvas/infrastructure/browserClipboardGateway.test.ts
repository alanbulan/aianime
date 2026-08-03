// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from 'vitest';

import { clearBrowserClipboard } from './browserClipboardGateway';

describe('clearBrowserClipboard', () => {
  it('clears the browser clipboard with an empty text payload', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await clearBrowserClipboard({ clipboard: { writeText } });

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith('');
  });

  it('resolves when the Clipboard API is unavailable', async () => {
    await expect(clearBrowserClipboard(null)).resolves.toBeUndefined();
    await expect(clearBrowserClipboard({})).resolves.toBeUndefined();
  });
});
