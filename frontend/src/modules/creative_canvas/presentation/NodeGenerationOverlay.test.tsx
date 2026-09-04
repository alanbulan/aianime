// Copyright (c) 2026 AI anime
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NodeGenerationOverlay } from './NodeGenerationOverlay';

describe('NodeGenerationOverlay', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-03T12:00:00Z')); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('uses reported progress as a floor and visibly advances between reports', () => {
    const { rerender } = render(<NodeGenerationOverlay progress={0.1} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByText('10.0')).toBeInTheDocument();

    rerender(<NodeGenerationOverlay progress={0.33} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByText('33.0')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(33);
  });

  it('shows one estimated progress value and elapsed feedback while no numeric report is available', () => {
    render(<NodeGenerationOverlay progress={null} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
    expect(screen.getByText('taskProgress.estimatedLabel')).toBeInTheDocument();
    expect(screen.getByText('8.0')).toBeInTheDocument();
    expect(screen.queryByText('taskProgress.estimated')).not.toBeInTheDocument();
    expect(screen.getByText('taskProgress.elapsed')).toBeInTheDocument();
    expect(screen.queryByText('96')).not.toBeInTheDocument();
  });
});
