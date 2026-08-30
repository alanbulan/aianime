import {
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { gsap } from "gsap";
import { RegionSelector } from "@/components/region-selector";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useReducedMotion } from "@/shared/hooks/use-reduced-motion";
import { clusterConfig } from "@/shared/cluster-config";
import {
  useAuthStore,
  useCommercialAuthStore,
  type CommercialPublicConfig,
} from "@/modules/identity_access/public";
import { useRegionStore } from "@/shared/stores/region-store";

type AuthView = "login" | "register" | "authorize" | "forgot";
type PasswordResetStep = "request" | "verify" | "reset";

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
  const rememberedCommercialLogin = useCommercialAuthStore(
    (state) => state.rememberedLogin,
  );
  const commercialLogoDataUrl = useCommercialAuthStore(
    (state) => state.logoDataUrl,
  );
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
  const commercialLoginRemembered = useCommercialAuthStore(
    (state) => state.loginRemembered,
  );
  const revealCommercialRememberedPassword = useCommercialAuthStore(
    (state) => state.revealRememberedPassword,
  );
  const commercialRegister = useCommercialAuthStore((state) => state.register);
  const sendPasswordResetCode = useCommercialAuthStore(
    (state) => state.sendPasswordResetCode,
  );
  const verifyPasswordResetCode = useCommercialAuthStore(
    (state) => state.verifyPasswordResetCode,
  );
  const resetCommercialPassword = useCommercialAuthStore(
    (state) => state.resetPassword,
  );
  const regionId = useRegionStore((state) => state.selectedRegionId);
  const [view, setView] = useState<AuthView>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resetTicket, setResetTicket] = useState("");
  const [passwordResetStep, setPasswordResetStep] =
    useState<PasswordResetStep>("request");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [usingRememberedPassword, setUsingRememberedPassword] = useState(false);
  const appliedRememberedLoginRef = useRef("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const needsRegion = clusterConfig.mode === "multi-region" && !regionId;
  const commercialConfigured = commercialAvailability === "configured";
  const registrationEnabled = Boolean(
    commercialPublicConfig?.register?.enabled &&
      !commercialPublicConfig.register.verifyEmail &&
      !commercialPublicConfig.register.verifyPhone,
  );

  useEffect(() => {
    void initializeCommercial().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : t("auth.loginFailed"));
    });
  }, [initializeCommercial, t]);

  useEffect(() => {
    if (!commercialConfigured || view !== "login") return;
    if (!rememberedCommercialLogin) {
      if (!usingRememberedPassword) return;
      appliedRememberedLoginRef.current = "";
      setPassword("");
      setShowPassword(false);
      setUsingRememberedPassword(false);
      return;
    }
    const key = `${rememberedCommercialLogin.tenantCode}\n${rememberedCommercialLogin.username}`;
    if (appliedRememberedLoginRef.current === key) return;
    appliedRememberedLoginRef.current = key;
    setTenantCode(rememberedCommercialLogin.tenantCode);
    setUsername(rememberedCommercialLogin.username);
    setPassword("");
    setShowPassword(false);
    setRememberMe(true);
    setUsingRememberedPassword(true);
  }, [
    commercialConfigured,
    rememberedCommercialLogin,
    setTenantCode,
    usingRememberedPassword,
    view,
  ]);

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
    setSuccess(null);
    try {
      if (commercialConfigured && view === "forgot") {
        if (passwordResetStep === "request") {
          await sendPasswordResetCode(email);
          setPasswordResetStep("verify");
          setSuccess(t("auth.resetCodeSent"));
          return;
        }
        if (passwordResetStep === "verify") {
          const verification = await verifyPasswordResetCode(
            email,
            verificationCode,
          );
          setResetTicket(verification.resetTicket);
          setPasswordResetStep("reset");
          setSuccess(t("auth.resetCodeVerified"));
          return;
        }
        if (password !== confirmPassword) {
          throw new Error(t("auth.passwordMismatch"));
        }
        if (password.length < 8 || password.length > 128) {
          throw new Error(t("auth.resetPasswordLength"));
        }
        await resetCommercialPassword(resetTicket, password);
        setView("login");
        setPasswordResetStep("request");
        setVerificationCode("");
        setResetTicket("");
        setPassword("");
        setConfirmPassword("");
        setSuccess(t("auth.passwordResetSucceeded"));
        return;
      }
      if (commercialConfigured && view === "register") {
        if (password !== confirmPassword) {
          throw new Error(t("auth.passwordMismatch"));
        }
        const passwordError = validateCommercialPassword(
          password,
          commercialPublicConfig?.password,
          t,
        );
        if (passwordError) throw new Error(passwordError);
        await commercialRegister({
          tenantCode,
          username: username.trim(),
          password,
          ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(commercialPublicConfig?.login.captchaEnabled
            ? { captchaCode }
            : {}),
        });
        setView("login");
        setPassword("");
        setConfirmPassword("");
        setCaptchaCode("");
        setSuccess(t("auth.registrationSucceeded"));
        if (commercialPublicConfig?.login.captchaEnabled) {
          await refreshCommercialCaptcha().catch(() => undefined);
        }
        return;
      } else if (commercialConfigured) {
        const shouldRemember = commercialPublicConfig?.login.rememberMe
          ? rememberMe
          : false;
        const canUseRememberedPassword = Boolean(
          usingRememberedPassword
          && rememberedCommercialLogin
          && tenantCode.trim() === rememberedCommercialLogin.tenantCode
          && username.trim() === rememberedCommercialLogin.username,
        );
        if (canUseRememberedPassword) {
          await commercialLoginRemembered(shouldRemember, captchaCode);
        } else {
          await commercialLogin({
            tenantCode,
            username: username.trim(),
            password,
            rememberMe: shouldRemember,
            ...(commercialPublicConfig?.login.captchaEnabled
              ? { captchaCode }
              : {}),
          });
        }
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
        className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[460px] items-center overflow-y-auto border-l border-border bg-background px-8 py-8 text-foreground shadow-xl sm:px-12"
      >
        <div className="w-full">
          <div className="mb-7">
            {commercialConfigured && commercialLogoDataUrl ? (
              <img
                src={commercialLogoDataUrl}
                alt=""
                className="mb-4 h-10 w-auto max-w-48 object-contain object-left"
              />
            ) : null}
            <h1 className="text-2xl font-semibold">
              {commercialConfigured && commercialPublicConfig?.system.siteName
                ? commercialPublicConfig.system.siteName
                : t("auth.accessTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {commercialConfigured && commercialPublicConfig?.system.siteDescription
                ? commercialPublicConfig.system.siteDescription
                : t(
                    commercialConfigured
                      ? "auth.commercialAccessSubtitle"
                      : "auth.accessSubtitle",
                  )}
            </p>
          </div>

          <RegionSelector />

          {commercialConfigured && registrationEnabled && view !== "forgot" ? (
            <div className="mb-6 mt-4 grid h-10 grid-cols-2 rounded-md bg-muted p-1" role="tablist">
              <AuthModeButton
                active={view === "login"}
                icon={<UserRound className="size-4" />}
                label={t("auth.passwordLogin")}
                onClick={() => {
                  setView("login");
                  appliedRememberedLoginRef.current = "";
                  setError(null);
                  setSuccess(null);
                }}
              />
              <AuthModeButton
                active={view === "register"}
                icon={<UserPlus className="size-4" />}
                label={t("auth.register")}
                onClick={() => {
                  setView("register");
                  if (usingRememberedPassword) setPassword("");
                  setUsingRememberedPassword(false);
                  setError(null);
                  setSuccess(null);
                }}
              />
            </div>
          ) : commercialConfigured ? null : (
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
                    setUsingRememberedPassword(false);
                    setView("login");
                    setCaptchaCode("");
                    setError(null);
                    setSuccess(null);
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
            {commercialConfigured && view === "forgot" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-medium">{t("auth.resetPassword")}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`auth.resetSteps.${passwordResetStep}`)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setView("login");
                      appliedRememberedLoginRef.current = "";
                      setPasswordResetStep("request");
                      setVerificationCode("");
                      setResetTicket("");
                      setError(null);
                      setSuccess(null);
                    }}
                  >
                    <ArrowLeft />
                    {t("auth.backToLogin")}
                  </Button>
                </div>
                {passwordResetStep === "request" ? (
                  <Field label={t("auth.email")} htmlFor="reset-email">
                    <Input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={t("auth.emailPlaceholder")}
                      required
                    />
                  </Field>
                ) : passwordResetStep === "verify" ? (
                  <>
                    <Field label={t("auth.email")} htmlFor="verified-email">
                      <Input id="verified-email" value={email} readOnly />
                    </Field>
                    <Field label={t("auth.emailCode")} htmlFor="reset-code">
                      <Input
                        id="reset-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={verificationCode}
                        onChange={(event) => setVerificationCode(event.target.value)}
                        placeholder={t("auth.emailCodePlaceholder")}
                        required
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label={t("auth.newPassword")} htmlFor="reset-password">
                      <Input
                        id="reset-password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                    </Field>
                    <Field label={t("auth.confirmPassword")} htmlFor="reset-confirm-password">
                      <Input
                        id="reset-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                      />
                    </Field>
                  </>
                )}
              </>
            ) : commercialConfigured || view === "login" ? (
              <>
                <Field label={t("auth.username")} htmlFor="username">
                  <Input
                    id="username"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setUsingRememberedPassword(false);
                    }}
                    placeholder={t("auth.usernamePlaceholder")}
                    required
                  />
                </Field>
                {commercialConfigured && view === "register" ? (
                  <>
                    <Field label={t("auth.nickname")} htmlFor="nickname">
                      <Input
                        id="nickname"
                        autoComplete="name"
                        value={nickname}
                        onChange={(event) => setNickname(event.target.value)}
                        placeholder={t("auth.nicknamePlaceholder")}
                      />
                    </Field>
                    <Field label={t("auth.email")} htmlFor="registration-email">
                      <Input
                        id="registration-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={t("auth.emailPlaceholder")}
                        required={commercialPublicConfig?.register?.verifyEmail === true}
                      />
                    </Field>
                  </>
                ) : null}
                <Field label={t("auth.password")} htmlFor="password">
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        commercialConfigured && view === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setUsingRememberedPassword(false);
                      }}
                      placeholder={t(
                        usingRememberedPassword
                          ? "auth.savedPasswordPlaceholder"
                          : "auth.passwordPlaceholder",
                      )}
                      className="pr-10"
                      required={!usingRememberedPassword}
                    />
                    <button
                      type="button"
                      className="absolute right-0 top-0 flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        if (!usingRememberedPassword) {
                          setShowPassword((value) => !value);
                          return;
                        }
                        setError(null);
                        void revealCommercialRememberedPassword()
                          .then((rememberedPassword) => {
                            setPassword(rememberedPassword);
                            setUsingRememberedPassword(false);
                            setShowPassword(true);
                          })
                          .catch((reason: unknown) => {
                            setError(
                              reason instanceof Error
                                ? reason.message
                                : t("auth.loginFailed"),
                            );
                          });
                      }}
                      aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
                {commercialConfigured && view === "register" ? (
                  <Field label={t("auth.confirmPassword")} htmlFor="confirm-password">
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder={t("auth.passwordPlaceholder")}
                      required
                    />
                  </Field>
                ) : null}
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
                        data-ui-tooltip={t("auth.refreshCaptcha")}
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
                {commercialConfigured &&
                view === "login" &&
                commercialPublicConfig?.login.rememberMe ? (
                  <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <span>{t("auth.remember")}</span>
                  </label>
                ) : null}
                {commercialConfigured && view === "login" ? (
                  <button
                    type="button"
                    className="ml-auto block text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setView("forgot");
                      setUsingRememberedPassword(false);
                      setPasswordResetStep("request");
                      setPassword("");
                      setConfirmPassword("");
                      setError(null);
                      setSuccess(null);
                    }}
                  >
                    {t("auth.forgot")}
                  </button>
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

            <div
              className={`min-h-5 text-sm ${error ? "text-destructive" : "text-success"}`}
              role={error ? "alert" : "status"}
            >
              {error ?? success}
            </div>

            <Button
              type="submit"
              className="h-10 w-full"
              disabled={
                submitting ||
                needsRegion ||
                commercialAvailability === "unknown" ||
                (commercialConfigured && !tenantCode) ||
                (commercialPublicConfig?.login.captchaEnabled &&
                  view !== "forgot" &&
                  !captchaCode.trim()) ||
                (view === "forgot" &&
                  ((passwordResetStep === "request" && !email.trim()) ||
                    (passwordResetStep === "verify" && !verificationCode.trim()) ||
                    (passwordResetStep === "reset" &&
                      (!password || !confirmPassword))))
              }
              data-ui-tooltip={needsRegion ? t("region.picker.required") : undefined}
            >
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {submitting
                ? t("auth.authenticating")
                : commercialConfigured && view === "forgot"
                  ? t(`auth.resetActions.${passwordResetStep}`)
                : commercialConfigured && view === "register"
                  ? t("auth.registerButton")
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

function validateCommercialPassword(
  password: string,
  policy: CommercialPublicConfig["password"],
  t: TFunction,
): string | null {
  if (!policy) return null;
  if (password.length < policy.minLength || password.length > policy.maxLength) {
    return t("auth.passwordLength", {
      min: policy.minLength,
      max: policy.maxLength,
    });
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return t("auth.passwordRequiresUppercase");
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return t("auth.passwordRequiresLowercase");
  }
  if (policy.requireNumber && !/\d/.test(password)) {
    return t("auth.passwordRequiresNumber");
  }
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    return t("auth.passwordRequiresSpecial");
  }
  return null;
}
