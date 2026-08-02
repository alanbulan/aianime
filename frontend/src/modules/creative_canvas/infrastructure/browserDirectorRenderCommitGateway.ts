// Copyright (c) 2026 AI anime
import { saveBeatDirectorControlFrame } from "@/features/viewer-kit/public";

import type { DirectorRenderCommitGateway } from "../application/directorRenderCommit";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function loadJsonRecord(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`读取导演元数据失败：${response.status}`);
  }
  const record = recordValue(await response.json());
  if (!record) {
    throw new Error("导演元数据格式无效");
  }
  return record;
}

async function loadPngDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`读取导演图层失败：${response.status}`);
  }
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result.startsWith("data:image/")) {
        resolve(result);
      } else if (result.startsWith("data:")) {
        const commaIndex = result.indexOf(",");
        resolve(commaIndex >= 0
          ? `data:image/png;base64,${result.slice(commaIndex + 1)}`
          : result);
      } else {
        reject(new Error("导演图层不是图片 data URL"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("读取导演图层失败"));
    reader.readAsDataURL(blob);
  });
}

export const browserDirectorRenderCommitGateway: DirectorRenderCommitGateway = {
  loadJsonRecord,
  loadPngDataUrl,
  async saveControlFrame(params) {
    const result = await saveBeatDirectorControlFrame(
      params.projectId,
      params.episode,
      params.beat,
      params.payload,
    );
    return {
      combinedPath: result.rel_paths.combined,
      combinedUrl: result.urls?.combined,
    };
  },
};
