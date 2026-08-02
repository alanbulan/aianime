// Copyright (c) 2026 AI anime
import type { ShotMetadata } from "../domain/shotMetadata";

export interface ShotMetadataStateGateway {
  getShot(): ShotMetadata;
  setShot(shot: ShotMetadata): void;
  clearShot(): void;
  hydrate(shot: ShotMetadata): void;
  subscribe(listener: () => void): () => void;
}
