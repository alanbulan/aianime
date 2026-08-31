import { beforeEach, describe, expect, it, vi } from "vitest";

import { IdentityRequestError } from "@/modules/identity_access/application/errors";
import { httpIdentityGateway } from "@/modules/identity_access/infrastructure/http-identity-gateway";
import { resetRegionAbortController } from "@/lib/region-abort";

describe("httpIdentityGateway", () => {
  beforeEach(() => {
    resetRegionAbortController();
    vi.unstubAllGlobals();
  });

  it("sends account credentials to the local auth boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: { username: "alice", role: "owner" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      httpIdentityGateway.login("alice", "secret"),
    ).resolves.toMatchObject({
      username: "alice",
      role: "owner",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ username: "alice", password: "secret" }),
      }),
    );
  });

  it("uses the authorization-code contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: { username: "licensed", role: "owner" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await httpIdentityGateway.authorize("AUTH-001");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/authorize",
      expect.objectContaining({ body: JSON.stringify({ code: "AUTH-001" }) }),
    );
  });

  it("preserves an HTTP status when the error response has no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    const error = await httpIdentityGateway
      .getCurrentUser()
      .catch((reason) => reason);

    expect(error).toBeInstanceOf(IdentityRequestError);
    expect(error).toMatchObject({ status: 502 });
  });

  it("marks transport failures separately from authentication failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const error = await httpIdentityGateway
      .getCurrentUser()
      .catch((reason) => reason);

    expect(error).toBeInstanceOf(IdentityRequestError);
    expect(error).toMatchObject({ status: null, message: "offline" });
  });
});
