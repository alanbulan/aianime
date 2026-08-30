// Copyright (c) 2026 AI anime

import { anthropicProviderStrategy } from "./anthropic.js";
import {
  aliyunModelStudioProviderStrategy,
  aliyunTokenPlanProviderStrategy,
} from "./aliyun-model-studio.js";
import { cartesiaProviderStrategy } from "./cartesia.js";
import { deepgramProviderStrategy } from "./deepgram.js";
import { elevenLabsProviderStrategy } from "./elevenlabs.js";
import { fishAudioProviderStrategy } from "./fish-audio.js";
import { geminiProviderStrategy } from "./gemini.js";
import { miniMaxAudioProviderStrategy } from "./minimax-audio.js";
import { openAiCompatibleProviderStrategy } from "./openai-compatible.js";
import { openAiNativeProviderStrategy } from "./openai-native.js";
import type { CommercialModelProviderStrategy } from "./types.js";

const OPENAI_COMPATIBLE_NATIVE_STRATEGIES: readonly CommercialModelProviderStrategy[] = [
  aliyunTokenPlanProviderStrategy,
  aliyunModelStudioProviderStrategy,
  fishAudioProviderStrategy,
  miniMaxAudioProviderStrategy,
  elevenLabsProviderStrategy,
  deepgramProviderStrategy,
  cartesiaProviderStrategy,
  openAiNativeProviderStrategy,
];

export function resolveProviderStrategy(
  protocol: string,
  baseUrl: string,
): CommercialModelProviderStrategy {
  const normalizedProtocol = protocol.trim().toUpperCase();
  if (normalizedProtocol === "ANTHROPIC") return anthropicProviderStrategy;
  if (normalizedProtocol === "GEMINI") return geminiProviderStrategy;
  if (normalizedProtocol !== "OPENAI_COMPATIBLE") {
    throw new Error(`不支持的 BYOK 供应商协议 ${protocol}`);
  }
  const url = new URL(baseUrl);
  return (
    OPENAI_COMPATIBLE_NATIVE_STRATEGIES.find((strategy) =>
      strategy.matches(url),
    ) ?? openAiCompatibleProviderStrategy
  );
}
