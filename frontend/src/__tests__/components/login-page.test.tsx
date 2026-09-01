import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/components/login-page";

const mocks = vi.hoisted(() => {
  const publicConfig = {
    brand: { siteName: "AI Anime", siteDescription: "Desktop studio" },
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
  const revealRememberedPassword = vi.fn(async () => "Secret 123");
  return {
    navigate: vi.fn(async () => undefined),
    revealRememberedPassword,
    auth: {
      login: vi.fn(async () => undefined),
      authorize: vi.fn(async () => undefined),
      getCurrentUser: vi.fn(async () => ({ username: "client_user" })),
    },
    commercial: {
      availability: "configured",
      tenantCode: "customer-a",
      publicConfig,
      captcha: null,
      rememberedLogin: {
        tenantCode: "customer-a",
        username: "client_user",
        hasPassword: true,
      } as { tenantCode: string; username: string; hasPassword: true } | null,
      initialize: vi.fn(async () => undefined),
      setTenantCode: vi.fn(),
      loadPublicConfig: vi.fn(async () => publicConfig),
      refreshCaptcha: vi.fn(async () => undefined),
      login: vi.fn(async () => undefined),
      loginRemembered: vi.fn(async () => undefined),
      revealRememberedPassword,
      sendSmsLoginCode: vi.fn(async () => ({ success: true, message: "sent" })),
      sendPasswordResetCode: vi.fn(async () => undefined),
      verifyPasswordResetCode: vi.fn(async () => ({
        resetTicket: "reset-ticket",
        expiresIn: 600,
      })),
      resetPassword: vi.fn(async () => undefined),
    },
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "auth.password": "密码",
        "auth.showPassword": "显示密码",
        "auth.hidePassword": "隐藏密码",
        "auth.savedPasswordPlaceholder": "已保存密码",
        "auth.passwordPlaceholder": "••••••••••",
      } as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock("@/components/region-selector", () => ({
  RegionSelector: () => null,
}));

vi.mock("@/shared/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => true,
}));

vi.mock("@/shared/cluster-config", () => ({
  clusterConfig: { mode: "single-region" },
}));

vi.mock("@/shared/stores/region-store", () => ({
  useRegionStore: (selector: (state: { selectedRegionId: string }) => unknown) =>
    selector({ selectedRegionId: "default" }),
}));

vi.mock("@/modules/identity_access/public", () => ({
  useAuthStore: (selector: (state: typeof mocks.auth) => unknown) =>
    selector(mocks.auth),
  useCommercialAuthStore: (
    selector: (state: typeof mocks.commercial) => unknown,
  ) => selector(mocks.commercial),
}));

describe("LoginPage remembered password", () => {
  beforeEach(() => {
    mocks.commercial.rememberedLogin = {
      tenantCode: "customer-a",
      username: "client_user",
      hasPassword: true,
    };
    mocks.revealRememberedPassword.mockReset();
    mocks.revealRememberedPassword.mockResolvedValue("Secret 123");
  });

  it("renders the bundled desktop Logo", () => {
    const { container } = render(<LoginPage />);

    expect(
      container.querySelector('img[src="/images/ai-anime-logo-mark.png"]'),
    ).toBeInTheDocument();
  });

  it("reveals the real saved password only after clicking the eye button", async () => {
    render(<LoginPage />);

    const password = screen.getByLabelText("密码");
    await waitFor(() => expect(password).toHaveAttribute("placeholder", "已保存密码"));
    expect(password).toHaveValue("");
    expect(password).not.toBeRequired();

    fireEvent.click(screen.getByRole("button", { name: "显示密码" }));

    await waitFor(() => expect(password).toHaveValue("Secret 123"));
    expect(mocks.revealRememberedPassword).toHaveBeenCalledOnce();
    expect(password).toHaveAttribute("type", "text");
  });

  it("removes the saved-password placeholder when the encrypted credential disappears", async () => {
    const { rerender } = render(<LoginPage />);

    const password = screen.getByLabelText("密码");
    await waitFor(() => expect(password).toHaveAttribute("placeholder", "已保存密码"));

    mocks.commercial.rememberedLogin = null;
    rerender(<LoginPage />);

    await waitFor(() =>
      expect(password).toHaveAttribute("placeholder", "••••••••••"),
    );
    expect(password).toHaveValue("");
    expect(password).toBeRequired();
  });
});
