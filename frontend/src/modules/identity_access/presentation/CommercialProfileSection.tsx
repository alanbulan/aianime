// Copyright (c) 2026 AI anime
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";
import { useCommercialAuthStore } from "@/modules/identity_access/composition";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function CommercialProfileSection({
  active,
  bridgeAvailable,
}: {
  active: boolean;
  bridgeAvailable: boolean;
}) {
  const { t } = useTranslation();
  const avatarInputId = useId();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const profile = useCommercialAuthStore((state) => state.profile);
  const avatarDataUrl = useCommercialAuthStore((state) => state.avatarDataUrl);
  const loadProfile = useCommercialAuthStore((state) => state.loadProfile);
  const updateProfile = useCommercialAuthStore((state) => state.updateProfile);
  const uploadAvatar = useCommercialAuthStore((state) => state.uploadAvatar);
  const deleteAvatar = useCommercialAuthStore((state) => state.deleteAvatar);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<0 | 1 | 2>(0);
  const [profileDescription, setProfileDescription] = useState("");

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

  if (!bridgeAvailable) {
    return <InlineNotice>{t("settings.account.desktopRequired")}</InlineNotice>;
  }

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    const contentType = resolveAvatarContentType(file);
    if (!contentType) {
      toast.error(t("settings.account.avatarTypeInvalid"));
      return;
    }
    if (file.size < 1 || file.size > MAX_AVATAR_BYTES) {
      toast.error(t("settings.account.avatarSizeInvalid"));
      return;
    }
    const normalizedFile =
      file.type.toLowerCase() === contentType
        ? file
        : new File([file], file.name, {
            type: contentType,
            lastModified: file.lastModified,
          });
    setAvatarPending(true);
    try {
      await uploadAvatar(normalizedFile);
      toast.success(t("settings.account.avatarUpdated"));
    } catch (uploadError) {
      toast.error(
        errorMessage(uploadError, t("settings.account.avatarUpdateFailed")),
      );
    } finally {
      setAvatarPending(false);
    }
  };

  return (
    <section className="space-y-5 px-6 py-6">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          {t("settings.account.profileTitle")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("settings.account.profileHint")}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
        <div className="flex min-w-0 items-center gap-3">
          <input
            ref={avatarInputRef}
            id={avatarInputId}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={avatarPending}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void handleAvatarFile(file);
            }}
          />
          <label
            htmlFor={avatarPending ? undefined : avatarInputId}
            title={t("settings.account.changeAvatar")}
            role="button"
            tabIndex={avatarPending ? -1 : 0}
            aria-label={t("settings.account.changeAvatar")}
            aria-disabled={avatarPending}
            aria-busy={avatarPending}
            onKeyDown={(event) => {
              if (avatarPending) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              avatarInputRef.current?.click();
            }}
            className={cn(
              "group relative flex size-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-base text-muted-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              avatarPending && "pointer-events-none opacity-60",
            )}
          >
            {avatarDataUrl ? (
              <img src={avatarDataUrl} alt="" className="size-full object-cover" />
            ) : (
              (profile?.nickname || profile?.username || "?").slice(0, 1).toUpperCase()
            )}
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
                avatarPending && "opacity-100",
              )}
            >
              {avatarPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
            </span>
          </label>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {profile?.username ?? "-"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.deptName || t("settings.account.noDepartment")}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("settings.account.avatarHint")}
            </p>
          </div>
        </div>
        {avatarDataUrl ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={avatarPending}
            title={t("settings.account.deleteAvatar")}
            aria-label={t("settings.account.deleteAvatar")}
            onClick={() => {
              setAvatarPending(true);
              void deleteAvatar()
                .then(() => toast.success(t("settings.account.avatarDeleted")))
                .catch((deleteError: unknown) =>
                  toast.error(
                    errorMessage(
                      deleteError,
                      t("settings.account.avatarDeleteFailed"),
                    ),
                  ),
                )
                .finally(() => setAvatarPending(false));
            }}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        <ProfileField label={t("settings.account.nickname")}>
          <Input
            value={nickname}
            maxLength={64}
            onChange={(event) => setNickname(event.target.value)}
          />
        </ProfileField>
        <ProfileField label={t("settings.account.email")}>
          <Input
            type="email"
            value={email}
            maxLength={255}
            onChange={(event) => setEmail(event.target.value)}
          />
        </ProfileField>
        <ProfileField label={t("settings.account.phone")}>
          <Input
            value={phone}
            maxLength={32}
            onChange={(event) => setPhone(event.target.value)}
          />
        </ProfileField>
        <ProfileField label={t("settings.account.gender")}>
          <Select
            value={String(gender)}
            onValueChange={(value) => setGender(Number(value) as 0 | 1 | 2)}
          >
            <SelectTrigger className="w-full" aria-label={t("settings.account.gender")}>
              <SelectValue />
            </SelectTrigger>
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
          className="min-h-24 resize-y"
          onChange={(event) => setProfileDescription(event.target.value)}
        />
      </ProfileField>

      <div className="flex justify-end border-t border-border pt-4">
        <Button
          type="button"
          size="default"
          className="min-w-28"
          disabled={!profile || savingProfile}
          onClick={() => {
            setSavingProfile(true);
            void updateProfile({ nickname, email, phone, gender, profileDescription })
              .then(() => toast.success(t("settings.account.profileSaved")))
              .catch((saveError: unknown) =>
                toast.error(
                  errorMessage(saveError, t("settings.account.profileSaveFailed")),
                ),
              )
              .finally(() => setSavingProfile(false));
          }}
        >
          {savingProfile ? <Loader2 className="animate-spin" /> : <Save />}
          {t("settings.account.saveProfile")}
        </Button>
      </div>
    </section>
  );
}

export function resolveAvatarContentType(
  file: Pick<File, "name" | "type">,
): string | null {
  const declared = file.type.trim().toLowerCase();
  if (AVATAR_CONTENT_TYPES.has(declared)) return declared;
  const extension = file.name.trim().toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
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
