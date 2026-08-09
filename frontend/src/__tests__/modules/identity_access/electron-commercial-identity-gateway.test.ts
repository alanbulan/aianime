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
        tenantCode: "tenant-test",
        username: "test-user",
        password: "TestSecret123",
      }),
    ).rejects.toThrow("租户不存在或服务已到期");
  });
});
