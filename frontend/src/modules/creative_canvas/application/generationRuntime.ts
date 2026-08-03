// Copyright (c) 2026 AI anime

export interface GenerationRuntimeDiagnostics {
  appVersion: string;
  osName: string;
  osVersion: string;
  osBuild: string;
  userAgent: string;
}

export interface GenerationRuntimeGateway {
  runtimeSessionId: string;
  getRuntimeDiagnostics: () => Promise<GenerationRuntimeDiagnostics>;
}
