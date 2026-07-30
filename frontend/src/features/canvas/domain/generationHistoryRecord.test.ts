// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  hasCompletedHistoryRecords,
  historyRecordOutputUrl,
  historyRecordPrompt,
  historyRecordWorldUrl,
} from './generationHistoryRecord';

describe('generationHistoryRecord', () => {
  it('uses the established output URL priority', () => {
    expect(
      historyRecordOutputUrl({
        result: {
          url: '/fallback.png',
          video_url: '/video.mp4',
          output_url: '/output.png',
        },
      }),
    ).toBe('/output.png');
  });

  it('prefers a packaged world asset over nested PLY candidates', () => {
    expect(
      historyRecordWorldUrl({
        result: {
          data: {
            ply_url: '/world.ply',
            artifacts: [{ sog_url: '/world.sog' }],
          },
        },
      }),
    ).toBe('/world.sog');
  });

  it('finds a prompt in a nested request payload', () => {
    expect(
      historyRecordPrompt({
        result: { request: { positive_prompt: '雨夜街道' } },
      }),
    ).toBe('雨夜街道');
  });

  it('recognizes only completed and succeeded records as visible history', () => {
    expect(
      hasCompletedHistoryRecords([
        { status: 'failed' },
        { status: 'succeeded' },
      ]),
    ).toBe(true);
    expect(hasCompletedHistoryRecords([{ status: 'pending' }])).toBe(false);
  });
});
