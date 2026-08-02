// Copyright (c) 2026 AI anime
import { MaskEditorView } from "./MaskEditorView";
import {
  useMaskEditorController,
  type MaskEditorControllerDependencies,
} from "./useMaskEditorController";

export interface MaskEditorProps {
  project: string;
  baseUrl: string;
  baseLabel?: string;
  onClose(): void;
  onResult(url: string): void;
  dependencies: MaskEditorControllerDependencies;
}

export function MaskEditor({
  project,
  baseUrl,
  baseLabel,
  onClose,
  onResult,
  dependencies,
}: MaskEditorProps) {
  const controller = useMaskEditorController(
    { project, baseUrl, onClose, onResult },
    dependencies,
  );
  return (
    <MaskEditorView
      baseUrl={baseUrl}
      baseLabel={baseLabel}
      onClose={onClose}
      controller={controller}
    />
  );
}
