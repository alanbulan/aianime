// Copyright (c) 2026 AI anime
import type { AddCanvasAssetLibraryItemCommand } from "./application/assetLibrary";
import { freezoneAssetLibraryGateway } from "./infrastructure/freezoneAssetLibraryGateway";

export function loadCanvasAssetLibrary(projectId: string) {
  return freezoneAssetLibraryGateway.list(projectId);
}

export function syncCanvasAssetLibraryFromMainline(projectId: string) {
  return freezoneAssetLibraryGateway.syncFromMainline(projectId);
}

export function addCanvasAssetLibraryItem(
  projectId: string,
  command: AddCanvasAssetLibraryItemCommand,
) {
  return freezoneAssetLibraryGateway.addUploadedItem(projectId, command);
}

export function deleteCanvasAssetLibraryItem(
  projectId: string,
  itemId: string,
) {
  return freezoneAssetLibraryGateway.deleteItem(projectId, itemId);
}
