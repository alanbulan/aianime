// Copyright (c) 2026 AI anime
import { create } from 'zustand';

import type { SnapAlignGuides } from '@/modules/creative_canvas/domain/canvasSnapAlignment';

const STORAGE_KEY = 'canvas.snapAlign.enabled';

function readPersistedEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistEnabled(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Persistence is optional; runtime state remains usable when storage is blocked.
  }
}

const EMPTY_GUIDES: SnapAlignGuides = { vertical: [], horizontal: [] };

interface SnapAlignState {
  enabled: boolean;
  guides: SnapAlignGuides;
  toggle: () => void;
  setGuides: (guides: SnapAlignGuides) => void;
  clearGuides: () => void;
}

export const useSnapAlignStore = create<SnapAlignState>((set, get) => ({
  enabled: readPersistedEnabled(),
  guides: EMPTY_GUIDES,
  toggle: () => {
    const next = !get().enabled;
    persistEnabled(next);
    set({ enabled: next, guides: EMPTY_GUIDES });
  },
  setGuides: (guides) => set({ guides }),
  clearGuides: () => {
    const current = get().guides;
    if (current.vertical.length === 0 && current.horizontal.length === 0) {
      return;
    }
    set({ guides: EMPTY_GUIDES });
  },
}));
