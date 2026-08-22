// Copyright (c) 2026 AI anime

export type VoiceConfigurationTarget = "characters" | "voices";

export interface AudioRegenerationError {
  message: string;
  target: VoiceConfigurationTarget | null;
}

export function resolveAudioRegenerationError(
  error: string,
): AudioRegenerationError {
  const message = String(error || "").trim();
  if (message.includes("角色声线缺失")) {
    return {
      message: `${message}。请到「角色」中上传默认或对应年龄段声线。`,
      target: "characters",
    };
  }
  if (!message.includes("解说声线缺失")) {
    return { message, target: null };
  }
  if (message.includes("解说主角") || message.includes("角色工作台")) {
    return {
      message: `${message}。请到「角色」中上传解说主角声线。`,
      target: "characters",
    };
  }
  return {
    message: `${message}。请到「资产 > 声线」上传或裁剪默认解说声线。`,
    target: "voices",
  };
}
