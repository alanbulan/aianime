import { describe, expect, it } from "vitest";

import {
  CommercialBridgeError,
  invokeCommercial,
} from "./commercial-bridge";

describe("invokeCommercial", () => {
  it("preserves structured gateway error metadata across Electron IPC", async () => {
    const payload = JSON.stringify({
      message: "请求过于频繁",
      status: 429,
      code: "RATE_LIMITED",
      requestId: "request-42",
    });

    const error = await invokeCommercial(() =>
      Promise.reject(
        new Error(
          `Error invoking remote method 'desktop:commercial:quota-balance': Error: AI_ANIME_COMMERCIAL_ERROR:${payload}`,
        ),
      ),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CommercialBridgeError);
    expect(error).toMatchObject({
      message: "请求过于频繁",
      status: 429,
      code: "RATE_LIMITED",
      requestId: "request-42",
    });
  });

  it("keeps the existing plain Electron error cleanup fallback", async () => {
    const error = await invokeCommercial(() =>
      Promise.reject(
        new Error(
          "Error invoking remote method 'desktop:commercial:status': Error: 普通错误",
        ),
      ),
    ).catch((caught: unknown) => caught);

    expect(error).toEqual(new Error("普通错误"));
  });
});
