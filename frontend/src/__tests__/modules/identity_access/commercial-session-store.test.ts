import { describe, expect, it, vi } from "vitest";

import type {
  CommercialIdentityGateway,
  CommercialTenantPreference,
} from "@/modules/identity_access/application/commercial-session-ports";
import { createCommercialAuthStore } from "@/modules/identity_access/application/commercial-session-store";
import type {
  CommercialPublicConfig,
  CommercialSession,
  CommercialUserProfile,
} from "@/modules/identity_access/domain/commercial-session";

const session: CommercialSession = {
  authenticated: true,
  expiresAtEpochMs: 10_000,
  user: {
    id: 1001,
    username: "client_user",
    nickname: "客户端用户",
    email: "client@example.com",
    avatar: "",
  },
  tenant: { id: 11, code: "customer-a", name: "客户 A", isSystem: false },
};

const publicConfig: CommercialPublicConfig = {
  brand: { siteName: "Enlectron", siteDescription: "Desktop studio" },
  login: {
    captchaEnabled: false,
    rememberMe: true,
    smsLoginEnabled: false,
  },
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: false,
    requireLowercase: false,
    requireNumber: false,
    requireSpecial: false,
  },
};

const profile: CommercialUserProfile = {
  id: 1001,
  username: "client_user",
  nickname: "客户端用户",
  email: "client@example.com",
  phone: "13800000000",
  gender: 0,
  avatar: "",
  status: 1,
  deptId: 0,
  deptName: "",
  profileDescription: "分镜创作者",
};

function createPreference(initial = "") {
  let value = initial;
  const preference: CommercialTenantPreference = {
    read: () => value,
    write: vi.fn((next) => {
      value = next;
    }),
  };
  return preference;
}

function createGateway(
  overrides: Partial<CommercialIdentityGateway> = {},
): CommercialIdentityGateway {
  return {
    status: vi.fn(async () => ({
      configured: true,
      gatewayOrigin: "http://203.0.113.10:8889",
    })),
    fetchPublicConfig: vi.fn(async () => publicConfig),
    fetchCaptcha: vi.fn(async () => ({
      key: "captcha-key",
      imageDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
    })),
    restoreSession: vi.fn(async () => null),
    rememberedLogin: vi.fn(async () => null),
    revealRememberedPassword: vi.fn(async () => "secret"),
    login: vi.fn(async () => session),
    loginRemembered: vi.fn(async () => session),
    logout: vi.fn(async () => ({ remoteRevoked: true, success: true })),
    fetchProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async (input) => ({ ...profile, ...input })),
    fetchAvatar: vi.fn(async () => ({
      contentType: "image/png",
      dataUrl: "data:image/png;base64,AA==",
    })),
    uploadAvatar: vi.fn(async () => ({
      profile: { ...profile, avatar: "/api/v1/user/avatar" },
      avatar: {
        contentType: "image/png",
        dataUrl: "data:image/png;base64,AA==",
      },
    })),
    deleteAvatar: vi.fn(async () => ({ profile: { ...profile, avatar: "" } })),
    changePassword: vi.fn(async () => ({
      success: true,
      sessionsRevoked: true,
      tokenReissued: false,
    })),
    sendSmsLoginCode: vi.fn(async () => ({ success: true, message: "sent" })),
    sendPasswordResetCode: vi.fn(async () => ({ success: true, message: "sent" })),
    verifyPasswordResetCode: vi.fn(async () => ({
      resetTicket: "reset-ticket",
      expiresIn: 600,
    })),
    resetPassword: vi.fn(async () => ({
      success: true,
      message: "reset",
      sessionsRevoked: true,
      tokenReissued: false,
    })),
    ...overrides,
  };
}

describe("commercial auth store", () => {
  it("keeps browser-only runtime unconfigured", async () => {
    const store = createCommercialAuthStore(
      createGateway({
        status: vi.fn(async () => ({ configured: false, gatewayOrigin: "" })),
      }),
      createPreference(),
    );

    await store.getState().initialize();

    expect(store.getState().availability).toBe("unconfigured");
    expect(store.getState().session).toBeNull();
  });

  it("restores only the renderer-safe commercial session summary", async () => {
    const store = createCommercialAuthStore(
      createGateway({ restoreSession: vi.fn(async () => session) }),
      createPreference("customer-a"),
    );

    await store.getState().initialize();

    expect(store.getState().availability).toBe("configured");
    expect(store.getState().session).toEqual(session);
    expect(store.getState().session).not.toHaveProperty("accessToken");
  });

  it("loads public tenant configuration before commercial login", async () => {
    const gateway = createGateway();
    const preference = createPreference();
    const store = createCommercialAuthStore(gateway, preference);

    const result = await store.getState().login({
      loginType: "PASSWORD",
      tenantCode: " customer-a ",
      username: "client_user",
      password: "secret",
      rememberMe: true,
    });

    expect(gateway.fetchPublicConfig).toHaveBeenCalledWith("customer-a");
    expect(gateway).not.toHaveProperty("fetchPublicLogo");
    expect(gateway.login).toHaveBeenCalledWith({
      loginType: "PASSWORD",
      tenantCode: "customer-a",
      username: "client_user",
      password: "secret",
      rememberMe: true,
    });
    expect(result).toEqual(session);
    expect(store.getState().publicConfig).toEqual(publicConfig);
    expect(store.getState().tenantCode).toBe("customer-a");
    expect(preference.write).toHaveBeenCalledWith("customer-a");
  });

  it("clears the summary after logout", async () => {
    const gateway = createGateway({ restoreSession: vi.fn(async () => session) });
    const store = createCommercialAuthStore(gateway, createPreference());
    await store.getState().initialize();

    await store.getState().logout();

    expect(gateway.logout).toHaveBeenCalledOnce();
    expect(store.getState().session).toBeNull();
  });

  it("keeps the encrypted remembered login available after an explicit logout", async () => {
    const rememberedLogin = {
      tenantCode: "customer-a",
      username: "client_user",
      hasPassword: true as const,
    };
    const gateway = createGateway({
      restoreSession: vi.fn(async () => session),
      rememberedLogin: vi.fn(async () => rememberedLogin),
    });
    const store = createCommercialAuthStore(gateway, createPreference("customer-a"));
    await store.getState().initialize();

    await store.getState().logout();

    expect(store.getState().session).toBeNull();
    expect(store.getState().rememberedLogin).toEqual(rememberedLogin);
  });

  it("signs in with the saved password without exposing it to the renderer", async () => {
    const rememberedLogin = {
      tenantCode: "customer-a",
      username: "client_user",
      hasPassword: true as const,
    };
    const gateway = createGateway({
      rememberedLogin: vi.fn(async () => rememberedLogin),
    });
    const store = createCommercialAuthStore(gateway, createPreference("customer-a"));
    await store.getState().initialize();

    const result = await store.getState().loginRemembered(true);

    expect(gateway.loginRemembered).toHaveBeenCalledWith({ rememberMe: true });
    expect(result).toEqual(session);
    expect(store.getState().session).toEqual(session);
  });

  it("reveals the saved password only through the explicit action", async () => {
    const rememberedLogin = {
      tenantCode: "customer-a",
      username: "client_user",
      hasPassword: true as const,
    };
    const revealRememberedPassword = vi.fn(async () => " Secret 123 ");
    const gateway = createGateway({
      rememberedLogin: vi.fn(async () => rememberedLogin),
      revealRememberedPassword,
    });
    const store = createCommercialAuthStore(gateway, createPreference("customer-a"));
    await store.getState().initialize();

    await expect(store.getState().revealRememberedPassword()).resolves.toBe(
      " Secret 123 ",
    );

    expect(revealRememberedPassword).toHaveBeenCalledOnce();
    expect(store.getState().rememberedLogin).toEqual(rememberedLogin);
    expect(store.getState()).not.toHaveProperty("password");
  });

  it("hydrates a protected avatar through Electron instead of using its relative path", async () => {
    const fetchAvatar = vi.fn(async () => ({
      contentType: "image/png",
      dataUrl: "data:image/png;base64,AA==",
    }));
    const gateway = createGateway({
      restoreSession: vi.fn(async () => session),
      fetchProfile: vi.fn(async () => ({
        ...profile,
        avatar: "/api/v1/user/avatar",
      })),
      fetchAvatar,
    });
    const store = createCommercialAuthStore(gateway, createPreference("customer-a"));

    await store.getState().initialize();

    expect(fetchAvatar).toHaveBeenCalledOnce();
    expect(store.getState().avatarDataUrl).toBe("data:image/png;base64,AA==");
    expect(store.getState().profile?.avatar).toBe("/api/v1/user/avatar");
  });

  it("uses one tenant across the three-step password reset contract", async () => {
    const gateway = createGateway();
    const store = createCommercialAuthStore(gateway, createPreference("customer-a"));

    await store.getState().sendPasswordResetCode("client@example.com");
    await store.getState().verifyPasswordResetCode("client@example.com", "123456");
    await store.getState().resetPassword("reset-ticket", "NewPassword123");

    expect(gateway.sendPasswordResetCode).toHaveBeenCalledWith(
      "customer-a",
      "client@example.com",
    );
    expect(gateway.verifyPasswordResetCode).toHaveBeenCalledWith(
      "customer-a",
      "client@example.com",
      "123456",
    );
    expect(gateway.resetPassword).toHaveBeenCalledWith(
      "customer-a",
      "reset-ticket",
      "NewPassword123",
    );
  });

  it("sends an SMS login code only when the tenant capability is enabled", async () => {
    const smsConfig: CommercialPublicConfig = {
      ...publicConfig,
      login: { ...publicConfig.login, smsLoginEnabled: true },
    };
    const sendSmsLoginCode = vi.fn(async () => ({
      success: true,
      message: "sent",
    }));
    const gateway = createGateway({
      fetchPublicConfig: vi.fn(async () => smsConfig),
      sendSmsLoginCode,
    });
    const store = createCommercialAuthStore(gateway, createPreference("customer-a"));

    await store.getState().sendSmsLoginCode("13800000000");

    expect(sendSmsLoginCode).toHaveBeenCalledWith(
      "customer-a",
      "13800000000",
    );
  });

  it("rejects SMS code issuance when the tenant capability is disabled", async () => {
    const sendSmsLoginCode = vi.fn(async () => ({
      success: true,
      message: "sent",
    }));
    const gateway = createGateway({ sendSmsLoginCode });
    const store = createCommercialAuthStore(gateway, createPreference("customer-a"));

    await expect(
      store.getState().sendSmsLoginCode("13800000000"),
    ).rejects.toThrow("SMS login is disabled for this tenant");

    expect(sendSmsLoginCode).not.toHaveBeenCalled();
  });

  it("injects the current captcha key and refreshes it after a failed login", async () => {
    const captchaConfig: CommercialPublicConfig = {
      ...publicConfig,
      login: { ...publicConfig.login, captchaEnabled: true },
    };
    const login = vi.fn(async () => {
      throw new Error("invalid captcha");
    });
    const fetchCaptcha = vi
      .fn()
      .mockResolvedValueOnce({
        key: "captcha-1",
        imageDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
      })
      .mockResolvedValueOnce({
        key: "captcha-2",
        imageDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
      });
    const gateway = createGateway({
      fetchPublicConfig: vi.fn(async () => captchaConfig),
      fetchCaptcha,
      login,
    });
    const store = createCommercialAuthStore(gateway, createPreference());

    await expect(
      store.getState().login({
        loginType: "PASSWORD",
        tenantCode: "customer-a",
        username: "client_user",
        password: "secret",
        captchaCode: "ABCD",
      }),
    ).rejects.toThrow("invalid captcha");

    expect(login).toHaveBeenCalledWith({
      loginType: "PASSWORD",
      tenantCode: "customer-a",
      username: "client_user",
      password: "secret",
      captchaKey: "captcha-1",
      captchaCode: "ABCD",
    });
    expect(store.getState().captcha?.key).toBe("captcha-2");
  });
});
