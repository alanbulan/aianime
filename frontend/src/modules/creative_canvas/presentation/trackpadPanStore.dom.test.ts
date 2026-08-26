// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from 'vitest';

import { useTrackpadPanStore } from './trackpadPanStore';

describe('useTrackpadPanStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTrackpadPanStore.setState({ enabled: true });
  });

  it('toggles and persists the viewport preference', () => {
    useTrackpadPanStore.getState().toggle();
    expect(useTrackpadPanStore.getState().enabled).toBe(false);
    expect(window.localStorage.getItem('canvas.trackpadPan.enabled')).toBe('0');

    useTrackpadPanStore.getState().toggle();
    expect(useTrackpadPanStore.getState().enabled).toBe(true);
    expect(window.localStorage.getItem('canvas.trackpadPan.enabled')).toBe('1');
  });
});
