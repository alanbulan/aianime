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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

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

describe("commercial session races", () => {
  const nextSession: CommercialSession = {
    ...session,
    user: { ...session.user, id: 2002, username: "second-user", nickname: "乙" },
    tenant: { ...session.tenant, id: 22, code: "customer-b" },
  };
  const nextProfile: CommercialUserProfile = { ...profile, ...nextSession.user };

  for (const operation of ["loadProfile", "updateProfile", "uploadAvatar", "deleteAvatar"] as const) {
    for (const replacement of ["logout", "other-account", "same-account"] as const) {
      it(`${operation} cannot refill state after ${replacement}`, async () => {
        const started = deferred<void>();
        const release = deferred<void>();
        const gateway = createGateway({ restoreSession: vi.fn(async () => session) });
        const store = createCommercialAuthStore(gateway, createPreference());
        await store.getState().initialize();
        const wait = async () => { started.resolve(); await release.promise; };
        let request: Promise<unknown>;
        if (operation === "loadProfile") {
          gateway.fetchProfile = vi.fn(async () => { await wait(); return profile; });
          request = store.getState().loadProfile();
        } else if (operation === "updateProfile") {
          gateway.updateProfile = vi.fn(async () => { await wait(); return { ...profile, nickname: "旧修改" }; });
          request = store.getState().updateProfile({ nickname: "旧修改", email: "", phone: "", gender: 0, profileDescription: "" });
        } else if (operation === "uploadAvatar") {
          gateway.uploadAvatar = vi.fn(async () => {
            await wait();
            return { profile: { ...profile, avatar: "old-avatar" }, avatar: { contentType: "image/png", dataUrl: "data:image/png;base64,b2xk" } };
          });
          request = store.getState().uploadAvatar(new File(["image"], "avatar.png", { type: "image/png" }));
        } else {
          gateway.deleteAvatar = vi.fn(async () => { await wait(); return { profile }; });
          request = store.getState().deleteAvatar();
        }
        const rejected = expect(request).rejects.toThrow("登录状态已变更");
        await started.promise;
        await store.getState().logout();
        if (replacement !== "logout") {
          const replacementSession = replacement === "other-account" ? nextSession : session;
          gateway.login = vi.fn(async () => replacementSession);
          gateway.fetchProfile = vi.fn(async () => replacement === "other-account" ? nextProfile : profile);
          await store.getState().login({
            loginType: "PASSWORD", tenantCode: replacementSession.tenant.code,
            username: replacementSession.user.username, password: "test-password", rememberMe: false,
          });
        }
        const before = store.getState();
        release.resolve();
        await rejected;
        expect(store.getState().session).toEqual(before.session);
        expect(store.getState().profile).toEqual(before.profile);
        expect(store.getState().avatarDataUrl).toEqual(before.avatarDataUrl);
      });
    }
  }

  it("ignores an avatar finishing after the profile request's session logged out", async () => {
    const started = deferred<void>();
    const avatar = deferred<{ contentType: string; dataUrl: string }>();
    const gateway = createGateway({ restoreSession: vi.fn(async () => session) });
    const store = createCommercialAuthStore(gateway, createPreference());
    await store.getState().initialize();
    gateway.fetchProfile = vi.fn(async () => ({ ...profile, avatar: "avatar" }));
    gateway.fetchAvatar = vi.fn(async () => { started.resolve(); return avatar.promise; });
    const rejected = expect(store.getState().loadProfile()).rejects.toThrow("登录状态已变更");
    await started.promise;
    await store.getState().logout();
    avatar.resolve({ contentType: "image/png", dataUrl: "data:image/png;base64,b2xk" });
    await rejected;
    expect(store.getState().session).toBeNull();
    expect(store.getState().profile).toBeNull();
    expect(store.getState().avatarDataUrl).toBeNull();
  });

  it("does not restore a session after logout while initialization is pending", async () => {
    const started = deferred<void>();
    const restored = deferred<CommercialSession | null>();
    const store = createCommercialAuthStore(createGateway({
      restoreSession: vi.fn(async () => { started.resolve(); return restored.promise; }),
    }), createPreference());
    const initializing = store.getState().initialize();
    await started.promise;
    await store.getState().logout();
    restored.resolve(session);
    await initializing;
    expect(store.getState().session).toBeNull();
    expect(store.getState().profile).toBeNull();
  });

  it("a delayed remote logout does not erase the following login", async () => {
    const started = deferred<void>();
    const released = deferred<void>();
    const gateway = createGateway({
      restoreSession: vi.fn(async () => session),
      logout: vi.fn(async () => { started.resolve(); await released.promise; return { remoteRevoked: true, success: true }; }),
    });
    const store = createCommercialAuthStore(gateway, createPreference());
    await store.getState().initialize();
    const loggingOut = store.getState().logout();
    await started.promise;
    gateway.login = vi.fn(async () => nextSession);
    gateway.fetchProfile = vi.fn(async () => nextProfile);
    await store.getState().login({ loginType: "PASSWORD", tenantCode: "customer-b", username: "second-user", password: "test-password", rememberMe: true });
    released.resolve();
    await loggingOut;
    expect(store.getState().session).toEqual(nextSession);
    expect(store.getState().profile).toEqual(nextProfile);
    expect(store.getState().rememberedLogin?.username).toBe("second-user");
  });
});

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
