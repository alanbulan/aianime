import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cloud,
  Cpu,
  Eye,
  EyeOff,
  History,
  Info,
  KeyRound,
  Laptop,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { commercialValueLabel } from "@/shared/commercial-value-label";
import {
  CommercialLicenseSection,
  CommercialProfileSection,
  CommercialSecuritySection,
  useCommercialEntitlementStore,
} from "@/modules/identity_access/public";
import {
  BYOK_MODEL_ROLES,
  BYOK_PROVIDER_PROTOCOLS,
  catalogRouteSelector,
  commercialModelParameterDeclarations,
  commercialModelParameterOverrideDeclarations,
  commercialModelRuntimeMetadata,
  effectiveModelRuntimeSettings,
  commercialModelRoles,
  CommercialInvocationSection,
  formatModelContextWindow,
  formatReasoningEffort,
  formatReasoningEffortOption,
  modelParameterOverrideDraft,
  parseModelCapabilityOverridesJsonDraft,
  parseModelParameterOverrideDrafts,
  parseModelParameterOverridesJsonDraft,
  useClearByok,
  useDiscoverByokProviderModels,
  useCommercialModelAccessStatus,
  useCommercialModelCatalog,
  useCommercialModelDetails,
  useConfigureByok,
  useSelectCloudModels,
  type ByokModelAssignment,
  type ByokDiscoveredModelMetadata,
  type ByokModelRole,
  type ByokProviderProtocol,
  type CommercialModelCatalogItem,
  type ModelParameterDeclaration,
  type ModelRuntimeOverrides,
  type ByokProviderStatus,
} from "@/modules/model_usage/public";
import { CommercialUpdateSettingsSection } from "@/modules/platform_release/public";
import { RuntimeDependenciesSection } from "@/components/runtime-dependencies-section";

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
  AUDIO_VOICE_DESIGN: "audioVoiceDesign",
  AUDIO_MUSIC: "audioMusic",
  EMBEDDING: "embedding",
};

const BYOK_PROTOCOL_LABEL_KEYS: Record<ByokProviderProtocol, string> = {
  OPENAI_COMPATIBLE: "openaiCompatible",
  ANTHROPIC: "anthropic",
  GEMINI: "gemini",
};

const GEMINI_BYOK_MODEL_ROLES: readonly ByokModelRole[] = [
  "TEXT",
  "IMAGE_GENERATION",
  "IMAGE_EDIT",
  "EMBEDDING",
];

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useTranslation();
  const bridgeAvailable = Boolean(window.aiAnimeDesktop?.commercial);
  const [tab, setTab] = useState("profile");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[min(84vh,780px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-lg border border-border bg-background p-0 ring-0 sm:max-w-[840px]"
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
            className="h-11 w-full justify-start gap-1 overflow-x-auto border-b border-border px-5"
          >
            <TabsTrigger value="profile" className="flex-none px-3">
              <UserRound />
              {t("settings.tabs.profile")}
            </TabsTrigger>
            <TabsTrigger value="license" className="flex-none px-3">
              <Laptop />
              {t("settings.tabs.license")}
            </TabsTrigger>
            <TabsTrigger value="models" className="flex-none px-3">
              <Cpu />
              {t("settings.tabs.models")}
            </TabsTrigger>
            <TabsTrigger value="invocations" className="flex-none px-3">
              <History />
              {t("settings.tabs.invocations")}
            </TabsTrigger>
            <TabsTrigger value="dependencies" className="flex-none px-3">
              <PackageCheck />
              {t("settings.tabs.dependencies")}
            </TabsTrigger>
            <TabsTrigger value="update" className="flex-none px-3">
              <RefreshCw />
              {t("settings.tabs.update")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full [&_[data-slot=scroll-area-scrollbar]]:!w-1 [&_[data-slot=scroll-area-scrollbar]]:!border-l-0 [&_[data-slot=scroll-area-scrollbar]]:!p-0">
              <CommercialProfileSection
                active={open && tab === "profile"}
                bridgeAvailable={bridgeAvailable}
              />
              <CommercialSecuritySection bridgeAvailable={bridgeAvailable} />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="license" className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full [&_[data-slot=scroll-area-scrollbar]]:!w-1 [&_[data-slot=scroll-area-scrollbar]]:!border-l-0 [&_[data-slot=scroll-area-scrollbar]]:!p-0">
              <CommercialLicenseSection
                active={open && tab === "license"}
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
          <TabsContent value="dependencies" className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full [&_[data-slot=scroll-area-scrollbar]]:!w-1 [&_[data-slot=scroll-area-scrollbar]]:!border-l-0 [&_[data-slot=scroll-area-scrollbar]]:!p-0">
              <RuntimeDependenciesSection active={open && tab === "dependencies"} />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="update" className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full [&_[data-slot=scroll-area-scrollbar]]:!w-1 [&_[data-slot=scroll-area-scrollbar]]:!border-l-0 [&_[data-slot=scroll-area-scrollbar]]:!p-0">
              <CommercialUpdateSettingsSection
                active={open && tab === "update"}
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
  const resetInvalidAccess = useClearByok();
  const selectCloud = useSelectCloudModels();
  const cloudAllowed = Boolean(entitlement?.capabilities.allowsCloudModels);
  const customAllowed = Boolean(entitlement?.capabilities.allowsCustomModels);
  const cloudCatalog = useCommercialModelCatalog(
    undefined,
    open && bridgeAvailable && cloudAllowed,
    "cloud",
  );
  const [cloudModelAssignments, setCloudModelAssignments] = useState<
    ByokModelAssignment[]
  >([]);
  const [modelSourceTab, setModelSourceTab] = useState<"cloud" | "byok">(
    "cloud",
  );

  useEffect(() => {
    if (access.data) {
      setCloudModelAssignments(access.data.cloudModelAssignments ?? []);
    }
  }, [access.data]);

  useEffect(() => {
    if (!cloudAllowed && customAllowed) setModelSourceTab("byok");
    if (cloudAllowed && !customAllowed) setModelSourceTab("cloud");
  }, [cloudAllowed, customAllowed]);

  const saveCloudModels = async () => {
    const roles = BYOK_MODEL_ROLES.filter((role) =>
      (cloudCatalog.data?.items ?? []).some((model) =>
        commercialModelRoles(model).includes(role),
      ),
    );
    const assignments = resolveCloudAssignments(
      cloudCatalog.data?.items ?? [],
      cloudModelAssignments,
    );
    if (roles.some((role) => !assignments.some((item) => item.role === role))) {
      toast.error(t("settings.modelAccess.cloudModelRequired"));
      return;
    }
    try {
      const status = await selectCloud.mutateAsync(assignments);
      setCloudModelAssignments(status.cloudModelAssignments);
      toast.success(t("settings.modelAccess.cloudSaved"));
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
        hint={t("settings.modelAccess.sourceDescription")}
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

      {access.error ? (
        <InlineNotice>
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {errorMessage(access.error, t("settings.modelAccess.loadFailed"))}
              {` ${t("settings.modelAccess.invalidConfigHint")}`}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={resetInvalidAccess.isPending}
              onClick={() => {
                void resetInvalidAccess.mutateAsync(undefined)
                  .then(() => toast.success(t("settings.modelAccess.resetSucceeded")))
                  .catch((error: unknown) =>
                    toast.error(
                      errorMessage(error, t("settings.modelAccess.resetFailed")),
                    ),
                  );
              }}
            >
              {t("settings.modelAccess.resetInvalid")}
            </Button>
          </span>
        </InlineNotice>
      ) : null}

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

      {cloudAllowed || customAllowed ? (
        <Tabs
          value={modelSourceTab}
          onValueChange={(value) =>
            value && setModelSourceTab(value as "cloud" | "byok")
          }
          className="mt-5 gap-0"
        >
          <TabsList
            className={cn(
              "grid w-full",
              cloudAllowed && customAllowed ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {cloudAllowed ? (
              <TabsTrigger value="cloud">
                <Cloud />
                {t("settings.modelAccess.cloud")}
              </TabsTrigger>
            ) : null}
            {customAllowed ? (
              <TabsTrigger value="byok">
                <KeyRound />
                {t("settings.modelAccess.byok")}
              </TabsTrigger>
            ) : null}
          </TabsList>
          {cloudAllowed ? (
            <TabsContent value="cloud">
              <CloudModelAssignmentPanel
                className="mt-4"
                items={cloudCatalog.data?.items}
                assignments={cloudModelAssignments}
                loading={cloudCatalog.isLoading}
                error={cloudCatalog.error}
                saving={selectCloud.isPending}
                onAssignmentsChange={setCloudModelAssignments}
                onSave={() => void saveCloudModels()}
              />
            </TabsContent>
          ) : null}
          {customAllowed ? (
            <TabsContent value="byok">
              <ByokProvidersPanel
                providers={access.data?.byokProviders ?? []}
                enabled={open && bridgeAvailable && modelSourceTab === "byok"}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      ) : null}
    </section>
  );
}

function ByokProvidersPanel({
  providers,
  enabled,
}: {
  providers: readonly ByokProviderStatus[];
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const configureByok = useConfigureByok();
  const clearByok = useClearByok();
  const [providerId, setProviderId] = useState("");
  const [name, setName] = useState("");
  const [protocol, setProtocol] =
    useState<ByokProviderProtocol>("OPENAI_COMPATIBLE");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [providerEnabled, setProviderEnabled] = useState(true);
  const [providerPriority, setProviderPriority] = useState(100);
  const [modelAssignments, setModelAssignments] = useState<ByokModelAssignment[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const providerModels = useDiscoverByokProviderModels();
  const activeCatalog = useCommercialModelCatalog(undefined, enabled, "active");

  useEffect(() => {
    if (!providerId && providers.length > 0) setProviderId(providers[0].id);
  }, [providerId, providers]);

  useEffect(() => {
    if (!selectedProvider) return;
    setName(selectedProvider.name);
    setProtocol(selectedProvider.protocol);
    setBaseUrl(selectedProvider.baseUrl);
    setApiKey("");
    setShowApiKey(false);
    setProviderEnabled(selectedProvider.enabled);
    setProviderPriority(selectedProvider.priority);
    setModelAssignments(selectedProvider.modelAssignments);
  }, [selectedProvider]);

  const startNewProvider = () => {
    providerModels.reset();
    setProviderId(`provider-${Date.now()}`);
    setName("");
    setProtocol("OPENAI_COMPATIBLE");
    setBaseUrl("");
    setApiKey("");
    setShowApiKey(false);
    setProviderEnabled(true);
    setProviderPriority(100);
    setModelAssignments([]);
  };

  const discoverProviderModels = async () => {
    if (!baseUrl.trim()) {
      toast.error(t("settings.modelAccess.baseUrlRequired"));
      return;
    }
    try {
      const discovered = await providerModels.mutateAsync({
        ...(providerId.trim() ? { providerId: providerId.trim() } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        protocol,
        baseUrl: baseUrl.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setModelAssignments((current) => current.map((assignment) => (
        withDiscoveredModelMetadata(
          assignment,
          assignment.modelId,
          discovered.modelMetadata,
          protocol,
        )
      )));
    } catch (error) {
      toast.error(
        errorMessage(error, t("settings.modelAccess.byokValidationFailed")),
      );
    }
  };

  const saveProvider = async () => {
    if (!name.trim()) {
      toast.error(t("settings.modelAccess.providerNameRequired"));
      return;
    }
    if (!baseUrl.trim()) {
      toast.error(t("settings.modelAccess.baseUrlRequired"));
      return;
    }
    if (modelAssignments.some((assignment) => !assignment.modelId.trim())) {
      toast.error(t("settings.modelAccess.modelIdRequired"));
      return;
    }
    if (
      protocol !== "OPENAI_COMPATIBLE" &&
      modelAssignments.some((assignment) => assignment.role !== "TEXT")
    ) {
      toast.error(t("settings.modelAccess.nativeProtocolTextOnly"));
      return;
    }
    try {
      const status = await configureByok.mutateAsync({
        providerId,
        name: name.trim(),
        protocol,
        baseUrl: baseUrl.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        enabled: providerEnabled,
        priority: providerPriority,
        modelAssignments: modelAssignments.map((assignment) => ({
          ...assignment,
          modelId: assignment.modelId.trim(),
        })),
      });
      const saved = status.byokProviders.find((provider) => provider.id === providerId);
      if (saved) setProviderId(saved.id);
      setApiKey("");
      setShowApiKey(false);
      toast.success(t("settings.modelAccess.saved"));
    } catch (error) {
      toast.error(errorMessage(error, t("settings.modelAccess.saveFailed")));
    }
  };

  const removeProvider = async () => {
    if (!selectedProvider) return;
    try {
      const status = await clearByok.mutateAsync(selectedProvider.id);
      const next = status.byokProviders[0];
      if (next) {
        setProviderId(next.id);
      } else {
        startNewProvider();
      }
      toast.success(t("settings.modelAccess.providerRemoved"));
    } catch (error) {
      toast.error(errorMessage(error, t("settings.modelAccess.clearFailed")));
    }
  };

  return (
    <div className="mt-4 border-y border-border py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">
            {t("settings.modelAccess.byokProviders")}
          </p>
          <InfoHint
            label={t("settings.modelAccess.byokProviders")}
            text={t("settings.modelAccess.byokProvidersDescription")}
          />
        </div>
        <Button type="button" size="xs" variant="outline" onClick={startNewProvider}>
          <Plus className="size-3.5" />
          {t("settings.modelAccess.addProvider")}
        </Button>
      </div>

      {providers.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {providers.map((provider) => (
            <Button
              key={provider.id}
              type="button"
              size="xs"
              variant={provider.id === providerId ? "default" : "outline"}
              onClick={() => {
                providerModels.reset();
                setProviderId(provider.id);
              }}
            >
              <KeyRound className="size-3.5" />
              {provider.name}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 space-y-3 rounded-md border border-border bg-muted/15 p-4">
        <FieldRow
          label={t("settings.modelAccess.providerName")}
          value={name}
          onChange={setName}
          placeholder={t("settings.modelAccess.providerNamePlaceholder")}
        />
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
          <Label className="justify-start text-[11px] font-normal text-muted-foreground">
            {t("settings.modelAccess.providerProtocol")}
          </Label>
          <Select
            value={protocol}
            onValueChange={(value) => {
              if (!value) return;
              const nextProtocol = value as ByokProviderProtocol;
              setProtocol(nextProtocol);
              setModelAssignments((current) => current.map((assignment) => {
                const roles = byokModelRoleOptions(nextProtocol, assignment);
                return roles.includes(assignment.role) || !roles[0]
                  ? assignment
                  : { ...assignment, role: roles[0] };
              }));
            }}
          >
            <SelectTrigger className="w-full" aria-label={t("settings.modelAccess.providerProtocol")}>
              <SelectValue>
                {() =>
                  t(
                    `settings.modelAccess.protocols.${BYOK_PROTOCOL_LABEL_KEYS[protocol]}`,
                  )
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BYOK_PROVIDER_PROTOCOLS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(
                    `settings.modelAccess.protocols.${BYOK_PROTOCOL_LABEL_KEYS[value]}`,
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FieldRow
          label={t("settings.modelAccess.baseUrl")}
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder={
            protocol === "ANTHROPIC"
              ? "https://api.anthropic.com/v1"
              : protocol === "GEMINI"
                ? "https://generativelanguage.googleapis.com/v1beta"
                : "https://api.example.com/v1"
          }
        />
        <FieldRow
          secret
          revealed={showApiKey}
          onRevealChange={setShowApiKey}
          label={t("settings.modelAccess.apiKey")}
          value={apiKey}
          onChange={setApiKey}
          savedPreview={selectedProvider?.apiKeyPreview}
          name={`byok-api-key-${providerId}`}
        />
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
          <div className="flex items-center gap-1">
            <Label className="justify-start text-[11px] font-normal text-muted-foreground">
              {t("settings.modelAccess.providerPriority")}
            </Label>
            <InfoHint
              label={t("settings.modelAccess.priorityHintLabel")}
              text={t("settings.modelAccess.priorityHint")}
            />
          </div>
          <div className="flex items-center gap-4">
            <Input
              className="w-28"
              type="number"
              min={1}
              max={9999}
              step={1}
              value={providerPriority}
              onChange={(event) =>
                setProviderPriority(
                  Math.min(
                    9999,
                    Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                  ),
                )
              }
            />
            <label className="flex items-center gap-2 text-xs text-foreground">
              <Checkbox
                checked={providerEnabled}
                onCheckedChange={(checked) => setProviderEnabled(checked === true)}
              />
              {t("settings.modelAccess.providerEnabled")}
            </label>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">
                {t("settings.modelAccess.modelAssignments")}
              </Label>
              <InfoHint
                label={t("settings.modelAccess.priorityHintLabel")}
                text={t("settings.modelAccess.priorityHint")}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={!enabled || providerModels.isPending}
                onClick={() => void discoverProviderModels()}
              >
                {providerModels.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                {t("settings.modelAccess.fetchModels")}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() =>
                  setModelAssignments((current) => [
                    ...current,
                    {
                      modelId: "",
                      role: "TEXT",
                      priority: current.length + 100,
                      enabled: true,
                    },
                  ])
                }
              >
                <Plus className="size-3.5" />
                {t("settings.modelAccess.addModel")}
              </Button>
            </div>
          </div>
          {providerModels.data ? (
            <p className="text-[11px] text-muted-foreground">
              {t("settings.modelAccess.providerModelCount", {
                count: providerModels.data.models.length,
              })}
            </p>
          ) : null}
          {providerModels.error ? (
            <p className="text-xs text-destructive">
              {errorMessage(providerModels.error, t("settings.modelAccess.byokValidationFailed"))}
            </p>
          ) : null}
          {modelAssignments.map((assignment, index) => (
            <div
              key={`${index}-${assignment.role}`}
              className="grid grid-cols-[minmax(0,1fr)_minmax(10rem,0.75fr)_5rem_auto_2rem] items-start gap-2"
            >
              <div className="min-w-0">
                <ModelIdInput
                  value={assignment.modelId}
                  options={providerModels.data?.models ?? []}
                  label={t("settings.modelAccess.modelId")}
                  placeholder={t("settings.modelAccess.modelId")}
                  onChange={(modelId) =>
                    setModelAssignments((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? withDiscoveredModelMetadata(
                              item,
                              modelId,
                              providerModels.data?.modelMetadata ?? [],
                              protocol,
                            )
                          : item,
                      ),
                    )
                  }
                />
                <div className="flex min-h-5 items-center gap-1">
                  <ModelMetadataInline
                    model={resolveByokCatalogModel(
                      activeCatalog.data?.items ?? [],
                      providerId,
                      assignment.modelId,
                      assignment.role,
                    )}
                    assignment={assignment}
                  />
                  <ModelRuntimeOverridesButton
                    assignment={assignment}
                    model={resolveByokCatalogModel(
                      activeCatalog.data?.items ?? [],
                      providerId,
                      assignment.modelId,
                      assignment.role,
                    )}
                    allowUndeclaredParameterOverrides
                    onChange={(next) =>
                      setModelAssignments((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? next : item,
                        ),
                      )
                    }
                  />
                </div>
              </div>
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
                <SelectTrigger className="w-full" aria-label={t("settings.modelAccess.modelRole")}>
                  <SelectValue>
                    {() =>
                      t(`settings.modelAccess.roles.${BYOK_ROLE_LABEL_KEYS[assignment.role]}`)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  {byokModelRoleOptions(protocol, assignment).map((role) => (
                    <SelectItem key={role} value={role}>
                      {t(`settings.modelAccess.roles.${BYOK_ROLE_LABEL_KEYS[role]}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                max={9999}
                step={1}
                value={assignment.priority}
                aria-label={t("settings.modelAccess.modelPriority")}
                onChange={(event) =>
                  setModelAssignments((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            priority: Math.min(
                              9999,
                              Math.max(
                                1,
                                Number.parseInt(event.target.value, 10) || 1,
                              ),
                            ),
                          }
                        : item,
                    ),
                  )
                }
              />
              <Checkbox
                className="mt-2"
                checked={assignment.enabled}
                aria-label={t("settings.modelAccess.modelEnabled")}
                onCheckedChange={(checked) =>
                  setModelAssignments((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, enabled: checked === true } : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="mt-1"
                aria-label={t("settings.modelAccess.removeModel")}
                data-ui-tooltip={t("settings.modelAccess.removeModel")}
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

        <div className="flex justify-end gap-2 pt-1">
          {selectedProvider ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              data-ui-tooltip={t("settings.modelAccess.removeProvider")}
              aria-label={t("settings.modelAccess.removeProvider")}
              disabled={clearByok.isPending}
              onClick={() => void removeProvider()}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => void saveProvider()}
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
    </div>
  );
}

function CloudModelAssignmentPanel({
  className,
  items,
  assignments,
  loading,
  error,
  saving,
  onAssignmentsChange,
  onSave,
}: {
  className?: string;
  items?: readonly CommercialModelCatalogItem[];
  assignments: readonly ByokModelAssignment[];
  loading: boolean;
  error: unknown;
  saving: boolean;
  onAssignmentsChange: (assignments: ByokModelAssignment[]) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const models = items ?? [];
  const resolvedAssignments = resolveCloudAssignments(models, assignments);
  const roles = BYOK_MODEL_ROLES.filter((role) =>
    models.some((model) => commercialModelRoles(model).includes(role)),
  );
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const details = useCommercialModelDetails(selectedSku, Boolean(selectedSku));

  return (
    <div className={cn("border-y border-border py-3", className)}>
      <div className="flex min-h-8 items-center justify-between gap-3 px-1">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          {t("settings.modelAccess.cloudAssignments")}
          <InfoHint
            label={t("settings.modelAccess.cloudAssignments")}
            text={t("settings.modelAccess.cloudAssignmentsDescription")}
          />
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
      {!loading && roles.length > 0 ? (
        <div className="grid grid-cols-[minmax(9rem,0.7fr)_minmax(0,1fr)_5.5rem_2rem] items-center gap-3 border-t border-border/70 px-1 py-1.5 text-[10px] text-muted-foreground">
          <span />
          <span />
          <span>{t("settings.modelAccess.modelPriority")}</span>
          <span />
        </div>
      ) : null}
      {roles.map((role) => {
        const options = models.filter((model) =>
          commercialModelRoles(model).includes(role),
        );
        const selected = resolvedAssignments.find((item) => item.role === role);
        const selectedModel = options.find((model) => model.code === selected?.modelId);
        return (
          <div
            key={role}
            className="grid min-h-12 grid-cols-[minmax(9rem,0.7fr)_minmax(0,1fr)_5.5rem_2rem] items-start gap-3 border-t border-border/70 px-1 py-2"
            data-cloud-model-assignment={role}
          >
            <Label className="pt-2 text-xs text-foreground">
              {t(`settings.modelAccess.roles.${BYOK_ROLE_LABEL_KEYS[role]}`)}
            </Label>
            <div className="min-w-0">
              <Select
                value={selected?.modelId ?? ""}
                onValueChange={(modelId) => {
                  if (!modelId) return;
                  onAssignmentsChange([
                    ...resolvedAssignments.filter((item) => item.role !== role),
                    {
                      modelId,
                      role,
                      priority: selected?.priority ?? 100,
                      enabled: selected?.enabled ?? true,
                      ...catalogModelAssignmentMetadata(
                        options.find((model) => model.code === modelId),
                      ),
                    },
                  ]);
                }}
              >
                <SelectTrigger className="w-full" aria-label={t("settings.modelAccess.cloudModelForRole", {
                  role: t(`settings.modelAccess.roles.${BYOK_ROLE_LABEL_KEYS[role]}`),
                })}>
                  <SelectValue>
                    {() => selectedModel?.displayName ?? selected?.modelId ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end">
                  {options.map((model) => (
                    <SelectItem key={String(model.id)} value={model.code}>
                      <span className="min-w-0">
                        <span className="block truncate">{model.displayName}</span>
                        <ModelMetadataInline model={model} compact />
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex min-h-5 items-center gap-1">
                <ModelMetadataInline model={selectedModel} assignment={selected} />
                {selected ? (
                  <ModelRuntimeOverridesButton
                    assignment={selected}
                    model={selectedModel}
                    onChange={(next) =>
                      onAssignmentsChange([
                        ...resolvedAssignments.filter((item) => item.role !== role),
                        next,
                      ])
                    }
                  />
                ) : null}
              </div>
            </div>
            <Input
              type="number"
              min={1}
              max={9999}
              step={1}
              value={selected?.priority ?? 100}
              disabled={!selected}
              aria-label={`${t(
                `settings.modelAccess.roles.${BYOK_ROLE_LABEL_KEYS[role]}`,
              )} ${t("settings.modelAccess.modelPriority")}`}
              onChange={(event) => {
                if (!selected) return;
                const priority = Math.min(
                  9999,
                  Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                );
                onAssignmentsChange([
                  ...resolvedAssignments.filter((item) => item.role !== role),
                  { ...selected, priority },
                ]);
              }}
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="mt-1"
              data-ui-tooltip={t("settings.modelAccess.showDetails")}
              aria-label={t("settings.modelAccess.showDetails")}
              disabled={!selected}
              onClick={() => selected && setSelectedSku(selected.modelId)}
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
      {!loading && !error && roles.length > 0 ? (
        <div className="flex justify-end px-1 pt-3">
          <Button type="button" size="sm" disabled={saving} onClick={onSave}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
            {t("settings.modelAccess.saveCloud")}
          </Button>
        </div>
      ) : null}
      <ModelDetailsDialog
        sku={selectedSku}
        model={details.data}
        loading={details.isLoading}
        error={details.error}
        onOpenChange={(nextOpen) => !nextOpen && setSelectedSku(null)}
      />
    </div>
  );
}

function resolveCloudAssignments(
  models: readonly CommercialModelCatalogItem[],
  current: readonly ByokModelAssignment[],
): ByokModelAssignment[] {
  return BYOK_MODEL_ROLES.flatMap((role) => {
    const candidates = models.filter((model) =>
      commercialModelRoles(model).includes(role),
    );
    if (candidates.length === 0) return [];
    const existing = current.find(
      (assignment) =>
        assignment.role === role &&
        candidates.some((model) => model.code === assignment.modelId),
    );
    if (existing) {
      const model = candidates.find((candidate) => candidate.code === existing.modelId);
      return [{
        ...existing,
        ...catalogModelAssignmentMetadata(model),
        ...(existing.runtimeOverrides
          ? { runtimeOverrides: existing.runtimeOverrides }
          : {}),
      }];
    }
    const defaults = candidates.filter((model) => model.isDefault === true);
    const selected = defaults.length === 1 ? defaults[0] : candidates.length === 1 ? candidates[0] : null;
    return selected
      ? [{
          modelId: selected.code,
          role,
          priority: 100,
          enabled: true,
          ...catalogModelAssignmentMetadata(selected),
        }]
      : [];
  });
}

function ModelDetailsDialog({
  sku,
  model,
  loading,
  error,
  onOpenChange,
}: {
  sku: string | null;
  model: CommercialModelCatalogItem | undefined;
  loading: boolean;
  error: unknown;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={Boolean(sku)} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(76dvh,680px)] max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[680px]">
        <DialogHeader className="relative z-10 border-b border-border bg-popover px-5 py-4">
          <DialogTitle>{model?.displayName ?? t("settings.modelAccess.modelDetails")}</DialogTitle>
        </DialogHeader>
        <div
          className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable]"
          data-model-details-scroll-body
        >
          <ModelDetailsPanel model={model} loading={loading} error={error} />
        </div>
        <DialogFooter className="relative z-10 shrink-0 border-t border-border bg-popover px-5 py-3">
          <DialogClose render={<Button type="button" size="sm" variant="outline" />}>
            {t("settings.close")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <p className="px-1 py-3 text-xs text-destructive">
        {errorMessage(error, t("settings.modelAccess.detailsFailed"))}
      </p>
    );
  }
  if (!model) return null;
  const runtimeMetadata = commercialModelRuntimeMetadata(model);
  return (
    <div className="px-1">
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
        {runtimeMetadata.contextWindow === undefined ? null : (
          <DetailValue
            label={t("settings.modelAccess.contextWindow")}
            value={formatModelContextWindow(runtimeMetadata.contextWindow)}
          />
        )}
        {runtimeMetadata.maxOutputTokens === undefined ? null : (
          <DetailValue
            label={t("settings.modelAccess.maxOutputTokens")}
            value={formatModelContextWindow(runtimeMetadata.maxOutputTokens)}
          />
        )}
        {runtimeMetadata.reasoningEffort === undefined ? null : (
          <DetailValue
            label={t("settings.modelAccess.reasoningEfforts")}
            value={formatReasoningEffort(runtimeMetadata.reasoningEffort)}
          />
        )}
      </div>
      <ModelParameterDetails parameterSchema={model.parameterSchema} />
      <JsonDetails
        label={t("settings.modelAccess.capabilities")}
        value={model.capabilities}
      />
    </div>
  );
}

function ModelParameterDetails({
  parameterSchema,
}: {
  parameterSchema: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const declarations = commercialModelParameterDeclarations(parameterSchema);
  if (declarations.length === 0) return null;
  const topLevelCount = declarations.filter((item) => item.depth === 0).length;
  return (
    <section className="mt-4 border-t border-border/70 pt-3">
      <p className="text-xs font-medium text-foreground">
        {t("settings.modelAccess.declaredParameters", { count: topLevelCount })}
      </p>
      <div className="mt-2 divide-y divide-border/60 rounded-md border border-border/70">
        {declarations.map((declaration) => (
          <ModelParameterRow key={declaration.path} declaration={declaration} />
        ))}
      </div>
    </section>
  );
}

function ModelParameterRow({
  declaration,
}: {
  declaration: ModelParameterDeclaration;
}) {
  const { t } = useTranslation();
  const facts = modelParameterFacts(declaration, t);
  const description = typeof declaration.schema.description === "string"
    ? declaration.schema.description.trim()
    : "";
  return (
    <div
      className="grid gap-1 px-2 py-2 text-[11px] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-3"
      style={{ paddingInlineStart: `${8 + declaration.depth * 14}px` }}
    >
      <code className="break-all font-medium text-foreground">
        {declaration.path}
      </code>
      <div className="min-w-0">
        <p className="break-words text-muted-foreground">{facts.join(" · ")}</p>
        {description ? (
          <p className="mt-1 break-words text-foreground/80">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function modelParameterFacts(
  declaration: ModelParameterDeclaration,
  t: ReturnType<typeof useTranslation>["t"],
): string[] {
  const schema = declaration.schema;
  const type = Array.isArray(schema.type)
    ? schema.type.filter((value): value is string => typeof value === "string").join(" | ")
    : typeof schema.type === "string"
      ? schema.type
      : "any";
  const facts = [
    type,
    declaration.required
      ? t("settings.modelAccess.parameterRequired")
      : t("settings.modelAccess.parameterOptional"),
  ];
  if (schema.deprecated === true) {
    facts.push(t("settings.modelAccess.parameterDeprecated"));
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    facts.push(t("settings.modelAccess.parameterOptions", {
      value: schema.enum
        .map((value) => formatModelParameterSchemaValue(declaration, value))
        .join(" / "),
    }));
  }
  if (Object.prototype.hasOwnProperty.call(schema, "default")) {
    facts.push(t("settings.modelAccess.parameterDefault", {
      value: formatModelParameterSchemaValue(declaration, schema.default),
    }));
  }
  const minimum = finiteNumber(schema.minimum);
  const maximum = finiteNumber(schema.maximum);
  if (minimum !== undefined || maximum !== undefined) {
    facts.push(t("settings.modelAccess.parameterRange", {
      value: `${minimum ?? "−∞"} … ${maximum ?? "+∞"}`,
    }));
  }
  return facts;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatSchemaValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function formatModelParameterSchemaValue(
  declaration: ModelParameterDeclaration,
  value: unknown,
): string {
  return declaration.path === "reasoning_effort" && typeof value === "string"
    ? formatReasoningEffortOption(value)
    : formatSchemaValue(value);
}

function ModelRuntimeOverridesButton({
  assignment,
  model,
  allowUndeclaredParameterOverrides = false,
  onChange,
}: {
  assignment: ByokModelAssignment;
  model?: CommercialModelCatalogItem;
  allowUndeclaredParameterOverrides?: boolean;
  onChange: (assignment: ByokModelAssignment) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [contextWindow, setContextWindow] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState("");
  const [reasoningEfforts, setReasoningEfforts] = useState("");
  const [defaultReasoningEffort, setDefaultReasoningEffort] = useState("");
  const [parameterDrafts, setParameterDrafts] = useState<Record<string, string>>({});
  const [manualParameterDraft, setManualParameterDraft] = useState("");
  const [capabilityDraft, setCapabilityDraft] = useState("");
  const catalog = model ? catalogModelAssignmentMetadata(model) : {};
  const parameterSchema = resolvedAssignmentParameterSchema(model, assignment);
  const declaredParameters = commercialModelParameterDeclarations(parameterSchema);
  const parameterDeclarations = commercialModelParameterOverrideDeclarations(
    parameterSchema,
  );
  const showManualParameterEditor = allowUndeclaredParameterOverrides
    && declaredParameters.length === 0;
  const showCapabilityEditor = allowUndeclaredParameterOverrides
    && assignment.role !== "TEXT";
  const declaredContextWindow = assignment.contextWindow
    ?? catalog.contextWindow;
  const declaredMaxOutputTokens = assignment.maxOutputTokens
    ?? catalog.maxOutputTokens;
  const declaredReasoningEfforts = assignment.reasoningEfforts
    ?? catalog.reasoningEfforts;
  const declaredDefaultReasoningEffort = assignment.defaultReasoningEffort
    ?? catalog.defaultReasoningEffort;
  const parsedReasoningEfforts = parseReasoningEffortsDraft(reasoningEfforts);
  const allowUndeclaredTextMetadata = allowUndeclaredParameterOverrides
    && assignment.role === "TEXT";
  const hasContextMetadata = allowUndeclaredTextMetadata
    || declaredContextWindow !== undefined
    || assignment.runtimeOverrides?.contextWindow !== undefined;
  const hasOutputMetadata = allowUndeclaredTextMetadata
    || declaredMaxOutputTokens !== undefined
    || assignment.runtimeOverrides?.maxOutputTokens !== undefined;
  const hasReasoningMetadata = allowUndeclaredTextMetadata
    || Boolean(declaredReasoningEfforts?.length)
    || Boolean(assignment.runtimeOverrides?.reasoningEfforts?.length);
  const hasRuntimeMetadata = hasContextMetadata
    || hasOutputMetadata
    || hasReasoningMetadata;

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const overrides = assignment.runtimeOverrides;
      setContextWindow(overrides?.contextWindow?.toString() ?? "");
      setMaxOutputTokens(overrides?.maxOutputTokens?.toString() ?? "");
      setReasoningEfforts(overrides?.reasoningEfforts?.join(", ") ?? "");
      setDefaultReasoningEffort(overrides?.defaultReasoningEffort ?? "");
      setManualParameterDraft(
        showManualParameterEditor && overrides?.parameterOverrides
          ? JSON.stringify(overrides.parameterOverrides, null, 2)
          : "",
      );
      setCapabilityDraft(
        assignment.capabilityOverrides
          ? JSON.stringify(assignment.capabilityOverrides, null, 2)
          : "",
      );
      setParameterDrafts(Object.fromEntries(
        parameterDeclarations.map((declaration) => [
          declaration.key,
          modelParameterOverrideDraft(
            declaration,
            overrides?.parameterOverrides,
          ),
        ]),
      ));
    }
    setOpen(nextOpen);
  };

  const removeOverrides = () => {
    const {
      runtimeOverrides: _runtimeOverrides,
      capabilityOverrides: _capabilityOverrides,
      ...base
    } = assignment;
    onChange(base);
    setOpen(false);
  };

  const applyOverrides = () => {
    const contextValue = parsePositiveIntegerDraft(contextWindow);
    const outputValue = parsePositiveIntegerDraft(maxOutputTokens);
    if ((contextWindow.trim() && contextValue === undefined)
      || (maxOutputTokens.trim() && outputValue === undefined)) {
      toast.error(t("settings.modelAccess.runtimeOverrideInvalid"));
      return;
    }
    const effectiveContext = contextValue ?? declaredContextWindow;
    const effectiveOutput = outputValue ?? declaredMaxOutputTokens;
    if (effectiveContext && effectiveOutput && effectiveOutput > effectiveContext) {
      toast.error(t("settings.modelAccess.outputExceedsContext"));
      return;
    }
    const parsedParameters = showManualParameterEditor
      ? parseModelParameterOverridesJsonDraft(manualParameterDraft)
      : parseModelParameterOverrideDrafts(
          parameterDeclarations,
          parameterDrafts,
        );
    const parsedCapabilities = parseModelCapabilityOverridesJsonDraft(
      showCapabilityEditor ? capabilityDraft : "",
    );
    if (parsedParameters.invalidPath) {
      toast.error(t("settings.modelAccess.parameterOverrideInvalid", {
        path: parsedParameters.invalidPath,
      }));
      return;
    }
    if (parsedCapabilities.invalidPath) {
      toast.error(t("settings.modelAccess.capabilityOverrideInvalid", {
        path: parsedCapabilities.invalidPath,
      }));
      return;
    }
    const runtimeOverrides: ModelRuntimeOverrides = {
      ...(contextValue === undefined ? {} : { contextWindow: contextValue }),
      ...(outputValue === undefined ? {} : { maxOutputTokens: outputValue }),
      ...(parsedReasoningEfforts.length
        ? { reasoningEfforts: parsedReasoningEfforts }
        : {}),
      ...(defaultReasoningEffort
        && parsedReasoningEfforts.includes(defaultReasoningEffort)
        ? { defaultReasoningEffort }
        : {}),
      ...(Object.keys(parsedParameters.value).length
        ? { parameterOverrides: parsedParameters.value }
        : {}),
    };
    const {
      runtimeOverrides: _runtimeOverrides,
      capabilityOverrides: _capabilityOverrides,
      ...base
    } = assignment;
    onChange({
      ...base,
      ...(Object.keys(runtimeOverrides).length ? { runtimeOverrides } : {}),
      ...(Object.keys(parsedCapabilities.value).length
        ? { capabilityOverrides: parsedCapabilities.value }
        : {}),
    });
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        size="icon-xs"
        variant={assignment.runtimeOverrides || assignment.capabilityOverrides
          ? "secondary"
          : "ghost"}
        className="size-5"
        aria-label={t("settings.modelAccess.modelParameters")}
        data-ui-tooltip={t("settings.modelAccess.modelParameters")}
        onClick={() => handleOpenChange(true)}
      >
        <SlidersHorizontal className="size-3" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="grid h-[min(78dvh,720px)] max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-[720px]">
          <DialogHeader className="relative z-10 border-b border-border bg-popover px-5 py-4">
            <DialogTitle>{t("settings.modelAccess.modelParameters")}</DialogTitle>
            <DialogDescription className="text-xs">
              {assignment.modelId} · {t("settings.modelAccess.runtimeOverrideDescription")}
            </DialogDescription>
          </DialogHeader>
          <div
            className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
            data-model-parameter-scroll-body
          >
            <div className="grid min-w-0 gap-5 px-5 py-4">
              {showCapabilityEditor ? (
                <section className="grid gap-2">
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {t("settings.modelAccess.modelCapabilityOverrides")}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {t("settings.modelAccess.modelCapabilityOverridesDescription")}
                    </p>
                  </div>
                  <Textarea
                    aria-label={t("settings.modelAccess.modelCapabilityOverrides")}
                    className="min-h-32 resize-y font-mono text-xs"
                    value={capabilityDraft}
                    placeholder={'{\n  "resolutionOptions": ["720p", "1080p"],\n  "ratioOptions": ["16:9", "9:16"],\n  "minDuration": 4,\n  "maxDuration": 10\n}'}
                    onChange={(event) => setCapabilityDraft(event.target.value)}
                  />
                </section>
              ) : null}
              {parameterDeclarations.length ? (
                <section className={cn(
                  "grid gap-4",
                  showCapabilityEditor && "border-t border-border pt-4",
                )}>
                  <p className="text-xs font-medium text-foreground">
                    {t("settings.modelAccess.requestParameterOverrides")}
                  </p>
                  {parameterDeclarations.map((declaration) => (
                    <ModelParameterOverrideField
                      key={declaration.key}
                      declaration={declaration}
                      draft={parameterDrafts[declaration.key] ?? ""}
                      onChange={(draft) => setParameterDrafts((current) => ({
                        ...current,
                        [declaration.key]: draft,
                      }))}
                    />
                  ))}
                </section>
              ) : null}
              {showManualParameterEditor ? (
                <section className={cn(
                  "grid gap-2",
                  showCapabilityEditor && "border-t border-border pt-4",
                )}>
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {t("settings.modelAccess.manualRequestParameterOverrides")}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {t("settings.modelAccess.manualRequestParameterOverridesDescription")}
                    </p>
                  </div>
                  <Textarea
                    aria-label={t("settings.modelAccess.manualRequestParameterOverrides")}
                    className="min-h-36 resize-y font-mono text-xs"
                    value={manualParameterDraft}
                    placeholder={'{\n  "temperature": 0.7\n}'}
                    onChange={(event) => setManualParameterDraft(event.target.value)}
                  />
                </section>
              ) : null}
              {hasRuntimeMetadata ? (
                <section className={cn(
                  "grid gap-4",
                  (showCapabilityEditor
                    || parameterDeclarations.length
                    || showManualParameterEditor)
                    && "border-t border-border pt-4",
                )}>
                  <p className="text-xs font-medium text-foreground">
                    {t("settings.modelAccess.runtimeMetadataOverrides")}
                  </p>
                  {hasContextMetadata ? (
                    <RuntimeOverrideField
                      label={t("settings.modelAccess.contextWindow")}
                      declared={formatModelContextWindow(declaredContextWindow)}
                    >
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        aria-label={t("settings.modelAccess.contextWindow")}
                        value={contextWindow}
                        placeholder={declaredContextWindow?.toString() ?? t("settings.modelAccess.notDeclared")}
                        onChange={(event) => setContextWindow(event.target.value)}
                      />
                    </RuntimeOverrideField>
                  ) : null}
                  {hasOutputMetadata ? (
                    <RuntimeOverrideField
                      label={t("settings.modelAccess.maxOutputTokens")}
                      declared={formatModelContextWindow(declaredMaxOutputTokens)}
                    >
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        aria-label={t("settings.modelAccess.maxOutputTokens")}
                        value={maxOutputTokens}
                        placeholder={declaredMaxOutputTokens?.toString() ?? t("settings.modelAccess.notDeclared")}
                        onChange={(event) => setMaxOutputTokens(event.target.value)}
                      />
                    </RuntimeOverrideField>
                  ) : null}
                  {hasReasoningMetadata ? (
                    <>
                      <RuntimeOverrideField
                        label={t("settings.modelAccess.reasoningEfforts")}
                        declared={declaredReasoningEfforts?.join(" / ") ?? t("settings.modelAccess.notDeclared")}
                      >
                        <Input
                          aria-label={t("settings.modelAccess.reasoningEfforts")}
                          value={reasoningEfforts}
                          placeholder={declaredReasoningEfforts?.join(", ") ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setReasoningEfforts(value);
                            const options = parseReasoningEffortsDraft(value);
                            if (defaultReasoningEffort && !options.includes(defaultReasoningEffort)) {
                              setDefaultReasoningEffort("");
                            }
                          }}
                        />
                      </RuntimeOverrideField>
                      <RuntimeOverrideField
                        label={t("settings.modelAccess.defaultReasoningEffort")}
                        declared={declaredDefaultReasoningEffort ?? t("settings.modelAccess.notDeclared")}
                      >
                        <Select
                          value={defaultReasoningEffort || "__follow__"}
                          disabled={parsedReasoningEfforts.length === 0}
                          onValueChange={(value) =>
                            setDefaultReasoningEffort(value === "__follow__" ? "" : (value ?? ""))
                          }
                        >
                          <SelectTrigger
                            className="w-full"
                            aria-label={t("settings.modelAccess.defaultReasoningEffort")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="end">
                            <SelectItem value="__follow__">
                              {t("settings.modelAccess.followDeclared")}
                            </SelectItem>
                            {parsedReasoningEfforts.map((effort) => (
                              <SelectItem key={effort} value={effort}>{effort}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </RuntimeOverrideField>
                    </>
                  ) : null}
                </section>
              ) : null}
              {!parameterDeclarations.length
                && !showManualParameterEditor
                && !showCapabilityEditor
                && !hasRuntimeMetadata ? (
                <p className="text-xs text-muted-foreground">
                  {t("settings.modelAccess.noOverrideableParameters")}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter className="relative z-10 shrink-0 border-t border-border bg-popover px-5 py-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mr-auto"
              disabled={!assignment.runtimeOverrides && !assignment.capabilityOverrides}
              onClick={removeOverrides}
            >
              <RotateCcw />
              {t("settings.modelAccess.clearRuntimeOverride")}
            </Button>
            <DialogClose render={<Button type="button" size="sm" variant="outline" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="button" size="sm" onClick={applyOverrides}>
              {t("settings.modelAccess.applyRuntimeOverride")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModelParameterOverrideField({
  declaration,
  draft,
  onChange,
}: {
  declaration: ModelParameterDeclaration;
  draft: string;
  onChange: (draft: string) => void;
}) {
  const { t } = useTranslation();
  const title = typeof declaration.schema.title === "string"
    ? declaration.schema.title.trim()
    : "";
  const label = title && title !== declaration.path
    ? `${title} (${declaration.path})`
    : declaration.path;
  const description = typeof declaration.schema.description === "string"
    ? declaration.schema.description.trim()
    : "";
  return (
    <RuntimeOverrideField
      label={label}
      declared={modelParameterFacts(declaration, t).join(" · ")}
      description={description}
    >
      <ModelParameterOverrideControl
        declaration={declaration}
        draft={draft}
        onChange={onChange}
      />
    </RuntimeOverrideField>
  );
}

function ModelParameterOverrideControl({
  declaration,
  draft,
  onChange,
}: {
  declaration: ModelParameterDeclaration;
  draft: string;
  onChange: (draft: string) => void;
}) {
  const { t } = useTranslation();
  const schema = declaration.schema;
  const enumOptions = Array.isArray(schema.enum)
    ? schema.enum
        .map((value) => ({
          value: JSON.stringify(value),
          label: formatModelParameterSchemaValue(declaration, value),
        }))
        .filter((item): item is { value: string; label: string } => typeof item.value === "string")
    : [];
  if (enumOptions.length) {
    return (
      <Select
        value={draft || "__follow__"}
        onValueChange={(value) => onChange(value === "__follow__" ? "" : (value ?? ""))}
      >
        <SelectTrigger className="w-full" aria-label={declaration.path}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="__follow__">{t("settings.modelAccess.followDeclared")}</SelectItem>
          {enumOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const types = Array.isArray(schema.type)
    ? schema.type.filter((value): value is string => typeof value === "string")
    : typeof schema.type === "string"
      ? [schema.type]
      : [];
  if (types.length === 1 && types[0] === "boolean") {
    return (
      <Select
        value={draft || "__follow__"}
        onValueChange={(value) => onChange(value === "__follow__" ? "" : (value ?? ""))}
      >
        <SelectTrigger className="w-full" aria-label={declaration.path}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="__follow__">{t("settings.modelAccess.followDeclared")}</SelectItem>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  const numeric = types.includes("integer") || types.includes("number");
  if (numeric) {
    return (
      <Input
        type="number"
        aria-label={declaration.path}
        value={draft}
        min={finiteNumber(schema.minimum)}
        max={finiteNumber(schema.maximum)}
        step={finiteNumber(schema.multipleOf) ?? (types.includes("integer") ? 1 : "any")}
        placeholder={parameterDefaultPlaceholder(schema, t("settings.modelAccess.followDeclared"))}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (types.length === 1 && types[0] === "string") {
    return (
      <Input
        type={schema.format === "password" ? "password" : "text"}
        aria-label={declaration.path}
        value={draft}
        minLength={finiteNumber(schema.minLength)}
        maxLength={finiteNumber(schema.maxLength)}
        placeholder={parameterDefaultPlaceholder(schema, t("settings.modelAccess.followDeclared"))}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Textarea
      aria-label={declaration.path}
      className="min-h-16 font-mono text-xs"
      value={draft}
      placeholder={parameterDefaultPlaceholder(schema, t("settings.modelAccess.followDeclared"))}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function parameterDefaultPlaceholder(
  schema: Readonly<Record<string, unknown>>,
  fallback: string,
): string {
  return Object.prototype.hasOwnProperty.call(schema, "default")
    ? formatSchemaValue(schema.default)
    : fallback;
}

function RuntimeOverrideField({
  label,
  declared,
  description,
  children,
}: {
  label: string;
  declared: string;
  description?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,1.2fr)] sm:items-start sm:gap-4">
      <div className="min-w-0">
        <Label className="break-words text-xs font-medium leading-5">{label}</Label>
        <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground">
          {t("settings.modelAccess.declaredValue", { value: declared })}
        </p>
        {description ? (
          <p className="mt-1.5 break-words text-[11px] leading-4 text-foreground/75">
            {description}
          </p>
        ) : null}
      </div>
      <div className="min-w-0 self-center">
        {children}
      </div>
    </div>
  );
}

function ModelMetadataInline({
  model,
  assignment,
  compact = false,
}: {
  model?: CommercialModelCatalogItem;
  assignment?: ByokModelAssignment;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const catalogMetadata = model
    ? commercialModelRuntimeMetadata(model)
    : undefined;
  const effectiveAssignment = effectiveModelRuntimeSettings(assignment);
  const contextWindow = effectiveAssignment.contextWindow
    ?? catalogMetadata?.contextWindow;
  const maxOutputTokens = effectiveAssignment.maxOutputTokens
    ?? catalogMetadata?.maxOutputTokens;
  const reasoningEffort = effectiveAssignment.reasoningEfforts?.length
      ? {
          options: effectiveAssignment.reasoningEfforts,
          ...(effectiveAssignment.defaultReasoningEffort
            ? { defaultValue: effectiveAssignment.defaultReasoningEffort }
            : {}),
        }
      : catalogMetadata?.reasoningEffort;
  const parameterCount = commercialModelParameterOverrideDeclarations(
    resolvedAssignmentParameterSchema(model, assignment),
  ).length;
  const capability = modelCapabilitySummary(model, assignment);
  const segments = [
    ...(contextWindow !== undefined
      ? [`${t("settings.modelAccess.contextWindow")} ${formatModelContextWindow(contextWindow)}`]
      : []),
    ...(maxOutputTokens !== undefined && (!compact || contextWindow === undefined)
      ? [`${t("settings.modelAccess.maxOutputShort")} ${formatModelContextWindow(maxOutputTokens)}`]
      : []),
    ...(reasoningEffort !== undefined
      ? [`${t("settings.modelAccess.reasoningShort")} ${formatReasoningEffort(reasoningEffort)}`]
      : []),
    ...(parameterCount > 0
      ? [t("settings.modelAccess.parameterCount", { count: parameterCount })]
      : []),
    ...(capability.modeCount > 0
      ? [t("settings.modelAccess.modeCount", { count: capability.modeCount })]
      : []),
    ...(capability.specificationCount > 0
      ? [t("settings.modelAccess.specificationCount", {
          count: capability.specificationCount,
        })]
      : []),
    ...(capability.maxDuration === undefined
      ? []
      : [capability.minDuration === undefined
          ? t("settings.modelAccess.durationMaximum", {
              max: capability.maxDuration,
            })
          : t("settings.modelAccess.durationRange", {
              min: capability.minDuration,
              max: capability.maxDuration,
            })]),
    ...(assignment?.runtimeOverrides || assignment?.capabilityOverrides
      ? [t("settings.modelAccess.localOverride")]
      : []),
  ];
  if (segments.length === 0) {
    segments.push(t("settings.modelAccess.noRecognizedMetadata"));
  }
  return (
    <span className={cn(
      "block min-w-0 flex-1 truncate text-[10px] text-muted-foreground",
      compact && "mt-0",
    )}>
      {segments.join(" · ")}
    </span>
  );
}

function modelCapabilitySummary(
  model: CommercialModelCatalogItem | undefined,
  assignment?: ByokModelAssignment,
): {
  modeCount: number;
  specificationCount: number;
  minDuration?: number;
  maxDuration?: number;
} {
  const capabilities = resolvedAssignmentCapabilities(model, assignment);
  if (Object.keys(capabilities).length === 0) {
    return { modeCount: 0, specificationCount: 0 };
  }
  const modes = stringValues(capabilities.supportedModes);
  const specifications = new Set([
    ...stringValues(capabilities.resolutionOptions),
    ...stringValues(capabilities.sizeOptions),
    ...stringValues(capabilities.ratioOptions),
    ...stringValues(capabilities.aspectRatios),
  ]);
  const minDuration = positiveFiniteNumber(capabilities.minDuration);
  const maxDuration = positiveFiniteNumber(capabilities.maxDuration);
  return {
    modeCount: modes.length,
    specificationCount: specifications.size,
    ...(minDuration === undefined ? {} : { minDuration }),
    ...(maxDuration === undefined ? {} : { maxDuration }),
  };
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item))
    : [];
}

function positiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function catalogModelAssignmentMetadata(
  model: CommercialModelCatalogItem | undefined,
): Pick<
  ByokModelAssignment,
  "contextWindow" | "maxOutputTokens" | "reasoningEfforts" | "defaultReasoningEffort"
> {
  if (!model) return {};
  const metadata = commercialModelRuntimeMetadata(model);
  return {
    ...(metadata.contextWindow === undefined
      ? {}
      : { contextWindow: metadata.contextWindow }),
    ...(metadata.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: metadata.maxOutputTokens }),
    ...(metadata.reasoningEffort?.options.length
      ? { reasoningEfforts: metadata.reasoningEffort.options }
      : {}),
    ...(metadata.reasoningEffort?.defaultValue
      ? { defaultReasoningEffort: metadata.reasoningEffort.defaultValue }
      : {}),
  };
}

function parsePositiveIntegerDraft(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseReasoningEffortsDraft(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[,，\s]+/u)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function resolveByokCatalogModel(
  items: readonly CommercialModelCatalogItem[],
  providerId: string,
  modelId: string,
  role: ByokModelRole,
): CommercialModelCatalogItem | undefined {
  const selector = `byok:${providerId}:${modelId}`;
  return items.find((item) => (
    catalogRouteSelector(item) === selector
    && commercialModelRoles(item).includes(role)
  ));
}

function byokModelRoleOptions(
  protocol: ByokProviderProtocol,
  assignment: ByokModelAssignment,
): readonly ByokModelRole[] {
  const protocolRoles = protocol === "OPENAI_COMPATIBLE"
    ? BYOK_MODEL_ROLES
    : protocol === "GEMINI"
      ? GEMINI_BYOK_MODEL_ROLES
      : (["TEXT"] as const);
  const capabilities = resolvedAssignmentCapabilities(undefined, assignment);
  const explicitRoles = stringValues(
    capabilities.supportedRoles,
  ).filter((role): role is ByokModelRole => (
    (BYOK_MODEL_ROLES as readonly string[]).includes(role)
  ));
  const operation = typeof capabilities.operation === "string"
    ? capabilities.operation.trim()
    : "";
  const declaredRoles = explicitRoles.length || !operation
    ? explicitRoles
    : commercialModelRoles({ operation, capabilities });
  const compatibleRoles = declaredRoles.length
    ? protocolRoles.filter((role) => declaredRoles.includes(role))
    : protocolRoles;
  return compatibleRoles.length ? compatibleRoles : protocolRoles;
}

function resolvedAssignmentParameterSchema(
  model: CommercialModelCatalogItem | undefined,
  assignment: ByokModelAssignment | undefined,
): Record<string, unknown> {
  return model && Object.keys(model.parameterSchema).length > 0
    ? model.parameterSchema
    : assignment?.parameterSchema ?? {};
}

function resolvedAssignmentCapabilities(
  model: CommercialModelCatalogItem | undefined,
  assignment: ByokModelAssignment | undefined,
): Record<string, unknown> {
  return {
    ...(model?.capabilities ?? {}),
    ...(assignment?.capabilities ?? {}),
    ...(assignment?.capabilityOverrides ?? {}),
  };
}

function withDiscoveredModelMetadata(
  assignment: ByokModelAssignment,
  modelId: string,
  metadata: readonly ByokDiscoveredModelMetadata[],
  protocol: ByokProviderProtocol,
): ByokModelAssignment {
  const discovered = metadata.find((item) => item.id === modelId);
  const next: ByokModelAssignment = {
    modelId,
    role: assignment.role,
    priority: assignment.priority,
    enabled: assignment.enabled,
    ...(assignment.modelId === modelId && assignment.runtimeOverrides
      ? { runtimeOverrides: assignment.runtimeOverrides }
      : {}),
    ...(assignment.modelId === modelId && assignment.capabilityOverrides
      ? { capabilityOverrides: assignment.capabilityOverrides }
      : {}),
    ...(discovered?.capabilities
      ? { capabilities: discovered.capabilities }
      : assignment.modelId === modelId && assignment.capabilities
        ? { capabilities: assignment.capabilities }
        : {}),
    ...(discovered?.parameterSchema
      ? { parameterSchema: discovered.parameterSchema }
      : assignment.modelId === modelId && assignment.parameterSchema
        ? { parameterSchema: assignment.parameterSchema }
        : {}),
    ...(discovered?.contextWindow
      ? { contextWindow: discovered.contextWindow }
      : {}),
    ...(discovered?.maxOutputTokens
      ? { maxOutputTokens: discovered.maxOutputTokens }
      : {}),
    ...(discovered?.reasoningEfforts?.length
      ? { reasoningEfforts: discovered.reasoningEfforts }
      : {}),
    ...(discovered?.defaultReasoningEffort
      ? { defaultReasoningEffort: discovered.defaultReasoningEffort }
      : {}),
  };
  const roles = byokModelRoleOptions(protocol, next);
  return roles.includes(next.role) || !roles[0]
    ? next
    : { ...next, role: roles[0] };
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="break-words text-foreground">{value}</p>
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
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {hint ? <InfoHint label={title} text={hint} /> : null}
      {badge ? (
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function InfoHint({ label, text }: { label: string; text: string }) {
  return (
    <TooltipProvider delay={120}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={label}
            />
          }
        >
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-72 leading-5" side="top">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ModelIdInput({
  value,
  options,
  label,
  placeholder,
  onChange,
}: {
  value: string;
  options: string[];
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0">
      <Input
        className="pr-9"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {options.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="absolute inset-y-0 right-0 inline-flex w-8 items-center justify-center rounded-r-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={label}
              />
            }
          >
            <ChevronDown className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            className="max-h-64 min-w-64"
          >
            {options.map((modelId) => (
              <DropdownMenuItem key={modelId} onClick={() => onChange(modelId)}>
                <span className="flex-1 whitespace-nowrap">{modelId}</span>
                {value === modelId ? <Check className="size-4 text-primary" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
