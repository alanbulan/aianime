// Copyright (c) 2026 AI anime
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NodeGenerationOverlay } from './NodeGenerationOverlay';

describe('NodeGenerationOverlay', () => {
  it('renders the authoritative task progress when available', () => {
    const { rerender } = render(<NodeGenerationOverlay progress={0.1} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByText('10')).toBeInTheDocument();

    rerender(<NodeGenerationOverlay progress={0.33} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByText('33')).toBeInTheDocument();
  });

  it('renders an indeterminate state instead of inventing progress', () => {
    render(<NodeGenerationOverlay progress={null} />);

    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText('96')).not.toBeInTheDocument();
  });
});
