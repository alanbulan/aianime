// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import {
  requireCanvasGenerationTaskRef,
  type CanvasGenerationTaskRef,
} from "../application/completeCanvasMediaGenerationTask";
import type {
  CanvasImageJobGateway,
  CanvasImageJobPayload,
  CanvasImageJobScope,
} from "../application/canvasImageJob";
import type { CanvasImageGenerationCommand } from "../application/generateCanvasImage";
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
  readonly prepareImageSource: (
    projectId: string,
    rawUrl: string,
  ) => Promise<string>;
  readonly prepareImageSources: (
    projectId: string,
    rawUrls: readonly string[],
  ) => Promise<string[]>;
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
  readonly extraParams?: Record<string, unknown>;
  readonly canvasId: string;
  readonly nodeId?: string;
}

function readQuality(payload: CanvasImageJobPayload): string | null {
  const quality = payload.extraParams?.quality;
  return typeof quality === "string" ? quality : null;
}

function toAspectRatio(payload: CanvasImageJobPayload): string {
  return payload.aspectRatio || "1:1";
}

function toImageSize(payload: CanvasImageJobPayload): string {
  return (payload.size || "2K").toString();
}

async function submitImageEdit(
  projectId: string,
  submission: ImageEditSubmission,
  dependencies: Pick<
    FreezoneAiGatewayDependencies,
    "prepareImageSource" | "prepareImageSources"
  >,
): Promise<CanvasGenerationTaskRef> {
  const baseUrl = await dependencies.prepareImageSource(
    projectId,
    submission.baseUrl,
  );
  const extraReferenceUrls = await dependencies.prepareImageSources(
    projectId,
    submission.extraReferenceUrls,
  );
  return requireCanvasGenerationTaskRef(
    await apiCall<unknown>(
      `projects/${encodeURIComponent(projectId)}/freezone/edit`,
      {
        method: "POST",
        json: {
          prompt: submission.prompt,
          base_url: baseUrl,
          extra_reference_urls: extraReferenceUrls,
          aspect_ratio: submission.aspectRatio || "original",
          image_size: submission.imageSize || "original",
          model: submission.model,
          ...(submission.modelId ? { model_id: submission.modelId } : {}),
          ...(submission.genMode ? { gen_mode: submission.genMode } : {}),
          quality: submission.quality ?? null,
          ...(submission.extraParams
            && Object.keys(submission.extraParams).length > 0
            ? { extra_params: submission.extraParams }
            : {}),
          ...(submission.canvasId ? { canvas_id: submission.canvasId } : {}),
          ...(submission.nodeId ? { node_id: submission.nodeId } : {}),
        },
      },
    ),
    "freezone_edit",
  );
}

async function submitJob(
  scope: CanvasImageJobScope,
  payload: CanvasImageJobPayload,
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
    const ref = requireCanvasGenerationTaskRef(
      await dependencies.submitImageGeneration(projectId, {
        prompt: finalPrompt,
        aspectRatio: effectiveAspectRatio || toAspectRatio(payload),
        imageSize: effectiveSize || toImageSize(payload),
        referenceUrls: [],
        model: effectiveModel,
        modelId: payload.modelId,
        genMode: payload.generationMode,
        quality,
        extraParams: payload.extraParams,
        canvasId,
        nodeId: payload.nodeId,
      }),
      "freezone_gen",
    );
    return { ref, projectId };
  }

  const [base, ...extras] = refs;
  const ref = await submitImageEdit(
    projectId,
    {
      prompt: finalPrompt,
      baseUrl: base,
      extraReferenceUrls: extras,
      aspectRatio: effectiveAspectRatio || "original",
      imageSize: effectiveSize || "original",
      model: effectiveModel,
      modelId: payload.modelId,
      genMode: payload.generationMode,
      quality,
      extraParams: payload.extraParams,
      canvasId,
      nodeId: payload.nodeId,
    },
    dependencies,
  );
  return { ref, projectId };
}

export function createFreezoneAiGateway(
  dependencies: FreezoneAiGatewayDependencies,
): CanvasImageJobGateway {
  return {
    async submitGenerateImageJob(scope, payload) {
      const { ref } = await submitJob(scope, payload, dependencies);
      return ref;
    },
  };
}
