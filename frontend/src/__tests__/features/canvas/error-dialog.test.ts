// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/app/errorDialogEvents', () => ({
  openGlobalErrorDialog: vi.fn(),
}));

import { openGlobalErrorDialog } from '@/features/app/errorDialogEvents';
import { resolveErrorContent } from '@/features/canvas/application/errorDialog';
import { showErrorDialog } from '@/features/canvas/infrastructure/globalErrorDialog';

const openDialog = vi.mocked(openGlobalErrorDialog);

describe('Canvas error dialog boundary', () => {
  beforeEach(() => {
    openDialog.mockReset();
  });

  it('resolves Error details without invoking presentation state', () => {
    const error = Object.assign(new Error('provider failed'), {
      details: ' request-id: abc ',
    });

    expect(resolveErrorContent(error, 'fallback')).toEqual({
      details: 'request-id: abc',
      message: 'provider failed',
    });
    expect(openDialog).not.toHaveBeenCalled();
  });

  it('resolves structured non-Error payloads with a stable fallback', () => {
    expect(resolveErrorContent({ code: 500, msg: '任务失败' }, 'fallback')).toEqual({
      details: '{\n  "code": 500,\n  "msg": "任务失败"\n}',
      message: '任务失败',
    });
    expect(resolveErrorContent(null, 'fallback')).toEqual({ message: 'fallback' });
  });

  it('ignores empty dialog messages', async () => {
    await showErrorDialog('   ', '错误');
    expect(openDialog).not.toHaveBeenCalled();
  });

  it('trims optional dialog content before dispatching the global event', async () => {
    await showErrorDialog(' 生成失败 ', '错误', ' detail ', ' copy ');

    expect(openDialog).toHaveBeenCalledWith({
      copyText: 'copy',
      details: 'detail',
      message: '生成失败',
      title: '错误',
    });
  });
});
