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
  },
  tenant: { id: 11, code: "customer-a", name: "客户 A", isSystem: false },
};

const publicConfig: CommercialPublicConfig = {
  system: { siteName: "Enlectron" },
  login: { captchaEnabled: false, rememberMe: true },
  register: { enabled: false },
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
      gatewayOrigin: "http://122.193.11.199:8889",
    })),
    fetchPublicConfig: vi.fn(async () => publicConfig),
    fetchPublicLogo: vi.fn(async () => ({
      contentType: "image/png",
      dataUrl: "data:image/png;base64,AA==",
    })),
    fetchCaptcha: vi.fn(async () => ({
      key: "captcha-key",
      imageDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
    })),
    register: vi.fn(async () => undefined),
    restoreSession: vi.fn(async () => null),
    rememberedLogin: vi.fn(async () => null),
    login: vi.fn(async () => session),
    loginRemembered: vi.fn(async () => session),
    logout: vi.fn(async () => ({ remoteRevoked: true })),
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
    changePassword: vi.fn(async () => undefined),
    sendPasswordResetCode: vi.fn(async () => undefined),
    verifyPasswordResetCode: vi.fn(async () => ({
      resetTicket: "reset-ticket",
      expiresIn: 600,
    })),
    resetPassword: vi.fn(async () => undefined),
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
      tenantCode: " customer-a ",
      username: "client_user",
      password: "secret",
      rememberMe: true,
    });

    expect(gateway.fetchPublicConfig).toHaveBeenCalledWith("customer-a");
    expect(gateway.fetchPublicLogo).not.toHaveBeenCalled();
    expect(gateway.login).toHaveBeenCalledWith({
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

  it("loads the optional tenant logo only when public config advertises it", async () => {
    const gateway = createGateway({
      fetchPublicConfig: vi.fn(async () => ({
        ...publicConfig,
        system: { ...publicConfig.system, logo: "/api/v1/config/logo" },
      })),
    });
    const store = createCommercialAuthStore(gateway, createPreference());

    await store.getState().loadPublicConfig("customer-a");

    expect(gateway.fetchPublicLogo).toHaveBeenCalledWith("customer-a");
    expect(store.getState().logoDataUrl).toBe("data:image/png;base64,AA==");
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

  it("registers only when enabled and injects the current captcha", async () => {
    const registrationConfig: CommercialPublicConfig = {
      ...publicConfig,
      login: { captchaEnabled: true, rememberMe: true },
      register: { enabled: true },
    };
    const register = vi.fn(async () => undefined);
    const gateway = createGateway({
      fetchPublicConfig: vi.fn(async () => registrationConfig),
      register,
    });
    const store = createCommercialAuthStore(gateway, createPreference());

    await store.getState().register({
      tenantCode: "customer-a",
      username: "new-user",
      password: "Secret123",
      nickname: "New User",
      captchaCode: "ABCD",
    });

    expect(register).toHaveBeenCalledWith({
      tenantCode: "customer-a",
      username: "new-user",
      password: "Secret123",
      nickname: "New User",
      captchaKey: "captcha-key",
      captchaCode: "ABCD",
    });
  });

  it("does not submit registration when an undefined verification flow is required", async () => {
    const register = vi.fn(async () => undefined);
    const gateway = createGateway({
      fetchPublicConfig: vi.fn(async () => ({
        ...publicConfig,
        register: { enabled: true, verifyEmail: true },
      })),
      register,
    });
    const store = createCommercialAuthStore(gateway, createPreference());

    await expect(
      store.getState().register({
        tenantCode: "customer-a",
        username: "new-user",
        password: "Secret123",
        email: "new@example.com",
      }),
    ).rejects.toThrow("Registration verification contract is unavailable");

    expect(register).not.toHaveBeenCalled();
  });

  it("injects the current captcha key and refreshes it after a failed login", async () => {
    const captchaConfig: CommercialPublicConfig = {
      ...publicConfig,
      login: { captchaEnabled: true, rememberMe: true },
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
        tenantCode: "customer-a",
        username: "client_user",
        password: "secret",
        captchaCode: "ABCD",
      }),
    ).rejects.toThrow("invalid captcha");

    expect(login).toHaveBeenCalledWith({
      tenantCode: "customer-a",
      username: "client_user",
      password: "secret",
      captchaKey: "captcha-1",
      captchaCode: "ABCD",
    });
    expect(store.getState().captcha?.key).toBe("captcha-2");
  });
});
