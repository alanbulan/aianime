import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, RefreshCw, UserRound } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { gsap } from "gsap";
import { RegionSelector } from "@/components/login/region-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReducedMotion } from "@/shared/hooks/use-reduced-motion";
import { clusterConfig } from "@/lib/cluster-config";
import {
  useAuthStore,
  useCommercialAuthStore,
} from "@/modules/identity_access/public";
import { useRegionStore } from "@/stores/region-store";

type AuthView = "login" | "authorize";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const login = useAuthStore((state) => state.login);
  const authorize = useAuthStore((state) => state.authorize);
  const getCurrentUser = useAuthStore((state) => state.getCurrentUser);
  const commercialAvailability = useCommercialAuthStore(
    (state) => state.availability,
  );
  const tenantCode = useCommercialAuthStore((state) => state.tenantCode);
  const initialTenantCodeRef = useRef(tenantCode);
  const commercialPublicConfig = useCommercialAuthStore(
    (state) => state.publicConfig,
  );
  const commercialCaptcha = useCommercialAuthStore((state) => state.captcha);
  const initializeCommercial = useCommercialAuthStore(
    (state) => state.initialize,
  );
  const setTenantCode = useCommercialAuthStore((state) => state.setTenantCode);
  const loadCommercialPublicConfig = useCommercialAuthStore(
    (state) => state.loadPublicConfig,
  );
  const refreshCommercialCaptcha = useCommercialAuthStore(
    (state) => state.refreshCaptcha,
  );
  const commercialLogin = useCommercialAuthStore((state) => state.login);
  const regionId = useRegionStore((state) => state.selectedRegionId);
  const [view, setView] = useState<AuthView>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsRegion = clusterConfig.mode === "multi-region" && !regionId;
  const commercialConfigured = commercialAvailability === "configured";

  useEffect(() => {
    void initializeCommercial().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : t("auth.loginFailed"));
    });
  }, [initializeCommercial, t]);

  useEffect(() => {
    if (
      !commercialConfigured ||
      !initialTenantCodeRef.current ||
      !tenantCode ||
      commercialPublicConfig ||
      tenantCode !== initialTenantCodeRef.current
    ) {
      return;
    }
    void loadCommercialPublicConfig().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : t("auth.loginFailed"));
    });
  }, [
    commercialConfigured,
    commercialPublicConfig,
    loadCommercialPublicConfig,
    t,
    tenantCode,
  ]);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page || reducedMotion) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        "[data-login-background]",
        { scale: 1.035 },
        { scale: 1, duration: 1.7, ease: "power2.out" },
      );
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .fromTo(
          panelRef.current,
          { autoAlpha: 0, x: 32 },
          { autoAlpha: 1, x: 0, duration: 0.78 },
          0.08,
        );
    }, page);

    return () => context.revert();
  }, [reducedMotion]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (commercialConfigured) {
        await commercialLogin({
          tenantCode,
          username: username.trim(),
          password,
          rememberMe: true,
          ...(commercialPublicConfig?.login.captchaEnabled
            ? { captchaCode }
            : {}),
        });
        const user = await getCurrentUser({ clearOnNetworkFailure: false });
        if (!user) throw new Error(t("auth.workspaceSessionFailed"));
      } else if (view === "login") {
        await login(username.trim(), password);
      } else {
        await authorize(authorizationCode.trim());
      }
      await navigate({ to: "/", replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("auth.loginFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      ref={pageRef}
      className="relative h-full min-h-[520px] overflow-hidden bg-background"
    >
      <img
        src="/images/login-hero-light-v2.webp"
        alt=""
        aria-hidden="true"
        data-login-background
        className="absolute inset-0 h-full w-full object-cover object-center opacity-100 transition-opacity duration-500 dark:opacity-0"
      />
      <img
        src="/images/login-hero-dark-v2.webp"
        alt=""
        aria-hidden="true"
        data-login-background
        className="absolute inset-0 h-full w-full object-cover object-center opacity-0 transition-opacity duration-500 dark:opacity-100"
      />
      <div
        className="absolute inset-0 bg-background/10 transition-colors duration-500 dark:bg-background/30"
        aria-hidden="true"
      />

      <section
        ref={panelRef}
        className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[460px] items-center border-l border-border bg-background px-8 text-foreground shadow-xl sm:px-12"
      >
        <div className="w-full">
          <div className="mb-7">
            <h1 className="text-2xl font-semibold">{t("auth.accessTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                commercialConfigured
                  ? "auth.commercialAccessSubtitle"
                  : "auth.accessSubtitle",
              )}
            </p>
          </div>

          <RegionSelector />

          {commercialConfigured ? null : (
            <div className="mb-6 mt-4 grid h-10 grid-cols-2 rounded-md bg-muted p-1" role="tablist">
              <AuthModeButton
                active={view === "login"}
                icon={<UserRound className="size-4" />}
                label={t("auth.passwordLogin")}
                onClick={() => {
                  setView("login");
                  setError(null);
                }}
              />
              <AuthModeButton
                active={view === "authorize"}
                icon={<KeyRound className="size-4" />}
                label={t("auth.codeAuthorization")}
                onClick={() => {
                  setView("authorize");
                  setError(null);
                }}
              />
            </div>
          )}

          <form className={commercialConfigured ? "mt-6 space-y-4" : "space-y-4"} onSubmit={submit}>
            {commercialConfigured ? (
              <Field label={t("auth.tenantCode")} htmlFor="tenant-code">
                <Input
                  id="tenant-code"
                  autoComplete="organization"
                  value={tenantCode}
                  onChange={(event) => {
                    setTenantCode(event.target.value);
                    setCaptchaCode("");
                    setError(null);
                  }}
                  onBlur={() => {
                    if (!tenantCode.trim() || commercialPublicConfig) return;
                    void loadCommercialPublicConfig().catch((reason: unknown) => {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : t("auth.loginFailed"),
                      );
                    });
                  }}
                  placeholder={t("auth.tenantCodePlaceholder")}
                  required
                />
              </Field>
            ) : null}
            {commercialConfigured || view === "login" ? (
              <>
                <Field label={t("auth.username")} htmlFor="username">
                  <Input
                    id="username"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={t("auth.usernamePlaceholder")}
                    required
                  />
                </Field>
                <Field label={t("auth.password")} htmlFor="password">
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t("auth.passwordPlaceholder")}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      className="absolute right-0 top-0 flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
                {commercialPublicConfig?.login.captchaEnabled ? (
                  <Field label={t("auth.captcha")} htmlFor="captcha-code">
                    <div className="grid grid-cols-[minmax(0,1fr)_136px] gap-2">
                      <Input
                        id="captcha-code"
                        autoComplete="off"
                        value={captchaCode}
                        onChange={(event) => setCaptchaCode(event.target.value)}
                        placeholder={t("auth.captchaPlaceholder")}
                        required
                      />
                      <button
                        type="button"
                        className="relative flex h-9 items-center justify-center overflow-hidden rounded-md border border-input bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                        onClick={() => {
                          setCaptchaCode("");
                          void refreshCommercialCaptcha().catch(
                            (reason: unknown) => {
                              setError(
                                reason instanceof Error
                                  ? reason.message
                                  : t("auth.captchaRefreshFailed"),
                              );
                            },
                          );
                        }}
                        aria-label={t("auth.refreshCaptcha")}
                        title={t("auth.refreshCaptcha")}
                      >
                        {commercialCaptcha ? (
                          <img
                            src={commercialCaptcha.imageDataUrl}
                            alt=""
                            aria-hidden="true"
                            className="h-full min-w-0 flex-1 object-contain"
                          />
                        ) : null}
                        <RefreshCw className="mr-2 size-3.5 shrink-0" />
                      </button>
                    </div>
                  </Field>
                ) : null}
              </>
            ) : (
              <Field label={t("auth.authorizationCode")} htmlFor="authorization-code">
                <Input
                  id="authorization-code"
                  autoComplete="one-time-code"
                  value={authorizationCode}
                  onChange={(event) => setAuthorizationCode(event.target.value)}
                  placeholder={t("auth.authorizationCodePlaceholder")}
                  required
                />
              </Field>
            )}

            <div className="h-5 text-sm text-destructive" role="alert">
              {error}
            </div>

            <Button
              type="submit"
              className="h-10 w-full"
              disabled={
                submitting ||
                needsRegion ||
                commercialAvailability === "unknown" ||
                (commercialConfigured && !tenantCode) ||
                (commercialPublicConfig?.login.captchaEnabled && !captchaCode.trim())
              }
              title={needsRegion ? t("region.picker.required") : undefined}
            >
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {submitting
                ? t("auth.authenticating")
                : commercialConfigured || view === "login"
                  ? t("auth.loginButton")
                  : t("auth.authorizeButton")}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}

function AuthModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`flex min-w-0 items-center justify-center gap-2 rounded px-3 text-sm transition-colors ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
