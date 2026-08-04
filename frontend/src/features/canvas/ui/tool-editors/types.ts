// Copyright (c) 2026 AI anime
import type {
  CanvasToolPlugin,
  ToolFieldSchema,
  ToolOptions,
} from '@/modules/creative_canvas/public';

export interface ToolEditorBaseProps {
  plugin: CanvasToolPlugin;
  options: ToolOptions;
  onOptionsChange: (next: ToolOptions) => void;
}

export interface VisualToolEditorProps extends ToolEditorBaseProps {
  sourceImageUrl: string;
}

export interface FormToolEditorProps extends ToolEditorBaseProps {
  fields: ToolFieldSchema[];
}
