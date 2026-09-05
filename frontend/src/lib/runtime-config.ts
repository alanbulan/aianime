// Copyright (c) 2026 AI anime
import { z } from "zod";

export const RuntimeConfigResponse = z.object({
  ok: z.literal(true),
  data: z.object({
    edition: z.enum(["ce", "ee"]),
    auth_required: z.boolean(),
    instance_id: z.string().optional(),
    project_sharing_enabled: z.boolean().optional(),
  }),
});

export interface RuntimeConfig {
  edition: "ce" | "ee";
  authRequired: boolean;
  instanceId?: string;
  projectSharingEnabled: boolean;
}

let runtimeConfig: RuntimeConfig = {
  edition: "ee",
  authRequired: true,
  projectSharingEnabled: false,
};

function fallbackRuntimeConfig(): RuntimeConfig {
  return import.meta.env.VITE_EDITION === "ce"
    ? { edition: "ce", authRequired: false, projectSharingEnabled: false }
    : { edition: "ee", authRequired: true, projectSharingEnabled: false };
}

export async function loadRuntimeConfig(): Promise<void> {
  try {
    const response = await fetch("/api/v1/config", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`GET /api/v1/config -> ${response.status}`);
    const body = await response.json();
    const parsed = RuntimeConfigResponse.parse(body);
    runtimeConfig = {
      edition: parsed.data.edition,
      authRequired: parsed.data.auth_required,
      instanceId: parsed.data.instance_id,
      projectSharingEnabled: parsed.data.project_sharing_enabled ?? false,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("[runtime-config] load failed:", error);
    runtimeConfig = fallbackRuntimeConfig();
  }
}

export function isCeRuntime(): boolean {
  return runtimeConfig.edition === "ce";
}

export function projectSharingEnabled(): boolean {
  return runtimeConfig.edition === "ee" && runtimeConfig.projectSharingEnabled;
}

export function authRequired(): boolean {
  return runtimeConfig.authRequired;
}
