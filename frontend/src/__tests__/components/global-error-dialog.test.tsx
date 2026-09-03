// Copyright (c) 2026 AI anime
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalErrorDialog } from '@/components/GlobalErrorDialog';

describe('GlobalErrorDialog clipboard', () => {
  const desktopWriteText = vi.fn<(value: string) => Promise<void>>();
  const browserWriteText = vi.fn<(value: string) => Promise<void>>();

  beforeEach(() => {
    desktopWriteText.mockReset().mockResolvedValue(undefined);
    browserWriteText.mockReset().mockRejectedValue(new Error('Clipboard permission denied'));
    window.aiAnimeDesktop = {
      clipboard: { writeText: desktopWriteText },
    } as unknown as AIAnimeDesktopBridge;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: browserWriteText },
    });
  });

  afterEach(() => {
    cleanup();
    delete window.aiAnimeDesktop;
  });

  it('copies the complete report through the desktop bridge and confirms success', async () => {
    render(<GlobalErrorDialog isOpen title="出错了" message="生成失败" details="技术详情" copyText={'完整报告\n请求 ID: test'} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'errorDialog.copyReport' }));
    await screen.findByRole('button', { name: 'nodeToolbar.copied' });
    expect(desktopWriteText).toHaveBeenCalledWith('完整报告\n请求 ID: test');
    expect(browserWriteText).not.toHaveBeenCalled();
  });

  it('shows a failed copy and allows a successful retry', async () => {
    desktopWriteText.mockRejectedValueOnce(new Error('IPC unavailable'));
    render(<GlobalErrorDialog isOpen title="出错了" message="生成失败" details="请求详情" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'errorDialog.copyReport' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('errorDialog.copyFailed');
    fireEvent.click(screen.getByRole('button', { name: 'errorDialog.copyReport' }));
    await screen.findByRole('button', { name: 'nodeToolbar.copied' });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(desktopWriteText).toHaveBeenLastCalledWith('生成失败\n\n请求详情');
  });
});
