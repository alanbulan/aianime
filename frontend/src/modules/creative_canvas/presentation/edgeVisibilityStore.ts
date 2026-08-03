// Copyright (c) 2026 AI anime
import { create } from 'zustand';

const STORAGE_KEY = 'canvas.edges.hidden';

function readPersistedHidden(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persistHidden(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Persistence is optional; runtime state remains usable when storage is blocked.
  }
}

interface EdgeVisibilityState {
  hidden: boolean;
  toggle: () => void;
}

export const useEdgeVisibilityStore = create<EdgeVisibilityState>((set, get) => ({
  hidden: readPersistedHidden(),
  toggle: () => {
    const next = !get().hidden;
    persistHidden(next);
    set({ hidden: next });
  },
}));
