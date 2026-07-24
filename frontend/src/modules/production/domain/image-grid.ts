// Copyright (c) 2026 AI anime

export type ImageGridType = "render" | "sketch";

export interface GridUploadCommand {
  gridIndex: number;
  gridType: ImageGridType;
  modeKey: string;
  beatNumbers: number[];
}

export interface GridPromptQuery {
  gridIndex: number;
  gridType: ImageGridType;
  modeKey: string;
  beatNumbers: number[];
}

export interface GridSketchPreviewQuery {
  gridIndex: number;
  rows: number;
  cols: number;
  beatNumbers: number[];
}

export interface GridCutCommand extends GridSketchPreviewQuery {
  gridType: ImageGridType;
  modeKey?: string;
}

export interface GridUploadResult {
  gridIndex: number;
  gridType: ImageGridType;
  modeKey: string;
  beatNumbers: number[];
  gridPath: string;
  gridUrl: string;
}

export interface GridPromptResult {
  gridIndex: number;
  gridType: ImageGridType;
  modeKey: string;
  beatNumbers: number[];
  prompt: string;
  promptPath: string;
}

export interface GridSketchPreviewResult {
  gridIndex: number;
  rows: number;
  cols: number;
  beatNumbers: number[];
  previewPath: string;
  previewUrl: string;
}

export interface GridCutResult {
  gridIndex: number;
  added: number;
  skipped: number;
}
