// Copyright (c) 2026 AI anime

/** The two image roles exposed by the authenticated commercial catalog. */
export type CanvasImageMode = "generation" | "edit";

export interface CanvasImageModeCapability {
  readonly imageModes?: ReadonlyArray<CanvasImageMode>;
}

export interface CanvasImageParameterCapability {
  readonly parameterSchema?: Readonly<Record<string, unknown>>;
}

export function supportsCanvasImageMode(
  model: CanvasImageModeCapability,
  mode: CanvasImageMode,
): boolean {
  const declaredModes = model.imageModes;
  return !declaredModes?.length || declaredModes.includes(mode);
}

export function filterCanvasImageModels<
  T extends CanvasImageModeCapability,
>(models: readonly T[], mode: CanvasImageMode): T[] {
  return models.filter((model) => supportsCanvasImageMode(model, mode));
}

export function supportsCanvasImageParameter(
  model: CanvasImageParameterCapability | null | undefined,
  parameter: string,
): boolean {
  return Boolean(
    model?.parameterSchema &&
      Object.prototype.hasOwnProperty.call(model.parameterSchema, parameter),
  );
}
