// Copyright (c) 2026 AI anime
export interface PipelineShotAnalysis {
  readonly shot_type?: string;
  readonly angle?: string;
  readonly camera_movement?: string;
  readonly subject_action?: string;
  readonly mood?: string;
  readonly color_tone?: string;
  readonly suggested_prompt?: string;
}

export interface ExtractPipelineVideoFramesParams {
  readonly projectId: string;
  readonly videoUrl: string;
  readonly maxFrames: number;
  readonly sceneThreshold: number;
}

export interface AnalyzePipelineVideoFramesParams {
  readonly projectId: string;
  readonly frameUrls: readonly string[];
}

export interface PipelineVideoProcessingGateway {
  extractFrames(
    params: ExtractPipelineVideoFramesParams,
  ): Promise<string[]>;
  analyzeFrames(
    params: AnalyzePipelineVideoFramesParams,
  ): Promise<PipelineShotAnalysis[]>;
}

export interface PipelineVideoProcessingDependencies {
  readonly gateway: PipelineVideoProcessingGateway;
}

export async function extractPipelineVideoFrames(
  params: ExtractPipelineVideoFramesParams,
  dependencies: PipelineVideoProcessingDependencies,
): Promise<string[]> {
  return await dependencies.gateway.extractFrames(params);
}

export async function analyzePipelineVideoFrames(
  params: AnalyzePipelineVideoFramesParams,
  dependencies: PipelineVideoProcessingDependencies,
): Promise<PipelineShotAnalysis[]> {
  return await dependencies.gateway.analyzeFrames(params);
}
