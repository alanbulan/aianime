// Copyright (c) 2026 AI anime
// A navigation lock shared by the ky 401 handler and the region switch orchestrator.
// Whichever path acquires it first wins; the other backs off. Browser navigation
// (hard reload) zeroes the module state for us, so no manual release is needed.
let locked = false;

export function tryAcquireNavLock(): boolean {
  if (locked) return false;
  locked = true;
  return true;
}

export function isNavLocked(): boolean {
  return locked;
}
