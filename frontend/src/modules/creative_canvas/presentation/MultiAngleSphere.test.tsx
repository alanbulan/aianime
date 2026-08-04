// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MultiAngleSphere } from './MultiAngleSphere';

describe('MultiAngleSphere', () => {
  it('normalizes yaw and clamps pitch for directional adjustments', () => {
    const onAngleChange = vi.fn();
    const { rerender } = render(
      <MultiAngleSphere
        horizontalDeg={350}
        verticalDeg={80}
        imageScale={0.5}
        imageSource="/reference.png"
        onAngleChange={onAngleChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'right' }));
    expect(onAngleChange).toHaveBeenLastCalledWith({
      horizontalDeg: 5,
      verticalDeg: 80,
    });

    fireEvent.click(screen.getByRole('button', { name: 'up' }));
    expect(onAngleChange).toHaveBeenLastCalledWith({
      horizontalDeg: 350,
      verticalDeg: 90,
    });

    rerender(
      <MultiAngleSphere
        horizontalDeg={5}
        verticalDeg={-85}
        imageScale={0.5}
        imageSource="/reference.png"
        onAngleChange={onAngleChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'left' }));
    expect(onAngleChange).toHaveBeenLastCalledWith({
      horizontalDeg: 350,
      verticalDeg: -85,
    });
    fireEvent.click(screen.getByRole('button', { name: 'down' }));
    expect(onAngleChange).toHaveBeenLastCalledWith({
      horizontalDeg: 5,
      verticalDeg: -90,
    });
  });
});
