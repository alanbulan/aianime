import type { CommercialModelCapabilitySnapshot } from "./commercial-contracts.js";

// Quotes and budgets belong to the Electron proxy, not the Python execution
// router. Adding a public billing field must not change the sidecar contract.
type ExecutionCapability = Omit<CommercialModelCapabilitySnapshot,
  "billingVersion" | "quoteRequired" | "minimumClientVersion" | "pricingAvailable">;

const executionFields = {
  modelId: true, extraParameterNames: true, audioResponseFormats: true,
  audioDefaultResponseFormat: true, audioSupportsEmotionPrompt: true,
  imagePromptProfile: true, imageRatioOptions: true, imageSizeOptions: true,
  videoWorkflow: true, videoRatioOptions: true, videoResolutionOptions: true,
  videoSizeOptions: true, videoResolutionMaxSeconds: true,
  videoSupportsGenerateAudio: true, videoSupportsHumanReview: true,
  videoDialogueOnly: true, videoExtraParameterNames: true,
  videoSceneOptimizeOptions: true, videoGenerationMinSeconds: true,
  videoGenerationMaxSeconds: true, videoDurationOptions: true,
  maxReferenceImages: true, maxReferenceVideos: true, maxReferenceAudios: true,
  maxReferenceTotal: true, referenceAudioMinSeconds: true,
  referenceAudioMaxSeconds: true, referenceAudioTotalMinSeconds: true,
  referenceAudioTotalMaxSeconds: true, referenceVideoMinSeconds: true,
  referenceVideoMaxSeconds: true, referenceVideoTotalMinSeconds: true,
  referenceVideoTotalMaxSeconds: true,
} satisfies Record<keyof ExecutionCapability, true>;

export function sidecarModelCapability(item: CommercialModelCapabilitySnapshot): ExecutionCapability {
  return Object.fromEntries((Object.keys(executionFields) as (keyof ExecutionCapability)[])
    .filter((key) => item[key] !== undefined)
    .map((key) => [key, structuredClone(item[key])])) as unknown as ExecutionCapability;
}

/** Report only schema paths, never rejected input values, tokens or raw bodies. */
export async function sidecarCapabilityError(response: Response): Promise<Error> {
  let fields: string[] = [];
  if (response.status === 422) {
    try {
      const text = await response.text();
      const detail: unknown = text.length <= 32_768 ? JSON.parse(text).detail : null;
      if (Array.isArray(detail)) fields = detail.slice(0, 5).flatMap((entry) => {
        if (!entry || !Array.isArray(entry.loc)) return [];
        const parts = entry.loc.filter((part: unknown) =>
          typeof part === "number" && Number.isSafeInteger(part) && part >= 0 ||
          typeof part === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(part));
        return parts.length ? [parts.slice(0, 8).join(".")] : [];
      });
    } catch { /* A malformed error response cannot replace the safe diagnostic. */ }
  }
  return new Error(response.status === 422
    ? `本地模型能力契约不匹配（HTTP 422${fields.length ? `；字段：${fields.join("、")}` : ""}），请更新完整客户端，勿仅替换前端或后端文件。`
    : `本地模型能力同步失败（HTTP ${response.status}），请重试。`);
}
