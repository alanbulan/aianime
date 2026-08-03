// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/app/errorDialogEvents', () => ({
  openGlobalErrorDialog: vi.fn(),
}));

import { openGlobalErrorDialog } from '@/features/app/errorDialogEvents';
import { showErrorDialog } from '@/features/canvas/infrastructure/globalErrorDialog';

const openDialog = vi.mocked(openGlobalErrorDialog);

describe('Canvas global error dialog adapter', () => {
  beforeEach(() => {
    openDialog.mockReset();
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
