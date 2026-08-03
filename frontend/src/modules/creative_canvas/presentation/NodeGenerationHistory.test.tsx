// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasGenerationHistoryRecord } from '../domain/generationHistoryRecord';
import { NodeGenerationHistory } from './NodeGenerationHistory';

function record(
  id: string,
  recordedAt: string,
  overrides: Partial<CanvasGenerationHistoryRecord> = {},
): CanvasGenerationHistoryRecord {
  return {
    schema_version: 1,
    canvas_id: 'canvas-a',
    node_id: 'node-a',
    recorded_at: recordedAt,
    id,
    task_type: 'image.generate',
    task_key: `task-${id}`,
    job_id: `job-${id}`,
    status: 'completed',
    media_type: 'image',
    result: { output_url: `${id}.png` },
    ...overrides,
  };
}

describe('NodeGenerationHistory', () => {
  it('hides when no completed history is available', () => {
    const { container } = render(
      <NodeGenerationHistory
        records={[
          record('failed', '2026-08-01T00:00:00Z', { status: 'failed' }),
        ]}
        onRestore={vi.fn()}
        resolveMediaUrl={(url) => url}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('sorts records, resolves media at the boundary, and routes commands', () => {
    const onRestore = vi.fn();
    const onRefresh = vi.fn();
    const onParentClick = vi.fn();
    const resolveMediaUrl = vi.fn((url: string) => `/resolved/${url}`);
    const older = record('older', '2026-08-01T00:00:00Z');
    const newer = record('newer', '2026-08-02T00:00:00Z');
    const { container } = render(
      <div onClick={onParentClick}>
        <NodeGenerationHistory
          records={[older, newer]}
          onRestore={onRestore}
          onRefresh={onRefresh}
          isActive={(item) => item.id === 'newer'}
          resolveMediaUrl={resolveMediaUrl}
        />
      </div>,
    );

    const images = Array.from(container.querySelectorAll('img'));
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      '/resolved/newer.png',
      '/resolved/older.png',
    ]);

    fireEvent.click(container.querySelector('button[aria-pressed="true"]')!);
    fireEvent.click(screen.getByTitle('刷新历史'));

    expect(onRestore).toHaveBeenCalledWith(newer);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('uses the injected resolver for a non-media preview fallback', () => {
    const resolveMediaUrl = vi.fn((url: string) => `/resolved/${url}`);
    const { container } = render(
      <NodeGenerationHistory
        records={[
          record('text', '2026-08-01T00:00:00Z', {
            media_type: 'text',
            result: { prompt: 'scene prompt' },
          }),
        ]}
        fallbackThumbnailUrl="cover.png"
        onRestore={vi.fn()}
        resolveMediaUrl={resolveMediaUrl}
      />,
    );

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/resolved/cover.png',
    );
  });
});
