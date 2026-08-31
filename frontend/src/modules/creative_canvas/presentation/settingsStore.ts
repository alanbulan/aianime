// Copyright (c) 2026 AI anime
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { quotaSafeStateStorage } from '@/shared/localStorageQuota';

export type UiRadiusPreset = 'compact' | 'default' | 'large';
export type ThemeTonePreset = 'neutral' | 'warm' | 'cool';
export type CanvasEdgeRoutingMode = 'spline' | 'orthogonal' | 'smartOrthogonal';

interface SettingsState {
  isHydrated: boolean;
  hideProviderGuidePopover: boolean;
  useUploadFilenameAsNodeTitle: boolean;
  storyboardGenKeepStyleConsistent: boolean;
  storyboardGenDisableTextInImage: boolean;
  storyboardGenAutoInferEmptyFrame: boolean;
  ignoreAtTagWhenCopyingAndGenerating: boolean;
  enableStoryboardGenGridPreviewShortcut: boolean;
  showStoryboardGenAdvancedRatioControls: boolean;
  uiRadiusPreset: UiRadiusPreset;
  themeTonePreset: ThemeTonePreset;
  accentColor: string;
  canvasEdgeRoutingMode: CanvasEdgeRoutingMode;
  setHideProviderGuidePopover: (hide: boolean) => void;
  setUseUploadFilenameAsNodeTitle: (enabled: boolean) => void;
  setStoryboardGenKeepStyleConsistent: (enabled: boolean) => void;
  setStoryboardGenDisableTextInImage: (enabled: boolean) => void;
  setStoryboardGenAutoInferEmptyFrame: (enabled: boolean) => void;
  setIgnoreAtTagWhenCopyingAndGenerating: (enabled: boolean) => void;
  setEnableStoryboardGenGridPreviewShortcut: (enabled: boolean) => void;
  setShowStoryboardGenAdvancedRatioControls: (enabled: boolean) => void;
  setUiRadiusPreset: (preset: UiRadiusPreset) => void;
  setThemeTonePreset: (preset: ThemeTonePreset) => void;
  setAccentColor: (color: string) => void;
  setCanvasEdgeRoutingMode: (mode: CanvasEdgeRoutingMode) => void;
}

const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/;
const DEFAULT_ACCENT_COLOR = '#3B82F6';

function normalizeHexColor(input: string): string {
  const trimmed = input.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return DEFAULT_ACCENT_COLOR;
  }
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
}

function normalizeCanvasEdgeRoutingMode(
  input: CanvasEdgeRoutingMode | string | null | undefined
): CanvasEdgeRoutingMode {
  if (input === 'orthogonal' || input === 'smartOrthogonal' || input === 'spline') {
    return input;
  }
  return 'spline';
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isHydrated: false,
      hideProviderGuidePopover: false,
      useUploadFilenameAsNodeTitle: true,
      storyboardGenKeepStyleConsistent: true,
      storyboardGenDisableTextInImage: true,
      storyboardGenAutoInferEmptyFrame: true,
      ignoreAtTagWhenCopyingAndGenerating: true,
      enableStoryboardGenGridPreviewShortcut: false,
      showStoryboardGenAdvancedRatioControls: false,
      uiRadiusPreset: 'default',
      themeTonePreset: 'neutral',
      accentColor: DEFAULT_ACCENT_COLOR,
      canvasEdgeRoutingMode: 'spline',
      setHideProviderGuidePopover: (hide) => set({ hideProviderGuidePopover: hide }),
      setUseUploadFilenameAsNodeTitle: (enabled) => set({ useUploadFilenameAsNodeTitle: enabled }),
      setStoryboardGenKeepStyleConsistent: (enabled) =>
        set({ storyboardGenKeepStyleConsistent: enabled }),
      setStoryboardGenDisableTextInImage: (enabled) =>
        set({ storyboardGenDisableTextInImage: enabled }),
      setStoryboardGenAutoInferEmptyFrame: (enabled) =>
        set({ storyboardGenAutoInferEmptyFrame: enabled }),
      setIgnoreAtTagWhenCopyingAndGenerating: (enabled) =>
        set({ ignoreAtTagWhenCopyingAndGenerating: enabled }),
      setEnableStoryboardGenGridPreviewShortcut: (enabled) =>
        set({ enableStoryboardGenGridPreviewShortcut: enabled }),
      setShowStoryboardGenAdvancedRatioControls: (enabled) =>
        set({ showStoryboardGenAdvancedRatioControls: enabled }),
      setUiRadiusPreset: (uiRadiusPreset) => set({ uiRadiusPreset }),
      setThemeTonePreset: (themeTonePreset) => set({ themeTonePreset }),
      setAccentColor: (color) => set({ accentColor: normalizeHexColor(color) }),
      setCanvasEdgeRoutingMode: (canvasEdgeRoutingMode) =>
        set({ canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(canvasEdgeRoutingMode) }),
    }),
    {
      name: 'settings-storage',
      version: 23,
      // Quota-safe persistence: on a QuotaExceededError, prune stale freezone
      // canvas keys (via the registered reclaimer) and retry once instead of
      // letting the whole store fail to hydrate/persist.
      storage: createJSONStorage(() => quotaSafeStateStorage),
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.error('failed to hydrate settings storage', error);
          }
          // Defer past create() — when persist hydrates synchronously the
          // `useSettingsStore` binding is still in TDZ at this point.
          queueMicrotask(() => {
            useSettingsStore.setState({ isHydrated: true });
          });
        };
      },
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as Partial<SettingsState>;
        return {
          isHydrated: true,
          hideProviderGuidePopover: state.hideProviderGuidePopover ?? false,
          useUploadFilenameAsNodeTitle: state.useUploadFilenameAsNodeTitle ?? true,
          storyboardGenKeepStyleConsistent: state.storyboardGenKeepStyleConsistent ?? true,
          storyboardGenDisableTextInImage: state.storyboardGenDisableTextInImage ?? true,
          storyboardGenAutoInferEmptyFrame: state.storyboardGenAutoInferEmptyFrame ?? true,
          ignoreAtTagWhenCopyingAndGenerating:
            state.ignoreAtTagWhenCopyingAndGenerating ?? true,
          enableStoryboardGenGridPreviewShortcut:
            state.enableStoryboardGenGridPreviewShortcut ?? false,
          showStoryboardGenAdvancedRatioControls:
            state.showStoryboardGenAdvancedRatioControls ?? false,
          uiRadiusPreset: state.uiRadiusPreset ?? 'default',
          themeTonePreset: state.themeTonePreset ?? 'neutral',
          accentColor: normalizeHexColor(state.accentColor ?? DEFAULT_ACCENT_COLOR),
          canvasEdgeRoutingMode: normalizeCanvasEdgeRoutingMode(state.canvasEdgeRoutingMode),
        };
      },
    },
  )
);
