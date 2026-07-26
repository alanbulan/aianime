// Copyright (c) 2026 AI anime
import type {
  CanvasAssetLibraryItem,
  CanvasAssetLibraryMedia,
} from "../domain/assetLibrary";

export interface AddCanvasAssetLibraryItemCommand {
  readonly name: string;
  readonly media: CanvasAssetLibraryMedia;
  readonly url: string;
}

export interface CanvasAssetLibraryGateway {
  list(projectId: string): Promise<CanvasAssetLibraryItem[]>;
  syncFromMainline(projectId: string): Promise<CanvasAssetLibraryItem[]>;
  addUploadedItem(
    projectId: string,
    command: AddCanvasAssetLibraryItemCommand,
  ): Promise<void>;
  deleteItem(projectId: string, itemId: string): Promise<void>;
}
