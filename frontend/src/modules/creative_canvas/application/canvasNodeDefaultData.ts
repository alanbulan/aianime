// Copyright (c) 2026 AI anime
export interface CanvasNodeDefaultDataCatalog {
  getDefinition(type: unknown): { createDefaultData(): Record<string, unknown> };
}

export interface CanvasNodeDefaultDataGateway {
  getOverrides(type: unknown): Record<string, unknown> | undefined;
}

export function createCanvasNodeDefaultData<D extends Record<string, unknown>>(
  type: string,
  nodeCatalog: CanvasNodeDefaultDataCatalog,
  nodeDefaultDataGateway?: CanvasNodeDefaultDataGateway,
): D {
  return {
    ...nodeCatalog.getDefinition(type).createDefaultData(),
    ...nodeDefaultDataGateway?.getOverrides(type),
  } as D;
}
