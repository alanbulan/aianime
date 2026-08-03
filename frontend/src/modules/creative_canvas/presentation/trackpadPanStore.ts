// Copyright (c) 2026 AI anime
import { create } from 'zustand';

const STORAGE_KEY = 'canvas.trackpadPan.enabled';

function readPersistedEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null || stored === '1';
  } catch {
    return true;
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

interface TrackpadPanState {
  enabled: boolean;
  toggle: () => void;
}

export const useTrackpadPanStore = create<TrackpadPanState>((set, get) => ({
  enabled: readPersistedEnabled(),
  toggle: () => {
    const next = !get().enabled;
    persistEnabled(next);
    set({ enabled: next });
  },
}));
