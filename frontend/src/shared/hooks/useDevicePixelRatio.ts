// Copyright (c) 2026 AI anime
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let watched: MediaQueryList | null = null;

function currentRatio(): number {
  if (typeof window === 'undefined') return 1;
  const value = window.devicePixelRatio;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function handleChange(): void {
  watch();
  for (const listener of listeners) listener();
}

function watch(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }
  watched?.removeEventListener('change', handleChange);
  watched = window.matchMedia(`(resolution: ${currentRatio()}dppx)`);
  watched.addEventListener('change', handleChange);
}

function unwatch(): void {
  watched?.removeEventListener('change', handleChange);
  watched = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) watch();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) unwatch();
  };
}

export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribe, currentRatio, () => 1);
}
