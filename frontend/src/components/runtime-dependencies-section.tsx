import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskProgress } from "@/components/task-progress";

const DEPENDENCY_IDS: readonly AIAnimeRuntimeDependencyId[] = [
  "world",
  "worldModels",
  "matte",
];

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

interface DependencyCardProps {
  id: AIAnimeRuntimeDependencyId;
  status: AIAnimeRuntimeDependencyStatus | null;
  progress: AIAnimeRuntimeDependencyProgress | null;
  loading: boolean;
  installing: boolean;
  installStartedAt: number | null;
  error: string;
  bridgeAvailable: boolean;
  onInstall: () => void;
  onRefresh: () => void;
}

function DependencyCard({
  id,
  status,
  progress,
  loading,
  installing,
  installStartedAt,
  error,
  bridgeAvailable,
  onInstall,
  onRefresh,
}: DependencyCardProps) {
  const { t } = useTranslation();
  const checking = loading && status === null;
  const state = installing
    ? "installing"
    : checking
      ? "checking"
      : status?.state ?? "not-installed";
  const healthy = status?.healthy === true;
  const supported = status?.supported !== false;
  const isIntelMacUnsupported =
    id === "world"
    && status?.state === "unsupported"
    && status.platform === "darwin"
    && status.arch === "x64";
  const totalBytes = progress?.totalBytes ?? status?.downloadSizeBytes;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-medium">
              {t(`settings.dependencies.${id}Name`)}
            </h4>
            <Badge variant={healthy ? "default" : "secondary"}>
              {t(`settings.dependencies.states.${state}`)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {checking
              ? t("settings.dependencies.checking")
              : status?.message ?? t(`settings.dependencies.${id}Description`)}
          </p>
        </div>
        {checking ? (
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
        ) : healthy ? (
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
        ) : (
          <AlertTriangle className="size-5 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">
            {t("settings.dependencies.platform")}
          </dt>
          <dd className="mt-1 font-medium">
            {status
              ? `${status.platform} / ${status.arch}`
              : window.aiAnimeDesktop?.platform ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("settings.dependencies.acceleration")}
          </dt>
          <dd className="mt-1 font-medium">{status?.accelerator ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("settings.dependencies.downloadSize")}
          </dt>
          <dd className="mt-1 font-medium">{formatBytes(totalBytes)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("settings.dependencies.installedSize")}</dt>
          <dd className="mt-1 font-medium">
            {formatBytes(status?.installedSizeBytes)}
          </dd>
        </div>
      </dl>

      {installing || progress ? (
        <div className="mt-5 space-y-2" aria-live="polite">
          <div className="flex justify-between gap-3 text-sm">
            <span>
              {progress?.message ?? t("settings.dependencies.installing")}
            </span>
            {progress?.phase === "downloading" ? (
              <span className="tabular-nums text-muted-foreground">
                {formatBytes(progress.transferredBytes)} / {formatBytes(totalBytes)}
              </span>
            ) : null}
          </div>
          <TaskProgress
            local
            startedAt={installStartedAt}
            task={{
              status: error
                ? "failed"
                : installing
                  ? progress?.phase === "manifest"
                    ? "queued"
                    : progress?.phase === "downloading"
                      ? "running"
                      : "finalizing"
                  : healthy
                    ? "completed"
                    : "failed",
              progress: (progress?.percent ?? 0) / 100,
            }}
            aria-label={t("settings.dependencies.installing")}
          />
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {isIntelMacUnsupported ? (
        <p
          className="mt-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm leading-relaxed text-warning"
          role="status"
        >
          {t("settings.dependencies.intelMacUnsupportedNotice")}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onInstall}
          disabled={!bridgeAvailable || !supported || installing || loading}
          aria-label={`${t(`settings.dependencies.${id}Name`)} · ${t(
            healthy
              ? "settings.dependencies.reinstall"
              : "settings.dependencies.install",
          )}`}
        >
          {installing ? <Loader2 className="animate-spin" /> : <Download />}
          {healthy
            ? t("settings.dependencies.reinstall")
            : t("settings.dependencies.install")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={!bridgeAvailable || installing || loading}
          aria-label={`${t(`settings.dependencies.${id}Name`)} · ${t(
            "settings.dependencies.check",
          )}`}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
          {t("settings.dependencies.check")}
        </Button>
      </div>
    </div>
  );
}

type DependencyValueMap<T> = Record<AIAnimeRuntimeDependencyId, T>;

function dependencyMap<T>(value: T): DependencyValueMap<T> {
  return { world: value, worldModels: value, matte: value };
}

export function RuntimeDependenciesSection({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const bridge = window.aiAnimeDesktop?.runtimeDependencies;
  const [statuses, setStatuses] = useState<
    DependencyValueMap<AIAnimeRuntimeDependencyStatus | null>
  >(() => dependencyMap(null));
  const [progresses, setProgresses] = useState<
    DependencyValueMap<AIAnimeRuntimeDependencyProgress | null>
  >(() => dependencyMap(null));
  const [loading, setLoading] = useState<DependencyValueMap<boolean>>(
    () => dependencyMap(false),
  );
  const [installing, setInstalling] = useState<DependencyValueMap<boolean>>(
    () => dependencyMap(false),
  );
  const [installStartedAt, setInstallStartedAt] = useState<
    DependencyValueMap<number | null>
  >(() => dependencyMap(null));
  const [errors, setErrors] = useState<DependencyValueMap<string>>(
    () => dependencyMap(""),
  );

  const refresh = useCallback(
    async (id: AIAnimeRuntimeDependencyId) => {
      if (!bridge) return;
      setLoading((current) => ({ ...current, [id]: true }));
      setErrors((current) => ({ ...current, [id]: "" }));
      try {
        const status = await bridge.status(id);
        setStatuses((current) => ({ ...current, [id]: status }));
      } catch (reason) {
        setErrors((current) => ({
          ...current,
          [id]: reason instanceof Error ? reason.message : String(reason),
        }));
      } finally {
        setLoading((current) => ({ ...current, [id]: false }));
      }
    },
    [bridge],
  );

  useEffect(() => {
    if (!active || !bridge) return;
    const unsubscribe = bridge.onProgress((progress) => {
      setProgresses((current) => ({ ...current, [progress.id]: progress }));
    });
    for (const id of DEPENDENCY_IDS) void refresh(id);
    return unsubscribe;
  }, [active, bridge, refresh]);

  const install = async (id: AIAnimeRuntimeDependencyId) => {
    if (!bridge) return;
    setInstalling((current) => ({ ...current, [id]: true }));
    setInstallStartedAt((current) => ({ ...current, [id]: Date.now() }));
    setErrors((current) => ({ ...current, [id]: "" }));
    setProgresses((current) => ({
      ...current,
      [id]: {
        id,
        phase: "manifest",
        message: t("settings.dependencies.preparing"),
      },
    }));
    try {
      const status = await bridge.install(id);
      setStatuses((current) => ({ ...current, [id]: status }));
    } catch (reason) {
      setErrors((current) => ({
        ...current,
        [id]: reason instanceof Error ? reason.message : String(reason),
      }));
    } finally {
      setInstalling((current) => ({ ...current, [id]: false }));
    }
  };

  return (
    <section className="space-y-5 p-6">
      <div>
        <h3 className="text-base font-semibold">
          {t("settings.dependencies.title")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.dependencies.description")}
        </p>
      </div>

      {DEPENDENCY_IDS.map((id) => (
        <DependencyCard
          key={id}
          id={id}
          status={statuses[id]}
          progress={progresses[id]}
          loading={loading[id]}
          installing={installing[id]}
          installStartedAt={installStartedAt[id]}
          error={errors[id]}
          bridgeAvailable={Boolean(bridge)}
          onInstall={() => void install(id)}
          onRefresh={() => void refresh(id)}
        />
      ))}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("settings.dependencies.footnote")}
      </p>
    </section>
  );
}
