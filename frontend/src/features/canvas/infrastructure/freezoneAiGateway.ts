// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type {
  AiGateway,
  CanvasGenerationScope,
  GenerateImagePayload,
} from "../application/ports";
import {
  prepareCanvasImageSource,
  prepareCanvasImageSources,
  readEmbeddedCanvasGenerationOutputUrl,
  type CanvasImageGenerationCommand,
  type CanvasGenerationTaskRef,
} from "@/modules/creative_canvas/public";
import { freezoneGenerationTaskGateway } from "./freezoneGenerationTaskGateway";

interface ComposedCapabilityJob {
  readonly prompt: string;
  readonly referenceUrls: string[];
  readonly aspectRatio: string;
  readonly imageSize: string;
  readonly quality?: string;
}

interface PromptProjection {
  readonly cleanedPrompt: string;
  readonly suffix: string;
}

interface ReferenceRoleProjection extends PromptProjection {
  readonly references: string[];
}

export interface FreezoneAiGatewayDependencies {
  readonly composeCapability: (
    capabilityId: string,
    context: {
      inputUrls: string[];
      params: Record<string, unknown>;
      nodePrompt: string;
      metadata: Record<string, unknown> | null;
    },
  ) => ComposedCapabilityJob | null;
  readonly getCanvasMetadata: () => Record<string, unknown> | null;
  readonly resolveShotMetadataPrompt: (prompt: string) => PromptProjection;
  readonly resolvePromptReferenceRoles: (
    prompt: string,
    references: string[],
  ) => ReferenceRoleProjection;
  readonly submitImageGeneration: (
    projectId: string,
    command: CanvasImageGenerationCommand,
  ) => Promise<CanvasGenerationTaskRef>;
}

interface ImageEditSubmission {
  readonly prompt: string;
  readonly baseUrl: string;
  readonly extraReferenceUrls: string[];
  readonly aspectRatio: string;
  readonly imageSize: string;
  readonly model: string;
  readonly modelId?: string;
  readonly genMode?: string;
  readonly quality: string | null | undefined;
  readonly canvasId: string;
  readonly nodeId?: string;
}

interface JobRecord {
  readonly ref: CanvasGenerationTaskRef;
  readonly projectId: string;
  readonly promise: Promise<string>;
  status: "queued" | "running" | "succeeded" | "failed";
  result?: string;
  error?: string;
}

function readQuality(payload: GenerateImagePayload): string | null {
  const quality = payload.extraParams?.quality;
  return typeof quality === "string" ? quality : null;
}

function toAspectRatio(payload: GenerateImagePayload): string {
  return payload.aspectRatio || "1:1";
}

function toImageSize(payload: GenerateImagePayload): string {
  return (payload.size || "2K").toString();
}

async function submitImageEdit(
  projectId: string,
  submission: ImageEditSubmission,
): Promise<CanvasGenerationTaskRef> {
  const baseUrl = await prepareCanvasImageSource(projectId, submission.baseUrl);
  const extraReferenceUrls = await prepareCanvasImageSources(
    projectId,
    submission.extraReferenceUrls,
  );
  return await apiCall<CanvasGenerationTaskRef>(
    `projects/${encodeURIComponent(projectId)}/freezone/edit`,
    {
      method: "POST",
      json: {
        prompt: submission.prompt,
        base_url: baseUrl,
        extra_reference_urls: extraReferenceUrls,
        aspect_ratio: submission.aspectRatio ?? "2:3",
        image_size: submission.imageSize ?? "2K",
        model: submission.model,
        ...(submission.modelId ? { model_id: submission.modelId } : {}),
        ...(submission.genMode ? { gen_mode: submission.genMode } : {}),
        quality: submission.quality ?? null,
        ...(submission.canvasId ? { canvas_id: submission.canvasId } : {}),
        ...(submission.nodeId ? { node_id: submission.nodeId } : {}),
      },
    },
  );
}

async function submitJob(
  scope: CanvasGenerationScope,
  payload: GenerateImagePayload,
  dependencies: FreezoneAiGatewayDependencies,
): Promise<{ ref: CanvasGenerationTaskRef; projectId: string }> {
  const { projectId, canvasId } = scope;
  const capabilityJob = payload.capabilityId
    ? dependencies.composeCapability(payload.capabilityId, {
        inputUrls: payload.referenceImages ?? [],
        params: payload.capabilityParams ?? {},
        nodePrompt: payload.prompt,
        metadata: dependencies.getCanvasMetadata(),
      })
    : null;
  const effectivePrompt = capabilityJob?.prompt ?? payload.prompt;
  const effectiveRefs =
    capabilityJob?.referenceUrls ?? payload.referenceImages ?? [];
  const effectiveModel = payload.model.trim();
  if (!effectiveModel) {
    throw new Error("Image model is required");
  }
  const effectiveSize = payload.size || capabilityJob?.imageSize;
  const effectiveAspectRatio =
    payload.aspectRatio || capabilityJob?.aspectRatio;
  const quality = readQuality(payload) ?? capabilityJob?.quality;
  const { cleanedPrompt: afterShotClean, suffix: shotSuffix } =
    dependencies.resolveShotMetadataPrompt(effectivePrompt);
  const rawRefs = effectiveRefs.filter(Boolean);
  const {
    cleanedPrompt,
    references: refs,
    suffix: roleSuffix,
  } = dependencies.resolvePromptReferenceRoles(afterShotClean, rawRefs);
  const finalPrompt = `${cleanedPrompt}${shotSuffix}${roleSuffix}`;
  if (refs.length === 0) {
    const ref = await dependencies.submitImageGeneration(projectId, {
      prompt: finalPrompt,
      aspectRatio: effectiveAspectRatio || toAspectRatio(payload),
      imageSize: effectiveSize || toImageSize(payload),
      referenceUrls: [],
      model: effectiveModel,
      modelId: payload.modelId,
      genMode: payload.generationMode,
      quality,
      canvasId,
      nodeId: payload.nodeId,
    });
    return { ref, projectId };
  }

  const [base, ...extras] = refs;
  const ref = await submitImageEdit(projectId, {
    prompt: finalPrompt,
    baseUrl: base,
    extraReferenceUrls: extras,
    aspectRatio: effectiveAspectRatio || toAspectRatio(payload),
    imageSize: effectiveSize || toImageSize(payload),
    model: effectiveModel,
    modelId: payload.modelId,
    genMode: payload.generationMode,
    quality,
    canvasId,
    nodeId: payload.nodeId,
  });
  return { ref, projectId };
}

async function awaitJobAndFetchUrl(
  ref: CanvasGenerationTaskRef,
  projectId: string,
): Promise<string> {
  const completed = await freezoneGenerationTaskGateway.awaitCompletion(
    ref.task_key,
    projectId,
  );
  const directUrl = readEmbeddedCanvasGenerationOutputUrl(completed.result);
  if (directUrl) return directUrl;
  return await freezoneGenerationTaskGateway.fetchResultUrl(
    projectId,
    ref.task_type,
    ref.job_id,
  );
}

export function createFreezoneAiGateway(
  dependencies: FreezoneAiGatewayDependencies,
): AiGateway {
  const jobs = new Map<string, JobRecord>();

  return {
    async generateImage(scope, payload) {
      const { ref, projectId } = await submitJob(scope, payload, dependencies);
      return await awaitJobAndFetchUrl(ref, projectId);
    },

    async submitGenerateImageJob(scope, payload) {
      const { ref, projectId } = await submitJob(scope, payload, dependencies);
      const promise = awaitJobAndFetchUrl(ref, projectId)
        .then((url) => {
          const record = jobs.get(ref.job_id);
          if (record) {
            record.status = "succeeded";
            record.result = url;
          }
          return url;
        })
        .catch((error: Error) => {
          const record = jobs.get(ref.job_id);
          if (record) {
            record.status = "failed";
            record.error = error.message;
          }
          throw error;
        });
      jobs.set(ref.job_id, {
        ref,
        projectId,
        promise,
        status: "running",
      });
      return ref.job_id;
    },

    async getGenerateImageJob(jobId) {
      const record = jobs.get(jobId);
      if (!record) return { job_id: jobId, status: "not_found" };
      if (record.status === "succeeded") {
        return {
          job_id: jobId,
          status: "succeeded",
          result: record.result,
        };
      }
      if (record.status === "failed") {
        return { job_id: jobId, status: "failed", error: record.error };
      }
      return { job_id: jobId, status: record.status };
    },
  };
}
