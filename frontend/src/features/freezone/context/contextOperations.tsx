// Copyright (c) 2026 AI anime
import type { ContextMatch } from "./contextMatching";
import {
  matchForBeatToSketch,
  matchForDirectorCombinedToSketch,
  matchForFrameGeneration,
  matchForSelectedBackgroundToSketch,
} from "./contextMatching";
import {
  compileBeatToSketchPrompt,
  compileDirectorCombinedToSketchPrompt,
  compileFrameGenerationContextPrompt,
  compileSelectedBackgroundToSketchPrompt,
} from "./contextPromptCompiler";
import type { MainlineContext } from "./mainlineContext";

export interface ContextOperation {
  id: string;
  label: string;
  outputKind: "sketch" | "frame" | "video" | "audio";
  match: (contexts: MainlineContext[]) => ContextMatch;
  compilePrompt: (match: ContextMatch) => string;
}

export interface MatchedContextOperation {
  operation: ContextOperation;
  match: ContextMatch;
}

export const CONTEXT_OPERATIONS: ContextOperation[] = [
  {
    id: "beat_to_sketch",
    label: "Beat 生成草图",
    outputKind: "sketch",
    match: matchForBeatToSketch,
    compilePrompt: compileBeatToSketchPrompt,
  },
  {
    id: "director_combined_to_sketch",
    label: "导演合成图生成草图",
    outputKind: "sketch",
    match: matchForDirectorCombinedToSketch,
    compilePrompt: compileDirectorCombinedToSketchPrompt,
  },
  {
    id: "selected_background_to_sketch",
    label: "背景锚点生成草图",
    outputKind: "sketch",
    match: matchForSelectedBackgroundToSketch,
    compilePrompt: compileSelectedBackgroundToSketchPrompt,
  },
  {
    id: "sketch_to_frame",
    label: "按主线上下文生成分镜",
    outputKind: "frame",
    match: matchForFrameGeneration,
    compilePrompt: compileFrameGenerationContextPrompt,
  },
];

export function resolveMatchedContextOperations(
  contexts: MainlineContext[],
): MatchedContextOperation[] {
  return CONTEXT_OPERATIONS
    .map((operation) => ({
      operation,
      match: operation.match(contexts),
    }))
    .filter((item) => item.match.matched);
}

export function ContextOperationsPanel({
  operations,
  onRun,
}: {
  operations: MatchedContextOperation[];
  onRun: (item: MatchedContextOperation) => void;
}) {
  if (operations.length === 0) return null;

  return (
    <div className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-amber-800 dark:text-amber-200">主线上下文</div>
        <div className="text-[10px] text-amber-700 dark:text-amber-300">只在身份/场景/Beat 匹配时出现</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {operations.map((item) => (
          <button
            key={item.operation.id}
            type="button"
            className="nodrag min-w-[180px] max-w-full rounded-lg border border-amber-500/35 bg-card px-3 py-2 text-left transition hover:bg-amber-500/15"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRun(item);
            }}
            title={item.match.reason}
          >
            <div className="text-xs font-medium text-amber-800 dark:text-amber-100">{item.operation.label}</div>
            <div className="mt-0.5 truncate text-[10px] text-amber-700 dark:text-amber-300">
              {item.match.reason}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
