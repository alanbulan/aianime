// Copyright (c) 2026 AI anime

export interface SketchRegenQueueItem {
  id: string;
  modeKey: string;
  modeLabel: string;
  beatNumbers: number[];
  sceneIds: string[];
  createdAt: string;
  taskScope?: string;
}

export interface SketchRegenQueueData {
  items: SketchRegenQueueItem[];
}
