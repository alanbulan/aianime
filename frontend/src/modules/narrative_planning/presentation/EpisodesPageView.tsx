// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clapperboard,
  Loader2,
  MapPinned,
  Package,
  Play,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { EpisodeListItemController } from "@/modules/narrative_planning/application/use-episode-list-item-controller";
import type { EpisodesPageController } from "@/modules/narrative_planning/application/use-episodes-page-controller";
import type { EpisodeStats } from "@/modules/narrative_planning/domain/episode";
import type { Episode } from "@/modules/narrative_planning/domain/types";
import { HealthBar } from "@/components/episode/health-bar";
import {
  EpisodeActionsSlotProvider,
  useEpisodeActionsSlotActive,
  useEpisodeActionsSlotSetter,
} from "@/components/episode/episode-actions-slot";
import { TaskControllerProvider } from "@/modules/task_execution/public";
import {
  CollapsibleHeaderRegion,
  HeaderCollapseProvider,
} from "@/components/episode/header-collapse";
import { StageProgressPanel } from "@/components/stage-progress-panel";
import { CreditCostInline } from "@/components/credit-cost-inline";
import { EpisodeListSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { SUBTLE_HEADER_ACTION_BUTTON_CLASS } from "@/components/ui/header-action-styles";
import { HeaderRefreshButton } from "@/components/ui/header-refresh-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function countContentLines(text: string | undefined): number {
  const trimmed = text?.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

// ─── Episode header 2-column layout ─────────────────────────────────────────
// Left column stacks the episode chrome and the pipeline
// step nav. Right column is a portal target that the active route can fill
// with episode-level batch actions (e.g. BatchBar on the beats page).

function EpisodeHeaderLayout({
  episode,
  project,
}: {
  episode: Episode;
  project: string;
}) {
  const slotActive = useEpisodeActionsSlotActive();
  const setSlotTarget = useEpisodeActionsSlotSetter();
  return (
    <CollapsibleHeaderRegion className="bg-background">
      <div className="flex min-w-0 flex-col">
        <HealthBar project={project} episode={episode.number} />
        {slotActive && (
          <div
            ref={setSlotTarget}
            className="flex min-h-0 w-full min-w-0 justify-center border-b border-border bg-muted px-9 py-3 shadow-sm"
          />
        )}
      </div>
    </CollapsibleHeaderRegion>
  );
}

// ─── Top bar ────────────────────────────────────────────────────────────────

function episodeDisplayTitle(episode: Episode, episodeNumberLabel: string) {
  return episode.title?.trim() || episodeNumberLabel;
}

function EpisodeTitleSwitcher({
  selectedEpisode,
  episodes,
  onSelectEpisode,
}: {
  selectedEpisode: Episode;
  episodes: Episode[];
  onSelectEpisode: (episodeNum: number) => void;
}) {
  const { t } = useTranslation();
  const currentTitle = episodeDisplayTitle(
    selectedEpisode,
    t("episode.list.episodeNumber", { n: selectedEpisode.number }),
  );

  if (episodes.length <= 1) {
    return (
      <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
        {currentTitle}
      </h1>
    );
  }

  return (
    <DropdownMenu>
      <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-foreground">
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="group inline-flex max-w-full items-center gap-2 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label={t("episode.list.switchEpisode")}
            />
          }
        >
          <span className="min-w-0 truncate">{currentTitle}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </DropdownMenuTrigger>
      </h1>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-80 max-h-[min(72vh,30rem)] overflow-hidden border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-xl ring-0 backdrop-blur-2xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-[11px]">
            {t("episode.list.switchEpisode")}
          </DropdownMenuLabel>
          <div className="max-h-[min(62vh,26rem)] overflow-y-auto overscroll-contain pr-1">
            {episodes.map((episode) => {
              const isCurrent = episode.number === selectedEpisode.number;
              const title = episodeDisplayTitle(
                episode,
                t("episode.list.episodeNumber", { n: episode.number }),
              );
              const lines = countContentLines(
                episode.beat_source_text || episode.raw_content,
              );
              const identities = episode.identity_ids?.length ?? 0;
              const scenes = episode.scene_menu?.length ?? 0;
              const props = episode.prop_menu?.length ?? 0;

              return (
                <DropdownMenuItem
                  key={episode.number}
                  onClick={() => {
                    if (!isCurrent) onSelectEpisode(episode.number);
                  }}
                  className={cn(
                    "my-1 items-start gap-3 rounded-[7px] px-2 py-2.5 hover:bg-muted focus:bg-muted",
                    isCurrent && "bg-muted text-foreground",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {title}
                    </span>
                    <span className="mt-1 block truncate text-[11px] !text-muted-foreground">
                      {t("episode.list.episodeSwitchSummary", {
                        lines,
                        identities,
                        scenes,
                        props,
                      })}
                    </span>
                  </span>
                  <Check
                    className={cn(
                      "mt-0.5 size-3.5 shrink-0 !text-primary [&_*]:!text-primary",
                      !isCurrent && "opacity-0",
                    )}
                  />
                </DropdownMenuItem>
              );
            })}
          </div>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopBar({
  showBack,
  onBack,
  showPlan,
  showReplan,
  onPlan,
  planPending,
  planCostDisplay,
  showRefresh,
  onRefresh,
  refreshPending,
  selectedEpisode,
  selectedEpisodeDetail,
  selectedBeatCount,
  episodes,
  onSelectEpisode,
}: {
  showBack: boolean;
  onBack: () => void;
  showPlan: boolean;
  showReplan: boolean;
  onPlan: () => void;
  planPending: boolean;
  planCostDisplay?: string | null;
  showRefresh: boolean;
  onRefresh: () => Promise<boolean>;
  refreshPending: boolean;
  selectedEpisode: Episode | null;
  selectedEpisodeDetail: Episode | null;
  selectedBeatCount: number;
  episodes: Episode[];
  onSelectEpisode: (episodeNum: number) => void;
}) {
  const { t } = useTranslation();
  const episodeDetail = selectedEpisodeDetail ?? selectedEpisode;
  const beatCount = selectedBeatCount;
  const sourceLineCount = countContentLines(
    episodeDetail?.beat_source_text || episodeDetail?.raw_content,
  );
  const identityCount = episodeDetail?.identity_ids?.length ?? 0;
  const sceneCount = episodeDetail?.scene_menu?.length ?? 0;
  const propCount = episodeDetail?.prop_menu?.length ?? 0;
  const headerTitle = selectedEpisode
    ? selectedEpisode.title || t("episode.list.episodeNumber", { n: selectedEpisode.number })
    : t("nav.episodes");
  const headerSubtitle = selectedEpisode
    ? t("episode.list.selectedEpisodeSummary", {
        lines: sourceLineCount,
        beats: beatCount,
        identities: identityCount,
        scenes: sceneCount,
        props: propCount,
        status:
          beatCount > 0
            ? t("episode.list.scriptReady")
            : t("episode.list.scriptPending"),
      })
    : t("episode.list.subtitle");

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-background px-9 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Clapperboard className="size-[18px]" />
        </span>
        <div className="min-w-0">
          {selectedEpisode ? (
            <EpisodeTitleSwitcher
              selectedEpisode={selectedEpisode}
              episodes={episodes}
              onSelectEpisode={onSelectEpisode}
            />
          ) : (
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {headerTitle}
            </h1>
          )}
          <p className="ml-1.5 mt-3 truncate text-sm leading-6 text-muted-foreground">
            {headerSubtitle}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
        {showRefresh && (
          <HeaderRefreshButton
            label={t("episode.list.refresh")}
            onRefresh={onRefresh}
            refreshing={refreshPending}
          />
        )}
        {showReplan && (
          <Button
            size="sm"
            onClick={onPlan}
            disabled={planPending}
            className="h-8 gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-normal text-primary-foreground shadow-none hover:bg-primary/85 active:bg-primary/75"
          >
            {planPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {t("episode.list.replanEpisodes")}
            <CreditCostInline
              display={planCostDisplay}
              className="text-primary-foreground"
              iconClassName="text-primary-foreground drop-shadow-none [&_path]:fill-current"
            />
          </Button>
        )}
        {showPlan && (
          <Button
            size="sm"
            onClick={onPlan}
            disabled={planPending}
            className="h-8 gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-normal text-primary-foreground shadow-none hover:bg-primary/85 active:bg-primary/75"
          >
            {planPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {t("episode.list.planEpisodes")}
            <CreditCostInline
              display={planCostDisplay}
              className="text-primary-foreground"
              iconClassName="text-primary-foreground drop-shadow-none [&_path]:fill-current"
            />
          </Button>
        )}
        {showBack && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className={SUBTLE_HEADER_ACTION_BUTTON_CLASS}
          >
            <ArrowLeft className="size-3.5" />
            {t("episode.list.backToEpisodes")}
          </Button>
        )}
      </div>
    </div>
  );
}

function EpisodeStatsStrip({
  stats,
  totalCharacters,
  completedEpisodes,
}: {
  stats: EpisodeStats;
  totalCharacters: number;
  completedEpisodes: number;
}) {
  const { t } = useTranslation();
  const items: Array<{
    key: string;
    label: string;
    value: number;
    icon: LucideIcon;
    tone?: "ready";
  }> = [
    {
      key: "episodes",
      label: t("episode.list.stats.totalEpisodes"),
      value: stats.totalEpisodes,
      icon: Clapperboard,
    },
    {
      key: "completed",
      label: t("episode.list.stats.completedEpisodes"),
      value: completedEpisodes,
      icon: Clapperboard,
      tone: "ready" as const,
    },
    {
      key: "characters",
      label: t("episode.list.stats.totalCharacters"),
      value: totalCharacters,
      icon: Users,
    },
    {
      key: "identities",
      label: t("episode.list.stats.totalIdentities"),
      value: stats.totalIdentities,
      icon: Users,
    },
    {
      key: "scenes",
      label: t("episode.list.stats.totalScenes"),
      value: stats.totalScenes,
      icon: MapPinned,
    },
    {
      key: "props",
      label: t("episode.list.stats.totalProps"),
      value: stats.totalProps,
      icon: Package,
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 py-1.5">
      {items.map(({ key, label, value, icon: Icon, tone }) => (
        <div key={key} className="flex items-center gap-2">
          <Icon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground",
              tone === "ready" && "text-success",
            )}
          />
          <div className="flex items-center gap-5">
            <span className="truncate text-[11px] text-muted-foreground">
              {label}
            </span>
            <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
              {value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EpisodePlanShortcut({
  icon,
  summary,
  actionLabel,
  costDisplay,
  pending,
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode;
  summary: string;
  actionLabel: string;
  costDisplay?: string | null;
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="group flex min-w-0 items-center gap-2 rounded-[8px] bg-muted px-2 py-1 transition-colors hover:bg-accent">
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span className="truncate">{summary}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        disabled={pending || disabled}
        aria-label={actionLabel}
        data-ui-tooltip={actionLabel}
        className="h-7 shrink-0 gap-1 rounded-[7px] bg-transparent px-2 text-[11px] font-normal text-foreground shadow-none transition-colors hover:bg-primary/12 hover:text-primary disabled:bg-transparent disabled:text-muted-foreground/50 [&_svg]:size-3"
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Sparkles className="size-3" />
        )}
        {actionLabel}
        <CreditCostInline display={costDisplay} />
      </Button>
    </div>
  );
}

// ─── Episode list item ──────────────────────────────────────────────────────

export function EpisodeListItemView({
  controller,
}: {
  controller: EpisodeListItemController;
}) {
  const { t } = useTranslation();
  const {
    episode,
    handlePlanIdentities,
    handlePlanProps,
    handlePlanScenes,
    identityCostDisplay,
    identityCount,
    identityPending,
    onSelect,
    propCostDisplay,
    propCount,
    propPending,
    sceneCostDisplay,
    sceneCount,
    scenePending,
    shotCount,
    snippet,
  } = controller;
  const title =
    episode.title?.trim() || t("episode.list.episodeNumber", { n: episode.number });
  const identityLabel =
    identityCount > 0
      ? t("episode.list.identityCount", { count: identityCount })
      : t("episode.list.noIdentities");
  const sceneLabel =
    sceneCount > 0
      ? t("episode.list.sceneCount", { count: sceneCount })
      : t("episode.list.noScenes");
  const propLabel =
    propCount > 0
      ? t("episode.list.propCount", { count: propCount })
      : t("episode.list.noProps");

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex h-full min-h-[13rem] w-full flex-col gap-2 rounded-[10px] border border-border bg-card p-3 text-left transition-all duration-200 ease-out",
        "hover:scale-[1.01] hover:border-foreground/25 hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex min-w-0 items-center">
        <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
          {title}
        </h3>
      </div>

      {snippet && (
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground/80">
          {snippet}
        </p>
      )}

      {shotCount != null && (
        <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Clapperboard className="size-3.5 shrink-0 text-primary" />
          <span>{t("episode.list.shotCount", { count: shotCount })}</span>
        </div>
      )}

      <div className="grid gap-1.5 pt-1">
        <EpisodePlanShortcut
          icon={<Users className="size-3.5 shrink-0 text-primary" />}
          summary={identityLabel}
          actionLabel={
            identityCount > 0
              ? t("episode.list.replanIdentities")
              : t("episode.list.planIdentities")
          }
          pending={identityPending}
          disabled={identityPending}
          costDisplay={identityCostDisplay}
          onClick={handlePlanIdentities}
        />
        <EpisodePlanShortcut
          icon={<MapPinned className="size-3.5 shrink-0 text-success" />}
          summary={sceneLabel}
          actionLabel={
            sceneCount > 0
              ? t("episode.list.replanScenes")
              : t("episode.list.planScenes")
          }
          pending={scenePending}
          disabled={scenePending}
          costDisplay={sceneCostDisplay}
          onClick={handlePlanScenes}
        />
        <EpisodePlanShortcut
          icon={<Package className="size-3.5 shrink-0 text-warning" />}
          summary={propLabel}
          actionLabel={
            propCount > 0
              ? t("episode.list.replanProps")
              : t("episode.list.planProps")
          }
          pending={propPending}
          disabled={propPending}
          costDisplay={propCostDisplay}
          onClick={handlePlanProps}
        />
      </div>

      <div className="mt-auto pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className="h-8 w-full justify-center gap-1.5 rounded-[8px] border-border bg-muted px-3 text-xs font-normal text-foreground shadow-none hover:border-primary/45 hover:bg-primary/12 hover:text-primary"
        >
          {t("episode.list.viewDetails")}
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function EpisodesPageView({
  controller,
  episodeContent,
  renderEpisodeListItem,
}: {
  controller: EpisodesPageController;
  episodeContent: ReactNode;
  renderEpisodeListItem: (episode: Episode) => ReactNode;
}) {
  const { t } = useTranslation();
  const {
    completedEpisodes,
    displayEpisodes,
    handlePlan,
    handleRefresh,
    isLoading,
    onBackToEpisodes,
    onSelectEpisode,
    planEpisodesCostDisplay,
    planPending,
    planTask,
    project,
    refreshPending,
    selectedBeatCount,
    selectedEpisode,
    selectedEpisodeDetail,
    stats,
    totalCharacters,
  } = controller;

  const topBar = (
    <TopBar
      showBack={!!selectedEpisode}
      onBack={onBackToEpisodes}
      showPlan={!selectedEpisode && displayEpisodes.length === 0}
      showReplan={!selectedEpisode && displayEpisodes.length > 0}
      onPlan={handlePlan}
      planPending={planPending}
      planCostDisplay={planEpisodesCostDisplay}
      showRefresh={!selectedEpisode}
      onRefresh={handleRefresh}
      refreshPending={refreshPending}
      selectedEpisode={selectedEpisode}
      selectedEpisodeDetail={selectedEpisodeDetail}
      selectedBeatCount={selectedBeatCount}
      episodes={displayEpisodes}
      onSelectEpisode={onSelectEpisode}
    />
  );

  return (
    <HeaderCollapseProvider>
    <div className="-m-6 flex h-[calc(100%+3rem)] flex-col overflow-hidden">
      {selectedEpisode ? (
        <CollapsibleHeaderRegion>{topBar}</CollapsibleHeaderRegion>
      ) : (
        topBar
      )}

      {planTask.started && planTask.stream.status !== "idle" && (
        <StageProgressPanel
          title={t("episode.list.planning")}
          currentTask={planTask.stream.currentTask}
          progress={planTask.stream.progress}
          logs={planTask.logs}
          onStop={planTask.stop}
          stopping={planTask.stopping}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {selectedEpisode ? (
          <TaskControllerProvider
            project={project}
            episode={selectedEpisode.number}
          >
            <EpisodeActionsSlotProvider>
              <div className="flex min-h-0 flex-1 flex-col">
                <EpisodeHeaderLayout
                  episode={selectedEpisode}
                  project={project}
                />
                <div className="min-h-0 flex-1 overflow-hidden">
                  {episodeContent}
                </div>
              </div>
            </EpisodeActionsSlotProvider>
          </TaskControllerProvider>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!isLoading && (
              <div className="shrink-0 border-b border-border bg-background px-3 py-3 lg:px-9">
                <EpisodeStatsStrip
                  stats={stats}
                  totalCharacters={totalCharacters}
                  completedEpisodes={completedEpisodes}
                />
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <EpisodeListSkeleton label={t("common.loading")} />
              ) : displayEpisodes.length === 0 ? (
                <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
                  <div className="flex size-16 items-center justify-center rounded-full border border-border bg-muted">
                    <Clapperboard className="size-6 text-muted-foreground" />
                  </div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {t("episode.list.noEpisodes")}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {t("episode.list.noEpisodesHint")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePlan}
                    disabled={planPending}
                    className="mt-2 h-8 gap-1.5 rounded-[8px] border-border bg-transparent px-3 text-xs font-normal shadow-none hover:bg-muted"
                  >
                    {planPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    {t("episode.list.planEpisodes")}
                    <CreditCostInline display={planEpisodesCostDisplay} />
                  </Button>
                </div>
              ) : (
                // 卡片内的场景/道具规划由单卡 controller 订阅任务，需要一个
                // 注册表宿主。列表不绑定单集，用 episode=0 作为宿主 scope；每张卡
                // 片的 key 里带自己的集数，彼此互不干扰。
                <TaskControllerProvider project={project} episode={0}>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                    {displayEpisodes.map(renderEpisodeListItem)}
                  </div>
                </TaskControllerProvider>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </HeaderCollapseProvider>
  );
}
