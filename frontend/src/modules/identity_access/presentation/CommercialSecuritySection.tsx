// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetUserSessionState } from "@/lib/reset-region-state";
import {
  useAuthStore,
  useCommercialAuthStore,
  useCommercialEntitlementStore,
} from "@/modules/identity_access/composition";

export function CommercialSecuritySection({
  bridgeAvailable,
}: {
  bridgeAvailable: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const changePassword = useCommercialAuthStore((state) => state.changePassword);
  const [changingPassword, setChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  if (!bridgeAvailable) {
    return <InlineNotice>{t("settings.account.desktopRequired")}</InlineNotice>;
  }

  return (
    <section className="space-y-5 border-t border-border px-6 py-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <KeyRound className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-medium text-foreground">
            {t("settings.account.changePassword")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("settings.account.passwordHint")}
          </p>
        </div>
      </div>

      <div className="max-w-xl space-y-4 border-y border-border py-5">
        <PasswordField label={t("settings.account.oldPassword")}>
          <Input
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
          />
        </PasswordField>
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField label={t("settings.account.newPassword")}>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </PasswordField>
          <PasswordField label={t("settings.account.confirmPassword")}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </PasswordField>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button
          type="button"
          size="default"
          className="min-w-28"
          disabled={changingPassword || !oldPassword || !newPassword || !confirmPassword}
          onClick={() => {
            if (newPassword !== confirmPassword) {
              toast.error(t("settings.account.passwordMismatch"));
              return;
            }
            if (newPassword.length < 8 || newPassword.length > 128) {
              toast.error(t("settings.account.passwordLength"));
              return;
            }
            setChangingPassword(true);
            void changePassword(oldPassword, newPassword)
              .then(async () => {
                useAuthStore.getState().reset();
                useCommercialEntitlementStore.getState().reset();
                resetUserSessionState({ queryClient });
                toast.success(t("settings.account.passwordChanged"));
                await navigate({ to: "/login", replace: true });
              })
              .catch((passwordError: unknown) =>
                toast.error(
                  errorMessage(
                    passwordError,
                    t("settings.account.passwordChangeFailed"),
                  ),
                ),
              )
              .finally(() => setChangingPassword(false));
          }}
        >
          {changingPassword ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {t("settings.account.changePassword")}
        </Button>
      </div>
    </section>
  );
}

function PasswordField({
  children,
  label,
}: React.PropsWithChildren<{ label: string }>) {
  return (
    <label className="space-y-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function InlineNotice({ children }: React.PropsWithChildren) {
  return (
    <div className="mx-6 mt-6 border-y border-warning/35 bg-warning/10 px-3 py-3 text-xs text-warning">
      {children}
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
