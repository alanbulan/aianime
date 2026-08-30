// Copyright (c) 2026 AI anime
import type { CanvasGenerationTaskRef } from "./completeCanvasMediaGenerationTask";
import type { VideoSceneOptimize } from "../domain/videoGenerationModel";
import type {
  VideoGenMode,
} from "../domain/videoGenerationMode";

export type VideoGenerationAspectRatio = string;

export interface VideoGenerationOutput {
  readonly parameter: "resolution" | "size";
  readonly value: string;
}

export interface VideoGenerationTaskRef extends CanvasGenerationTaskRef {
  readonly task_type: "freezone_video_gen";
}

export interface VideoGenerationReference {
  readonly type: "image" | "video" | "audio";
  readonly url: string;
  readonly role?: string;
  readonly label?: string;
}

interface VideoGenerationParamsBase {
  readonly projectId: string;
  readonly prompt: string;
  readonly cameraTemplateId: string | null;
  readonly aspectRatio: VideoGenerationAspectRatio;
  readonly output: VideoGenerationOutput;
  readonly extraParams?: Record<string, unknown>;
  readonly durationSeconds: number;
  readonly generateAudio: boolean;
  readonly model: string;
  readonly modelSelector?: string;
  readonly canvasId: string;
  readonly nodeId: string;
}

interface ReviewedVideoGenerationParams {
  readonly humanReview: boolean;
  readonly sceneOptimize: VideoSceneOptimize | null;
}

export type SubmitVideoGenerationParams = VideoGenerationParamsBase &
  (
    | ({
        readonly kind: "text";
        readonly genMode: "textToVideo";
      } & ReviewedVideoGenerationParams)
    | ({
        readonly kind: "keyframes";
        readonly genMode: "firstFrame" | "firstLastFrame";
        readonly firstFrameUrl: string | null;
        readonly lastFrameUrl: string | null;
      } & ReviewedVideoGenerationParams)
    | ({
        readonly kind: "imageReferences";
        readonly genMode: "imageToVideo" | "imageReference";
        readonly imageUrls: ReadonlyArray<string>;
      } & ReviewedVideoGenerationParams)
    | {
        readonly kind: "videoEdit";
        readonly genMode: "videoEdit";
        readonly videoUrl: string;
        readonly imageUrls: ReadonlyArray<string>;
      }
    | ({
        readonly kind: "allReferences";
        readonly genMode: "allReference";
        readonly references: ReadonlyArray<VideoGenerationReference>;
      } & ReviewedVideoGenerationParams)
  );

interface VideoGenerationSubmissionBase {
  readonly prompt: string;
  readonly cameraTemplateId: string | null;
  readonly aspectRatio: VideoGenerationAspectRatio;
  readonly output: VideoGenerationOutput;
  readonly extraParams: Record<string, unknown>;
  readonly durationSeconds: number;
  readonly generateAudio: boolean;
  readonly model: string;
  readonly modelSelector?: string;
  readonly genMode: VideoGenMode;
  readonly canvasId: string;
  readonly nodeId: string;
}

export type VideoGenerationSubmission = VideoGenerationSubmissionBase &
  (
    | ({ readonly kind: "text" } & ReviewedVideoGenerationParams)
    | ({
        readonly kind: "keyframes";
        readonly firstFrameUrl: string | null;
        readonly lastFrameUrl: string | null;
      } & ReviewedVideoGenerationParams)
    | ({
        readonly kind: "imageReferences";
        readonly imageUrls: ReadonlyArray<string>;
      } & ReviewedVideoGenerationParams)
    | {
        readonly kind: "videoEdit";
        readonly videoUrl: string;
        readonly imageUrls: ReadonlyArray<string>;
      }
    | ({
        readonly kind: "allReferences";
        readonly references: ReadonlyArray<VideoGenerationReference>;
      } & ReviewedVideoGenerationParams)
  );

export interface VideoGenerationSubmissionGateway {
  submit(
    projectId: string,
    submission: VideoGenerationSubmission,
  ): Promise<VideoGenerationTaskRef>;
}

export interface SubmitVideoGenerationDependencies {
  readonly submissionGateway: VideoGenerationSubmissionGateway;
}

function commonSubmission(
  params: SubmitVideoGenerationParams,
): VideoGenerationSubmissionBase {
  return {
    prompt: params.prompt,
    cameraTemplateId: params.cameraTemplateId,
    aspectRatio: params.aspectRatio,
    output: params.output,
    extraParams: params.extraParams ?? {},
    durationSeconds: params.durationSeconds,
    generateAudio: params.generateAudio,
    model: params.model,
    modelSelector: params.modelSelector,
    genMode: params.genMode,
    canvasId: params.canvasId,
    nodeId: params.nodeId,
  };
}

export async function submitVideoGeneration(
  params: SubmitVideoGenerationParams,
  dependencies: SubmitVideoGenerationDependencies,
): Promise<VideoGenerationTaskRef> {
  const common = commonSubmission(params);
  switch (params.kind) {
    case "text":
      return await dependencies.submissionGateway.submit(params.projectId, {
        ...common,
        kind: params.kind,
        humanReview: params.humanReview,
        sceneOptimize: params.sceneOptimize,
      });
    case "keyframes":
      return await dependencies.submissionGateway.submit(params.projectId, {
        ...common,
        kind: params.kind,
        firstFrameUrl: params.firstFrameUrl,
        lastFrameUrl: params.lastFrameUrl,
        humanReview: params.humanReview,
        sceneOptimize: params.sceneOptimize,
      });
    case "imageReferences":
      return await dependencies.submissionGateway.submit(params.projectId, {
        ...common,
        kind: params.kind,
        imageUrls: params.imageUrls,
        humanReview: params.humanReview,
        sceneOptimize: params.sceneOptimize,
      });
    case "videoEdit":
      return await dependencies.submissionGateway.submit(params.projectId, {
        ...common,
        kind: params.kind,
        videoUrl: params.videoUrl,
        imageUrls: params.imageUrls,
      });
    case "allReferences":
      return await dependencies.submissionGateway.submit(params.projectId, {
        ...common,
        kind: params.kind,
        references: params.references,
        humanReview: params.humanReview,
        sceneOptimize: params.sceneOptimize,
      });
  }
}
