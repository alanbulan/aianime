import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  KeyRound,
  Laptop,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useAuthStore,
  useCommercialAuthStore,
  useCommercialEntitlementStore,
} from "@/modules/identity_access/composition";
import { commercialValueLabel } from "@/shared/commercial-value-label";
import { resetUserSessionState } from "@/lib/reset-region-state";

export function CommercialAccountSection({
  active,
  bridgeAvailable,
}: {
  active: boolean;
  bridgeAvailable: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = useCommercialEntitlementStore((state) => state.status);
  const entitlement = useCommercialEntitlementStore((state) => state.entitlement);
  const error = useCommercialEntitlementStore((state) => state.error);
  const refresh = useCommercialEntitlementStore((state) => state.refresh);
  const refreshLease = useCommercialEntitlementStore((state) => state.refreshLease);
  const activate = useCommercialEntitlementStore(
    (state) => state.activateCurrentDevice,
  );
  const deactivate = useCommercialEntitlementStore(
    (state) => state.deactivateCurrentDevice,
  );
  const profile = useCommercialAuthStore((state) => state.profile);
  const avatarDataUrl = useCommercialAuthStore((state) => state.avatarDataUrl);
  const loadProfile = useCommercialAuthStore((state) => state.loadProfile);
  const updateProfile = useCommercialAuthStore((state) => state.updateProfile);
  const uploadAvatar = useCommercialAuthStore((state) => state.uploadAvatar);
  const deleteAvatar = useCommercialAuthStore((state) => state.deleteAvatar);
  const changePassword = useCommercialAuthStore((state) => state.changePassword);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<0 | 1 | 2>(0);
  const [profileDescription, setProfileDescription] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!active || !bridgeAvailable || status !== "idle") return;
    void refresh().catch(() => undefined);
  }, [active, bridgeAvailable, refresh, status]);

  useEffect(() => {
    if (!active || !bridgeAvailable) return;
    void loadProfile().catch(() => undefined);
  }, [active, bridgeAvailable, loadProfile]);

  useEffect(() => {
    if (!profile) return;
    setNickname(profile.nickname);
    setEmail(profile.email);
    setPhone(profile.phone);
    setGender(profile.gender);
    setProfileDescription(profile.profileDescription);
  }, [profile]);

  const run = async (
    operation: () => Promise<unknown>,
    successMessage: string,
    fallback: string,
  ) => {
    try {
      await operation();
      toast.success(successMessage);
    } catch (operationError) {
      toast.error(errorMessage(operationError, fallback));
    }
  };

  if (!bridgeAvailable) {
    return <InlineNotice>{t("settings.account.desktopRequired")}</InlineNotice>;
  }

  return (
    <section className="space-y-5 px-5 py-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">
            {t("settings.account.profileTitle")}
          </h3>
          <div className="flex items-center gap-2">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void uploadAvatar(file)
                  .then(() => toast.success(t("settings.account.avatarUpdated")))
                  .catch((uploadError: unknown) =>
                    toast.error(
                      errorMessage(
                        uploadError,
                        t("settings.account.avatarUpdateFailed"),
                      ),
                    ),
                  );
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => avatarInputRef.current?.click()}
            >
              <Camera />
              {t("settings.account.changeAvatar")}
            </Button>
            {avatarDataUrl ? (
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title={t("settings.account.deleteAvatar")}
                aria-label={t("settings.account.deleteAvatar")}
                onClick={() =>
                  void run(
                    deleteAvatar,
                    t("settings.account.avatarDeleted"),
                    t("settings.account.avatarDeleteFailed"),
                  )
                }
              >
                <Trash2 />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3 border-y border-border py-3">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-sm text-muted-foreground">
            {avatarDataUrl ? (
              <img src={avatarDataUrl} alt="" className="size-full object-cover" />
            ) : (
              (profile?.nickname || profile?.username || "?").slice(0, 1).toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {profile?.username ?? "-"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.deptName || t("settings.account.noDepartment")}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ProfileField label={t("settings.account.nickname")}>
            <Input value={nickname} maxLength={64} onChange={(event) => setNickname(event.target.value)} />
          </ProfileField>
          <ProfileField label={t("settings.account.email")}>
            <Input type="email" value={email} maxLength={255} onChange={(event) => setEmail(event.target.value)} />
          </ProfileField>
          <ProfileField label={t("settings.account.phone")}>
            <Input value={phone} maxLength={32} onChange={(event) => setPhone(event.target.value)} />
          </ProfileField>
          <ProfileField label={t("settings.account.gender")}>
            <Select value={String(gender)} onValueChange={(value) => setGender(Number(value) as 0 | 1 | 2)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t("settings.account.genderUnknown")}</SelectItem>
                <SelectItem value="1">{t("settings.account.genderMale")}</SelectItem>
                <SelectItem value="2">{t("settings.account.genderFemale")}</SelectItem>
              </SelectContent>
            </Select>
          </ProfileField>
        </div>
        <ProfileField label={t("settings.account.profileDescription")}>
          <Textarea
            value={profileDescription}
            maxLength={1000}
            onChange={(event) => setProfileDescription(event.target.value)}
          />
        </ProfileField>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!profile || savingProfile}
            onClick={() => {
              setSavingProfile(true);
              void updateProfile({ nickname, email, phone, gender, profileDescription })
                .then(() => toast.success(t("settings.account.profileSaved")))
                .catch((saveError: unknown) =>
                  toast.error(errorMessage(saveError, t("settings.account.profileSaveFailed"))),
                )
                .finally(() => setSavingProfile(false));
            }}
          >
            {savingProfile ? <Loader2 className="animate-spin" /> : <Save />}
            {t("settings.account.saveProfile")}
          </Button>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            {t("settings.account.changePassword")}
          </h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            placeholder={t("settings.account.oldPassword")}
            aria-label={t("settings.account.oldPassword")}
          />
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder={t("settings.account.newPassword")}
            aria-label={t("settings.account.newPassword")}
          />
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder={t("settings.account.confirmPassword")}
            aria-label={t("settings.account.confirmPassword")}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
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
      </div>

      <div className="border-t border-border pt-5">
        <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Laptop className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            {t("settings.account.title")}
          </h3>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          title={t("settings.account.refresh")}
          aria-label={t("settings.account.refresh")}
          disabled={status === "loading"}
          onClick={() =>
            void run(
              refresh,
              t("settings.account.refreshed"),
              t("settings.account.refreshFailed"),
            )
          }
        >
          <RefreshCw className={status === "loading" ? "animate-spin" : ""} />
        </Button>
        </div>

      {status === "loading" && !entitlement ? (
        <div className="flex h-28 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : null}
      {error ? <InlineNotice>{error}</InlineNotice> : null}

      {entitlement ? (
        <>
          <div className="divide-y divide-border border-y border-border">
            <InfoRow
              label={t("settings.account.license")}
              value={
                entitlement.license?.versionName ??
                entitlement.license?.versionCode ??
                t("settings.account.unassigned")
              }
              detail={commercialValueLabel(
                t,
                "edition",
                entitlement.license?.editionType,
              )}
            />
            <InfoRow
              label={t("settings.account.licenseStatus")}
              value={
                entitlement.license?.status
                  ? commercialValueLabel(t, "status", entitlement.license.status)
                  : t("settings.account.unknown")
              }
              detail={formatDate(entitlement.license?.expiresAt)}
            />
            <InfoRow
              label={t("settings.account.device")}
              value={entitlement.device?.name ?? t("settings.account.notActivated")}
              detail={commercialValueLabel(
                t,
                "status",
                entitlement.activation?.status ?? entitlement.device?.status,
              )}
            />
            <InfoRow
              label={t("settings.account.activatedAt")}
              value={formatDate(entitlement.activation?.activatedAt) ?? "-"}
              detail={formatDate(entitlement.activation?.lastSeenAt)}
            />
            <InfoRow
              label={t("settings.account.leaseExpiresAt")}
              value={formatDate(entitlement.lease?.expiresAt) ?? "-"}
              detail={entitlement.lease?.keyId}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {entitlement.capabilities.deviceActivated ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={status === "loading" || !entitlement.lease}
                  onClick={() =>
                    void run(
                      refreshLease,
                      t("settings.account.leaseRefreshed"),
                      t("settings.account.leaseRefreshFailed"),
                    )
                  }
                >
                  <ShieldCheck />
                  {t("settings.account.refreshLease")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={status === "loading"}
                  onClick={() => setConfirmDeactivate(true)}
                >
                  <Unplug />
                  {t("settings.account.deactivate")}
                </Button>
              </>
            ) : entitlement.license ? (
              <Button
                type="button"
                size="sm"
                disabled={status === "loading"}
                onClick={() =>
                  void run(
                    activate,
                    t("settings.account.activated"),
                    t("settings.account.activationFailed"),
                  )
                }
              >
                <ShieldCheck />
                {t("settings.account.activate")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.account.deactivateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.account.deactivateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDeactivate(false);
                void run(
                  () => deactivate(t("settings.account.deactivateReason")),
                  t("settings.account.deactivated"),
                  t("settings.account.deactivateFailed"),
                );
              }}
            >
              {t("settings.account.confirmDeactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </section>
  );
}

function ProfileField({
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

function InfoRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="grid min-h-12 grid-cols-[9rem_minmax(0,1fr)] items-center gap-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right">
        <p className="truncate text-sm text-foreground">{value}</p>
        {detail ? (
          <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}

function InlineNotice({ children }: React.PropsWithChildren) {
  return (
    <div className="mx-5 mt-5 border-y border-warning/35 bg-warning/10 px-3 py-3 text-xs text-warning">
      {children}
    </div>
  );
}

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
