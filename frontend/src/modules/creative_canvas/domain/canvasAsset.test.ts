// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  groupCanvasAssetsByDate,
  type CanvasAsset,
} from './canvasAsset';

function asset(id: string, timestamp: number | null): CanvasAsset {
  return {
    id,
    kind: 'image',
    url: `/${id}.png`,
    previewUrl: null,
    nodeId: `node-${id}`,
    label: id,
    timestamp,
  };
}

describe('groupCanvasAssetsByDate', () => {
  it('sorts dated groups and assets while keeping undated assets last', () => {
    const firstDay = Date.parse('2026-07-29T09:00:00');
    const secondDayEarly = Date.parse('2026-07-30T08:00:00');
    const secondDayLate = Date.parse('2026-07-30T12:00:00');

    expect(
      groupCanvasAssetsByDate(
        [
          asset('undated', null),
          asset('second-early', secondDayEarly),
          asset('first', firstDay),
          asset('second-late', secondDayLate),
        ],
        'desc',
      ),
    ).toEqual([
      {
        date: '2026-07-30',
        assets: [
          expect.objectContaining({ id: 'second-late' }),
          expect.objectContaining({ id: 'second-early' }),
        ],
      },
      {
        date: '2026-07-29',
        assets: [expect.objectContaining({ id: 'first' })],
      },
      {
        date: null,
        assets: [expect.objectContaining({ id: 'undated' })],
      },
    ]);
  });

  it('supports ascending order without mutating the input array', () => {
    const later = asset('later', Date.parse('2026-07-30T12:00:00'));
    const earlier = asset('earlier', Date.parse('2026-07-30T08:00:00'));
    const input = [later, earlier];

    expect(groupCanvasAssetsByDate(input, 'asc')[0]?.assets).toEqual([
      earlier,
      later,
    ]);
    expect(input).toEqual([later, earlier]);
  });
});
