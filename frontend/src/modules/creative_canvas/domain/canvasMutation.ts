// Copyright (c) 2026 AI anime

export const CANVAS_MUTATION_SOURCES = [
  'user_edit',
  'delete_to_empty',
  'manual_clear',
] as const;

/**
 * Client-only reason for the latest graph mutation. `delete_to_empty` and
 * `manual_clear` let the save policy distinguish intentional empty canvases
 * from an accidental store reset.
 */
export type CanvasMutationSource = (typeof CANVAS_MUTATION_SOURCES)[number];

export interface CanvasMutationState {
  /** User-driven mutations since the latest hydrate or canvas switch. */
  userEditsSinceHydrate: number;
  /** Null until the user changes hydrated content. */
  lastMutationSource: CanvasMutationSource | null;
  /** One-shot permission for the next save to overwrite remote content with an empty canvas. */
  pendingClearIntent: boolean;
}

export function isCanvasMutationSource(value: unknown): value is CanvasMutationSource {
  return CANVAS_MUTATION_SOURCES.some((source) => source === value);
}

export function isCanvasMutationState(value: unknown): value is CanvasMutationState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const mutation = value as Partial<CanvasMutationState>;
  return (
    typeof mutation.userEditsSinceHydrate === 'number'
    && (mutation.lastMutationSource === null
      || isCanvasMutationSource(mutation.lastMutationSource))
    && typeof mutation.pendingClearIntent === 'boolean'
  );
}

export function trackEdit(
  state: Pick<CanvasMutationState, 'userEditsSinceHydrate'>,
  source: CanvasMutationSource = 'user_edit',
): Pick<CanvasMutationState, 'userEditsSinceHydrate' | 'lastMutationSource'> {
  return {
    userEditsSinceHydrate: state.userEditsSinceHydrate + 1,
    lastMutationSource: source,
  };
}

export function isDeleteToEmpty(
  previousNodeCount: number,
  nextNodeCount: number,
): boolean {
  return previousNodeCount > 0 && nextNodeCount === 0;
}
