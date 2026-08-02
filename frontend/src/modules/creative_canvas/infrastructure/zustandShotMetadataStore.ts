// Copyright (c) 2026 AI anime
import { create } from "zustand";

import type { ShotMetadataStateGateway } from "../application/shotMetadataState";
import {
  EMPTY_SHOT_METADATA,
  hasActiveShotMetadata,
  type ShotMetadata,
} from "../domain/shotMetadata";

interface ShotMetadataState {
  shot: ShotMetadata;
  isActive: boolean;
  setShot(shot: ShotMetadata): void;
  clearShot(): void;
  hydrate(shot: ShotMetadata): void;
}

const useShotMetadataStore = create<ShotMetadataState>((set) => ({
  shot: EMPTY_SHOT_METADATA,
  isActive: false,
  setShot: (shot) => set({ shot, isActive: hasActiveShotMetadata(shot) }),
  clearShot: () => set({ shot: EMPTY_SHOT_METADATA, isActive: false }),
  hydrate: (shot) => set({ shot, isActive: hasActiveShotMetadata(shot) }),
}));

export const zustandShotMetadataStateGateway: ShotMetadataStateGateway = {
  getShot: () => useShotMetadataStore.getState().shot,
  setShot: (shot) => useShotMetadataStore.getState().setShot(shot),
  clearShot: () => useShotMetadataStore.getState().clearShot(),
  hydrate: (shot) => useShotMetadataStore.getState().hydrate(shot),
  subscribe: (listener) => useShotMetadataStore.subscribe(listener),
};
