import { afterEach, describe, expect, it, vi } from "vitest";

import { electronCommercialIdentityGateway } from "@/modules/identity_access/infrastructure/electron-commercial-identity-gateway";

describe("electron commercial identity gateway", () => {
  afterEach(() => {
    delete window.aiAnimeDesktop;
  });

  it("removes Electron IPC prefixes from service errors", async () => {
    window.aiAnimeDesktop = {
      commercial: {
        login: vi.fn(async () => {
          throw new Error(
            "Error invoking remote method 'desktop:commercial:login': CommercialApiError: 租户不存在或服务已到期",
          );
        }),
      },
    } as unknown as AIAnimeDesktopBridge;

    await expect(
      electronCommercialIdentityGateway.login({
        loginType: "PASSWORD",
        tenantCode: "tenant-test",
        username: "test-user",
        password: "TestSecret123",
      }),
    ).rejects.toThrow("租户不存在或服务已到期");
  });

  it("validates command responses and only allows logout to degrade locally", async () => {
    const sendSmsLoginCode = vi.fn(async () => ({
      success: true,
      message: "sent",
      retryAfter: 60,
    }));
    const logout = vi.fn(async () => ({
      remoteRevoked: false,
      success: false,
    }));
    window.aiAnimeDesktop = {
      commercial: { sendSmsLoginCode, logout },
    } as unknown as AIAnimeDesktopBridge;

    await expect(
      electronCommercialIdentityGateway.sendSmsLoginCode(
        "tenant-test",
        "13800000000",
      ),
    ).rejects.toThrow(/fields must be exactly/);
    await expect(electronCommercialIdentityGateway.logout()).resolves.toEqual({
      remoteRevoked: false,
      success: false,
    });

    sendSmsLoginCode.mockResolvedValueOnce({
      success: false,
      message: "delivery failed",
    } as never);
    await expect(
      electronCommercialIdentityGateway.sendSmsLoginCode(
        "tenant-test",
        "13800000000",
      ),
    ).rejects.toThrow(/success must be true/);
  });

  it("preserves the exact saved password when it is explicitly revealed", async () => {
    window.aiAnimeDesktop = {
      commercial: {
        revealRememberedPassword: vi.fn(async () => " Secret 123 "),
      },
    } as unknown as AIAnimeDesktopBridge;

    await expect(
      electronCommercialIdentityGateway.revealRememberedPassword(),
    ).resolves.toBe(" Secret 123 ");
  });
});
