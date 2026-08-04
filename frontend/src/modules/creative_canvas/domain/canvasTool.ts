// Copyright (c) 2026 AI anime
import type { NodeToolType } from './canvasNodeTool';
import type { CanvasNodeImageSourceLike } from './canvasNodeImageSource';
import type { StoryboardFrameItem } from './storyboard';

export type ToolOptionPrimitive = string | number | boolean;
export type ToolOptions = Record<string, ToolOptionPrimitive>;

export interface CanvasToolResult {
  outputImageUrl?: string;
  storyboardFrames?: StoryboardFrameItem[];
  rows?: number;
  cols?: number;
  frameAspectRatio?: string;
}

interface ToolFieldBase {
  key: string;
  label: string;
}

export interface ToolTextField extends ToolFieldBase {
  type: 'text';
  placeholder?: string;
}

export interface ToolNumberField extends ToolFieldBase {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface ToolSelectField extends ToolFieldBase {
  type: 'select';
  options: Array<{
    label: string;
    value: string;
  }>;
}

export interface ToolColorField extends ToolFieldBase {
  type: 'color';
}

export type ToolFieldSchema =
  | ToolTextField
  | ToolNumberField
  | ToolSelectField
  | ToolColorField;

export interface ToolExecutionContext {
  processTool: (
    toolType: NodeToolType,
    sourceImageUrl: string,
    options: Record<string, unknown>
  ) => Promise<CanvasToolResult>;
}

export type ToolIconKey = 'crop' | 'annotate' | 'split';
export type ToolEditorKind = 'form' | 'crop' | 'annotate' | 'split';

export interface CanvasToolPlugin {
  type: NodeToolType;
  labelKey: string;
  icon: ToolIconKey;
  editor: ToolEditorKind;
  supportsNode: (node: CanvasNodeImageSourceLike) => boolean;
  createInitialOptions: (node: CanvasNodeImageSourceLike) => ToolOptions;
  fields: ToolFieldSchema[];
  execute: (
    sourceImageUrl: string,
    options: ToolOptions,
    context: ToolExecutionContext
  ) => Promise<CanvasToolResult>;
}
