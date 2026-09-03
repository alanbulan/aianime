import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskProgress } from "@/components/task-progress";

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

export function RuntimeDependenciesSection({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const bridge = window.aiAnimeDesktop?.runtimeDependencies;
  const [status, setStatus] = useState<AIAnimeRuntimeDependencyStatus | null>(null);
  const [progress, setProgress] = useState<AIAnimeRuntimeDependencyProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installStartedAt, setInstallStartedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    setError("");
    try {
      setStatus(await bridge.status());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    if (!active || !bridge) return;
    const unsubscribe = bridge.onProgress(setProgress);
    void refresh();
    return unsubscribe;
  }, [active, bridge, refresh]);

  const install = async () => {
    if (!bridge) return;
    setInstalling(true);
    setInstallStartedAt(Date.now());
    setError("");
    setProgress({ phase: "manifest", message: t("settings.dependencies.fetchingManifest") });
    try {
      setStatus(await bridge.install());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setInstalling(false);
    }
  };

  const state = installing ? "installing" : status?.state ?? "not-installed";
  const healthy = status?.healthy === true;
  const supported = status?.supported !== false;
  const isIntelMacUnsupported =
    status?.state === "unsupported" &&
    status.platform === "darwin" &&
    status.arch === "x64";
  const totalBytes = progress?.totalBytes ?? status?.downloadSizeBytes;

  return (
    <section className="space-y-5 p-6">
      <div>
        <h3 className="text-base font-semibold">{t("settings.dependencies.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.dependencies.description")}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{t("settings.dependencies.worldName")}</h4>
              <Badge variant={healthy ? "default" : "secondary"}>
                {t(`settings.dependencies.states.${state}`)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {status?.message ?? t("settings.dependencies.notChecked")}
            </p>
          </div>
          {healthy ? (
            <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-5 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t("settings.dependencies.platform")}</dt>
            <dd className="mt-1 font-medium">
              {status ? `${status.platform} / ${status.arch}` : window.aiAnimeDesktop?.platform ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("settings.dependencies.acceleration")}</dt>
            <dd className="mt-1 font-medium">{status?.accelerator ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("settings.dependencies.downloadSize")}</dt>
            <dd className="mt-1 font-medium">{formatBytes(totalBytes)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("settings.dependencies.installedSize")}</dt>
            <dd className="mt-1 font-medium">{formatBytes(status?.installedSizeBytes)}</dd>
          </div>
        </dl>

        {installing || progress ? (
          <div className="mt-5 space-y-2" aria-live="polite">
            <div className="flex justify-between gap-3 text-sm">
              <span>{progress?.message ?? t("settings.dependencies.installing")}</span>
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
                status: error ? 'failed' : installing
                  ? progress?.phase === 'manifest' ? 'queued'
                    : progress?.phase === 'downloading' ? 'running' : 'finalizing'
                  : healthy ? 'completed' : 'failed',
                progress: (progress?.percent ?? 0) / 100,
              }}
              aria-label={t('settings.dependencies.installing')}
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
            className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm leading-relaxed text-foreground"
            role="status"
          >
            {t("settings.dependencies.intelMacUnsupportedNotice")}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void install()}
            disabled={!bridge || !supported || installing || loading}
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
            onClick={() => void refresh()}
            disabled={!bridge || installing || loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            {t("settings.dependencies.check")}
          </Button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("settings.dependencies.footnote")}
      </p>
    </section>
  );
}
