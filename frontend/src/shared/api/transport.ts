// Copyright (c) 2026 AI anime
import ky, { HTTPError } from "ky";

import { apiErrorFromHttpError } from "@/shared/api/errors";

interface ApiRuntime {
  getRegionAbortSignal: () => AbortSignal;
  onMissingRegion: () => void | Promise<void>;
  onUnauthorized: () => void | Promise<void>;
}

let runtime: ApiRuntime | null = null;

export function configureApiRuntime(nextRuntime: ApiRuntime): void {
  runtime = nextRuntime;
}

// Why `credentials: "include"`? The SPA authenticates via an HttpOnly cookie
// (`ai_anime_session`) set by `POST /api/v1/auth/login`. The browser will only
// attach that cookie to same-origin fetches automatically; we set it
// explicitly so it also flows through the Vite dev proxy and the production
// edge reverse-proxy with no surprises. Business APIs no longer accept
// long-lived API keys; browser traffic is cookie-backed.
export const api = ky.create({
  prefix: "/",
  credentials: "include",
  // Default request timeout. Long-running operations (AI detection, identity
  // planning, image generation) override this per-request with a larger value.
  timeout: 30_000,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const regionSignal = runtime?.getRegionAbortSignal();
        if (!regionSignal) return;

        const callerSignal = request.signal;
        const signals: AbortSignal[] = [regionSignal];
        if (callerSignal) signals.push(callerSignal);

        let combined: AbortSignal;
        if (typeof (AbortSignal as unknown as { any?: unknown }).any === "function") {
          combined = (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any(
            signals,
          );
        } else {
          combined = callerSignal ?? regionSignal;
        }
        return new Request(request, { signal: combined });
      },
    ],
    afterResponse: [
      async ({ response }) => {
        if (response.status === 400) {
          // Edge dispatcher returns 400 { ok: false, error: "no_region" } when the
          // server-region cookie is missing or points at a decommissioned region.
          // Clear the region cookie + store and hard-redirect to /login so the
          // user can pick a live region again. Generic 400s (validation, etc.)
          // must remain transparent — we only act on error=no_region.
          const body = await response
            .clone()
            .json()
            .catch(() => null);
          if (
            body &&
            typeof body === "object" &&
            (body as { error?: unknown }).error === "no_region"
          ) {
            await runtime?.onMissingRegion();
            return;
          }
          return;
        }
        if (response.status === 401) {
          await runtime?.onUnauthorized();
        }
      },
    ],
    beforeError: [
      async ({ error }) => {
        if (!(error instanceof HTTPError)) return error;
        (error as HTTPError & { cause?: unknown }).cause = await apiErrorFromHttpError(error);
        return error;
      },
    ],
  },
});

// Multipart uploads are bounded by their caller/region AbortSignal rather than
// by elapsed time: body upload duration depends on the user's upstream speed.
export const uploadApi = api.extend({ timeout: false });
