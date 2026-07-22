// Copyright (c) 2026 AI anime
// Module-level AbortController shared by ky and auth-store raw fetches.
// The region-switch orchestrator calls abort() then resetRegionAbortController()
// so the next region starts with a fresh controller.
let controller = new AbortController();

export function regionAbortController(): AbortController {
  return controller;
}

export function resetRegionAbortController(): void {
  controller = new AbortController();
}
