import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  Cloud,
  Cpu,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { commercialValueLabel } from "@/shared/commercial-value-label";
import {
  CommercialAccountSection,
  useCommercialEntitlementStore,
} from "@/modules/identity_access/public";
import {
  BYOK_MODEL_ROLES,
  CommercialInvocationSection,
  useClearByok,
  useCommercialModelAccessStatus,
  useCommercialModelCatalog,
  useCommercialModelDetails,
  useConfigureByok,
  useSelectCloudModels,
  type ByokModelAssignment,
  type ByokModelRole,
  type CommercialModelCatalogItem,
  type CommercialModelAccessMode,
} from "@/modules/model_usage/public";
import { CommercialUpdateSettingsSection } from "@/modules/platform_release/public";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BYOK_ROLE_LABEL_KEYS: Record<ByokModelRole, string> = {
  TEXT: "text",
  IMAGE_GENERATION: "imageGeneration",
  IMAGE_EDIT: "imageEdit",
  VIDEO_TEXT_TO_VIDEO: "videoTextToVideo",
  VIDEO_IMAGE_TO_VIDEO: "videoImageToVideo",
  VIDEO_FIRST_LAST_FRAME: "videoFirstLastFrame",
  VIDEO_IMAGE_REFERENCE: "videoImageReference",
  VIDEO_ALL_REFERENCE: "videoAllReference",
  VIDEO_EDIT: "videoEdit",
  AUDIO_SPEECH: "audioSpeech",
  AUDIO_VOICE_CLONE: "audioVoiceClone",
  AUDIO_MUSIC: "audioMusic",
  EMBEDDING: "embedding",
  RERANK: "rerank",
  MODERATION: "moderation",
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useTranslation();
  const bridgeAvailable = Boolean(window.aiAnimeDesktop?.commercial);
  const [tab, setTab] = useState("account");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[min(82vh,760px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-lg border border-border bg-background p-0 ring-0 sm:max-w-[760px]"
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{t("settings.title")}</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => value && setTab(value)}
          className="min-h-0 flex-1 gap-0"
        >
          <TabsList
            variant="line"
            className="h-10 w-full justify-start border-b border-border px-5"
          >
            <TabsTrigger value="account" className="flex-none px-3">
              <UserRound />
              {t("settings.tabs.account")}
            </TabsTrigger>
            <TabsTrigger value="models" className="flex-none px-3">
              <Cpu />
              {t("settings.tabs.models")}
            </TabsTrigger>
            <TabsTrigger value="invocations" className="flex-none px-3">
              <History />
              {t("settings.tabs.invocations")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="account" className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full [&_[data-slot=scroll-area-scrollbar]]:!w-1 [&_[data-slot=scroll-area-scrollbar]]:!border-l-0 [&_[data-slot=scroll-area-scrollbar]]:!p-0">
              <CommercialAccountSection
                active={open && tab === "account"}
                bridgeAvailable={bridgeAvailable}
              />
              <CommercialUpdateSettingsSection
                active={open && tab === "account"}
                bridgeAvailable={bridgeAvailable}
              />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="models" className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full [&_[data-slot=scroll-area-scrollbar]]:!w-1 [&_[data-slot=scroll-area-scrollbar]]:!border-l-0 [&_[data-slot=scroll-area-scrollbar]]:!p-0">
              <ModelAccessSection
                open={open && tab === "models"}
                bridgeAvailable={bridgeAvailable}
              />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="invocations" className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full [&_[data-slot=scroll-area-scrollbar]]:!w-1 [&_[data-slot=scroll-area-scrollbar]]:!border-l-0 [&_[data-slot=scroll-area-scrollbar]]:!p-0">
              <CommercialInvocationSection
                active={open && tab === "invocations"}
                bridgeAvailable={bridgeAvailable}
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end border-t border-border px-5 py-3.5">
          <DialogClose render={<Button variant="outline" size="sm" />}>
            {t("settings.close")}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModelAccessSection({
  open,
  bridgeAvailable,
}: {
  open: boolean;
  bridgeAvailable: boolean;
}) {
  const { t } = useTranslation();
  const entitlement = useCommercialEntitlementStore((state) => state.entitlement);
  const entitlementStatus = useCommercialEntitlementStore((state) => state.status);
  const entitlementError = useCommercialEntitlementStore((state) => state.error);
  const activateCurrentDevice = useCommercialEntitlementStore(
    (state) => state.activateCurrentDevice,
  );
  const access = useCommercialModelAccessStatus(open && bridgeAvailable);
  const configureByok = useConfigureByok();
  const selectCloud = useSelectCloudModels();
  const clearByok = useClearByok();
  const cloudAllowed = Boolean(entitlement?.capabilities.allowsCloudModels);
  const customAllowed = Boolean(entitlement?.capabilities.allowsCustomModels);
  const [selectedMode, setSelectedMode] =
    useState<CommercialModelAccessMode>("cloud");
  const catalog = useCommercialModelCatalog(
    undefined,
    open &&
      bridgeAvailable &&
      cloudAllowed &&
      (selectedMode === "cloud" ||
        (customAllowed && Boolean(access.data?.byokConfigured))),
  );
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelAssignments, setModelAssignments] = useState<
    ByokModelAssignment[]
  >([]);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (access.data?.byokBaseUrl) setBaseUrl(access.data.byokBaseUrl);
  }, [access.data?.byokBaseUrl]);
  useEffect(() => {
    setSelectedMode(access.data?.mode ?? "cloud");
  }, [access.data?.mode]);
  useEffect(() => {
    if (access.data) {
      setModelAssignments(access.data.byokModelAssignments);
    }
  }, [access.data]);

  const changeMode = async (mode: CommercialModelAccessMode) => {
    if (mode === selectedMode) return;
    setSelectedMode(mode);
    try {
      if (mode === "cloud") {
        await selectCloud.mutateAsync();
      } else if (access.data?.byokConfigured && baseUrl) {
        await configureByok.mutateAsync({ baseUrl });
      }
    } catch (error) {
      setSelectedMode(access.data?.mode ?? "cloud");
      toast.error(errorMessage(error, t("settings.modelAccess.saveFailed")));
    }
  };

  const saveByok = async () => {
    if (!baseUrl.trim()) {
      toast.error(t("settings.modelAccess.baseUrlRequired"));
      return;
    }
    if (modelAssignments.some((assignment) => !assignment.modelId.trim())) {
      toast.error(t("settings.modelAccess.modelIdRequired"));
      return;
    }
    try {
      await configureByok.mutateAsync({
        baseUrl: baseUrl.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        modelAssignments: modelAssignments.map((assignment) => ({
          ...assignment,
          modelId: assignment.modelId.trim(),
        })),
      });
      setApiKey("");
      setShowApiKey(false);
      toast.success(t("settings.modelAccess.saved"));
    } catch (error) {
      toast.error(errorMessage(error, t("settings.modelAccess.saveFailed")));
    }
  };

  if (!bridgeAvailable) {
    return (
      <section className="px-5 py-5">
        <SectionTitle icon={<Cpu className="size-4" />} title={t("settings.modelAccess.title")} />
        <InlineNotice>{t("settings.modelAccess.desktopRequired")}</InlineNotice>
      </section>
    );
  }

  return (
    <section className="px-5 py-5">
      <SectionTitle
        icon={<Cpu className="size-4" />}
        title={t("settings.modelAccess.title")}
        badge={
          entitlement?.license?.versionName ??
          entitlement?.license?.editionType ??
          undefined
        }
      />

      {entitlementStatus === "loading" || access.isLoading ? (
        <div className="mt-5 flex h-20 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      ) : null}

      {entitlementError ? <InlineNotice>{entitlementError}</InlineNotice> : null}

      {entitlement && !entitlement.capabilities.deviceActivated ? (
        <div className="mt-4 flex items-center justify-between gap-4 border-y border-border py-4">
          <div className="flex min-w-0 items-center gap-3">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span className="text-sm text-foreground">
              {t("settings.modelAccess.deviceNotActivated")}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={entitlementStatus === "loading"}
            onClick={() => {
              void activateCurrentDevice()
                .then(() => access.refetch())
                .catch((error: unknown) =>
                  toast.error(
                    errorMessage(error, t("settings.modelAccess.activationFailed")),
                  ),
                );
            }}
          >
            <ShieldCheck className="size-4" />
            {t("settings.modelAccess.activateDevice")}
          </Button>
        </div>
      ) : null}

      {cloudAllowed ? (
        <>
          <Tabs
            className="mt-5"
            value={selectedMode}
            onValueChange={(value) =>
              void changeMode(value as CommercialModelAccessMode)
            }
          >
            <TabsList>
              <TabsTrigger value="cloud">
                <Cloud className="size-4" />
                {t("settings.modelAccess.cloud")}
              </TabsTrigger>
              {customAllowed ? (
                <TabsTrigger value="byok">
                  <KeyRound className="size-4" />
                  {t("settings.modelAccess.byok")}
                </TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>

          {selectedMode === "cloud" ? (
            <ModelCatalogPanel
              className="mt-5"
              items={catalog.data?.items}
              loading={catalog.isLoading}
              error={catalog.error}
            />
          ) : customAllowed ? (
            <div className="mt-5 space-y-3 border-y border-border py-4">
              <FieldRow
                label={t("settings.modelAccess.baseUrl")}
                value={baseUrl}
                onChange={setBaseUrl}
                placeholder="https://api.example.com/v1"
              />
              <FieldRow
                secret
                revealed={showApiKey}
                onRevealChange={setShowApiKey}
                label={t("settings.modelAccess.apiKey")}
                value={apiKey}
                onChange={setApiKey}
                savedPreview={access.data?.byokApiKeyPreview}
                name="byok-api-key"
              />
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-muted-foreground">
                    {t("settings.modelAccess.modelAssignments")}
                  </Label>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setModelAssignments((current) => [
                        ...current,
                        { modelId: "", role: "TEXT" },
                      ])
                    }
                  >
                    <Plus className="size-3.5" />
                    {t("settings.modelAccess.addModel")}
                  </Button>
                </div>
                {modelAssignments.map((assignment, index) => (
                  <div
                    key={`${index}-${assignment.role}`}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(10rem,0.8fr)_2rem] items-center gap-2"
                  >
                    <Input
                      value={assignment.modelId}
                      aria-label={t("settings.modelAccess.modelId")}
                      placeholder={t("settings.modelAccess.modelId")}
                      onChange={(event) =>
                        setModelAssignments((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, modelId: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <Select
                      value={assignment.role}
                      onValueChange={(value) => {
                        if (!value) return;
                        setModelAssignments((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, role: value as ByokModelRole }
                              : item,
                          ),
                        );
                      }}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={t("settings.modelAccess.modelRole")}
                      >
                        <SelectValue>
                          {() =>
                            t(
                              `settings.modelAccess.roles.${BYOK_ROLE_LABEL_KEYS[assignment.role]}`,
                            )
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="end">
                        {BYOK_MODEL_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {t(
                              `settings.modelAccess.roles.${BYOK_ROLE_LABEL_KEYS[role]}`,
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t("settings.modelAccess.removeModel")}
                      title={t("settings.modelAccess.removeModel")}
                      onClick={() =>
                        setModelAssignments((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {access.data?.byokConfigured ? (
                <ModelCatalogPanel
                  items={catalog.data?.items}
                  loading={catalog.isLoading}
                  error={catalog.error}
                />
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                {access.data?.byokConfigured ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    title={t("settings.modelAccess.clearByok")}
                    aria-label={t("settings.modelAccess.clearByok")}
                    disabled={clearByok.isPending}
                    onClick={() => {
                      void clearByok
                        .mutateAsync()
                        .then(() => {
                          setBaseUrl("");
                          setApiKey("");
                          setModelAssignments([]);
                        })
                        .catch((error: unknown) =>
                          toast.error(
                            errorMessage(
                              error,
                              t("settings.modelAccess.clearFailed"),
                            ),
                          ),
                        );
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={saveByok}
                  disabled={configureByok.isPending}
                >
                  {configureByok.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  {t("settings.modelAccess.saveByok")}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ModelCatalogPanel({
  className,
  items,
  loading,
  error,
}: {
  className?: string;
  items?: readonly CommercialModelCatalogItem[];
  loading: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  const models = items ?? [];
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const details = useCommercialModelDetails(selectedSku, Boolean(selectedSku));

  return (
    <div className={cn("border-y border-border py-3", className)}>
      <div className="flex min-h-8 items-center justify-between gap-3 px-1">
        <span className="text-xs font-medium text-foreground">
          {t("settings.modelAccess.availableModels")}
        </span>
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {t("settings.modelAccess.modelCount", { count: models.length })}
          </span>
        )}
      </div>
      {!loading && models.length === 0 && !error ? (
        <p className="px-1 py-3 text-xs text-muted-foreground">
          {t("settings.modelAccess.noModels")}
        </p>
      ) : null}
      {models.map((model) => {
        const operation = model.operation.trim().toUpperCase() as ByokModelRole;
        const roleKey = BYOK_ROLE_LABEL_KEYS[operation];
        return (
          <div
            key={String(model.id)}
            className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_1.5rem] items-center gap-3 border-t border-border/70 px-1 py-2 first-of-type:border-t-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {model.displayName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{model.code}</p>
            </div>
            <span className="max-w-40 truncate text-[11px] text-muted-foreground">
              {roleKey
                ? t(`settings.modelAccess.roles.${roleKey}`)
                : commercialValueLabel(t, "operation", model.operation)}
            </span>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              title={t("settings.modelAccess.showDetails")}
              aria-label={t("settings.modelAccess.showDetails")}
              onClick={() => setSelectedSku(model.code)}
            >
              <Eye />
            </Button>
          </div>
        );
      })}
      {error ? (
        <p className="px-1 py-3 text-xs text-destructive">
          {errorMessage(error, t("settings.modelAccess.catalogFailed"))}
        </p>
      ) : null}
      {selectedSku ? (
        <ModelDetailsPanel
          model={details.data}
          loading={details.isLoading}
          error={details.error}
        />
      ) : null}
    </div>
  );
}

function ModelDetailsPanel({
  model,
  loading,
  error,
}: {
  model: CommercialModelCatalogItem | undefined;
  loading: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="flex h-16 items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="border-t border-border px-1 py-3 text-xs text-destructive">
        {errorMessage(error, t("settings.modelAccess.detailsFailed"))}
      </p>
    );
  }
  if (!model) return null;
  return (
    <div className="mt-2 border-t border-border px-1 pt-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <DetailValue label={t("settings.modelAccess.modelCode")} value={model.code} />
        <DetailValue
          label={t("settings.modelAccess.operation")}
          value={commercialValueLabel(t, "operation", model.operation)}
        />
        <DetailValue
          label={t("settings.modelAccess.unitsPerCall")}
          value={model.unitsPerCall === undefined ? "-" : String(model.unitsPerCall)}
        />
        <DetailValue
          label={t("settings.modelAccess.status")}
          value={commercialValueLabel(t, "status", model.status)}
        />
      </div>
      <JsonDetails
        label={t("settings.modelAccess.capabilities")}
        value={model.capabilities}
      />
      <JsonDetails
        label={t("settings.modelAccess.parameterSchema")}
        value={model.parameterSchema}
      />
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-foreground">{value}</p>
    </div>
  );
}

function JsonDetails({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown>;
}) {
  return (
    <details className="mt-3 border-t border-border/70 pt-2">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all bg-muted/45 p-2 text-[11px] text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  secret = false,
  revealed = false,
  onRevealChange,
  placeholder,
  savedPreview,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  revealed?: boolean;
  onRevealChange?: (value: boolean) => void;
  placeholder?: string;
  savedPreview?: string;
  name?: string;
}) {
  const { t } = useTranslation();
  const hasSavedSecret = Boolean(savedPreview && !value);
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
      <Label className="justify-start text-[11px] font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="relative min-w-0">
        <Input
          name={name}
          autoComplete={secret ? "new-password" : undefined}
          type={secret && !revealed ? "password" : "text"}
          value={value}
          placeholder={
            hasSavedSecret
              ? t("settings.secretSavedPlaceholder", { preview: savedPreview })
              : placeholder
          }
          onChange={(event) => onChange(event.target.value)}
          className={cn(secret && value && "pr-9", hasSavedSecret && "pr-16")}
        />
        {secret && value ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onRevealChange?.(!revealed)}
            aria-label={
              revealed
                ? t("settings.hideSecret")
                : t("settings.showSecret")
            }
          >
            {revealed ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        ) : hasSavedSecret ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
            {t("settings.secretSavedBadge")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {badge ? (
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function InlineNotice({ children }: React.PropsWithChildren) {
  return (
    <div className="mt-4 flex items-start gap-2 border-y border-warning/35 bg-warning/10 px-3 py-3 text-xs text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
