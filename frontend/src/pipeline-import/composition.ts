// Copyright (c) 2026 AI anime
import {
  analyzePipelineVideoFrames as analyzePipelineVideoFramesUseCase,
  extractPipelineVideoFrames as extractPipelineVideoFramesUseCase,
  type AnalyzePipelineVideoFramesParams,
  type ExtractPipelineVideoFramesParams,
} from "./application/video-processing";
import { freezonePipelineVideoProcessingGateway } from "./infrastructure/freezone-video-processing-gateway";

export function extractPipelineVideoFrames(
  params: ExtractPipelineVideoFramesParams,
): Promise<string[]> {
  return extractPipelineVideoFramesUseCase(params, {
    gateway: freezonePipelineVideoProcessingGateway,
  });
}

export function analyzePipelineVideoFrames(
  params: AnalyzePipelineVideoFramesParams,
) {
  return analyzePipelineVideoFramesUseCase(params, {
    gateway: freezonePipelineVideoProcessingGateway,
  });
}
