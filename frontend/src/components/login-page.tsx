import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, UserRound } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { gsap } from "gsap";
import { RegionSelector } from "@/components/login/region-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { clusterConfig } from "@/lib/cluster-config";
import { useAuthStore } from "@/stores/auth-store";
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
  const regionId = useRegionStore((state) => state.selectedRegionId);
  const [view, setView] = useState<AuthView>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsRegion = clusterConfig.mode === "multi-region" && !regionId;

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
      if (view === "login") await login(username.trim(), password);
      else await authorize(authorizationCode.trim());
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
            <p className="mt-2 text-sm text-muted-foreground">{t("auth.accessSubtitle")}</p>
          </div>

          <RegionSelector />

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

          <form className="space-y-4" onSubmit={submit}>
            {view === "login" ? (
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
              disabled={submitting || needsRegion}
              title={needsRegion ? t("region.picker.required") : undefined}
            >
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {submitting
                ? t("auth.authenticating")
                : view === "login"
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
