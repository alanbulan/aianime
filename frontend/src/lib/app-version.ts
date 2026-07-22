// Copyright (c) 2026 AI anime
/**
 * Build-time constants, injected by Vite's `define` (see vite.config.ts).
 *
 * APP_VERSION is the human-facing version shown in the status bar.
 *   1. $VITE_APP_VERSION in the build environment (set by CI from the git tag).
 *   2. a hardcoded default otherwise.
 * BUILD_ID is a per-build cache key for localised resources.
 */
declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_ID: string = __BUILD_ID__;
