// Copyright (c) 2026 AI anime
// AI anime API envelope client. It reuses the shared transport so timeout,
// cancellation, session handling and backend error normalization stay unique.

import { HTTPError, type Options, type RetryOptions } from "ky";

import { ApiError } from "@/shared/api/errors";
import { api } from "@/shared/api/transport";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const API_V1_PREFIX = "/api/v1";
const API_RETRY: RetryOptions = {
  limit: 2,
  methods: ["get", "put", "delete"],
  backoffLimit: 3_000,
};

export function apiRequest(path: string, options?: Options) {
  return api(path, {
    prefix: API_V1_PREFIX,
    retry: API_RETRY,
    ...options,
  });
}

/**
 * Unwrap the canonical AI anime `{ ok, data, error }` envelope.
 * Throws ApiError on non-ok responses.
 */
export async function apiCall<T>(
  path: string,
  options?: Options,
): Promise<T> {
  try {
    const response = await apiRequest(path, options).json<ApiEnvelope<T>>();
    if (!response.ok) {
      throw new ApiError(
        response.error ?? "API returned ok=false",
        200,
        response,
      );
    }
    if (response.data === undefined) {
      // Some endpoints return `{ ok: true }` with no data. Caller decides.
      return undefined as T;
    }
    return response.data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof HTTPError) {
      const cause = (err as HTTPError & { cause?: unknown }).cause;
      if (cause instanceof Error) throw cause;
      throw new ApiError(err.message, err.response.status);
    }
    throw err;
  }
}
