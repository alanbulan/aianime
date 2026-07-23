// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  ArchiveRestore,
  BookOpen,
  Brush,
  FolderOpen,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  Trash2,
  Undo2,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getProjectCover, NOISE_DATA_URI } from "@/lib/project-cover";
import { formatRelativeTime } from "@/lib/relative-time";
import {
  canDeleteProject,
  isSharedProject,
  projectRole,
} from "@/modules/project_workspace/domain/project-permissions";
import { cn } from "@/lib/utils";
import type { ProjectDashboardController } from "@/modules/project_workspace/application/use-project-dashboard-controller";
import type { ShareProjectController } from "@/modules/project_workspace/application/use-share-project-controller";
import {
  projectRouteParam,
  type ProjectSortKey,
} from "@/modules/project_workspace/domain/project-dashboard";
import type {
  ProjectDashboardViewMode,
  ProjectLifecycleAction,
  ProjectStatus,
  ProjectSummary,
} from "@/modules/project_workspace/domain/project";
import { ProjectFolder } from "@/modules/project_workspace/presentation/components/project-folder";
import { ShareProjectDialogView } from "@/modules/project_workspace/presentation/components/share-project-dialog";

const SORT_OPTIONS: { value: ProjectSortKey; labelKey: string }[] = [
  { value: "updated-desc", labelKey: "project.sort.updatedDesc" },
  { value: "updated-asc", labelKey: "project.sort.updatedAsc" },
  { value: "name-asc", labelKey: "project.sort.nameAsc" },
  { value: "name-desc", labelKey: "project.sort.nameDesc" },
];

const PROJECT_CARD_MIN_HEIGHT_CLASS = "min-h-[12.75rem]";

function ProjectCard({
  summary,
  size = "md",
  canManageGrants,
  onOpen,
  onOpenCanvas,
  onPreload,
  onShare,
  onAction,
}: {
  summary: ProjectSummary;
  size?: "md" | "sm";
  canManageGrants: boolean;
  onOpen: () => void;
  onOpenCanvas: () => void;
  onPreload?: () => void;
  onShare: () => void;
  onAction: (action: ProjectLifecycleAction) => void;
}) {
  const { t } = useTranslation();
  const { initial, primary } = useMemo(
    () => getProjectCover(summary.name),
    [summary.name],
  );
  const isActive = summary.status === "active";
  const isArchived = summary.status === "archived";
  const isDeleted = summary.status === "deleted";
  const canLifecycle = canDeleteProject(summary);
  const isShared = isSharedProject(summary);
  const roleLabel = t(`project.roleLabel.${projectRole(summary)}`);
  const sourceLabel = isShared
    ? t("project.ownership.from", {
        owner: summary.ownerUsername || t("project.ownership.unknownOwner"),
      })
    : t("project.ownership.mine");
  const ownershipMetaLabel = `${sourceLabel} / ${roleLabel}`;
  const visibleOwnershipLabel = isShared ? ownershipMetaLabel : sourceLabel;

  const relativeEdited = summary.updatedAt
    ? formatRelativeTime(summary.updatedAt, t)
    : null;
  const relativeDeleted = summary.deletedAt
    ? formatRelativeTime(summary.deletedAt, t)
    : null;

  const clickable = !isDeleted;
  const containerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-project-menu]")) return;
    if (clickable) onOpen();
  };

  const sm = size === "sm";

  return (
    <div
      onFocus={() => {
        if (clickable) onPreload?.();
      }}
      onMouseEnter={() => {
        if (clickable) onPreload?.();
      }}
      onClick={containerClick}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={cn(
        "group relative flex h-full flex-col rounded-lg border border-border bg-card transition-all duration-300 ease-out",
        PROJECT_CARD_MIN_HEIGHT_CLASS,
        sm ? "p-2 pt-4" : "p-3 pt-5",
        clickable &&
          "cursor-pointer hover:border-primary/35 hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        isArchived && "opacity-80",
        isDeleted && "opacity-65",
      )}
    >
      <div className="mx-auto flex w-full flex-col">
        <div
          className={cn(
            "project-cover relative mx-auto mb-3 flex aspect-[16/10] w-[90%] items-end justify-center overflow-visible rounded-lg pb-1",
            isDeleted && "grayscale",
          )}
        >
          <ProjectFolder
            color={primary}
            initial={initial}
            width="100%"
            size={sm ? 0.92 : 1}
            className="translate-y-1"
          />
          {isArchived && (
            <div className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm">
              {t("project.archivedBadge")}
            </div>
          )}
        </div>

        <div className="flex w-full items-start justify-between gap-1">
          <h3
            className="ml-[5%] min-w-0 truncate text-sm font-semibold text-foreground"
            title={summary.name}
          >
            {summary.name}
          </h3>
          <div
            data-project-menu
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="shrink-0 p-0.5 text-muted-foreground opacity-0 transition-colors hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={t("project.actionsLabel")}
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="start"
                sideOffset={8}
                className="w-32 rounded-md border border-border p-1 shadow-xl [&_[data-slot=dropdown-menu-item]]:min-h-8 [&_[data-slot=dropdown-menu-item]]:gap-2 [&_[data-slot=dropdown-menu-item]]:rounded-sm [&_[data-slot=dropdown-menu-item]]:px-2 [&_[data-slot=dropdown-menu-item]]:py-1.5 [&_[data-slot=dropdown-menu-item]]:text-xs [&_[data-slot=dropdown-menu-item]:focus]:bg-accent [&_[data-slot=dropdown-menu-item]:focus]:text-accent-foreground [&_[data-slot=dropdown-menu-item][data-variant=destructive]:focus]:bg-destructive/10 [&_[data-slot=dropdown-menu-item][data-variant=destructive]:focus]:text-destructive [&_[data-slot=dropdown-menu-item]_svg]:size-3.5"
              >
                <DropdownMenuGroup>
                  {isActive && (
                    <>
                      <DropdownMenuItem onClick={onOpen}>
                        <FolderOpen className="size-4" />
                        {t("project.actions.open")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={onOpenCanvas}
                      >
                        <Brush className="size-4" />
                        {t("project.actions.openFreezone")}
                      </DropdownMenuItem>
                      {canLifecycle && (
                        <>
                          <DropdownMenuItem onClick={() => onAction("archive")}>
                            <ArchiveRestore className="size-4" />
                            {t("project.actions.archive")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onAction("delete")}
                            variant="destructive"
                          >
                            <Trash2 className="size-4" />
                            {t("project.actions.delete")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                  {isArchived && (
                    <>
                      <DropdownMenuItem onClick={onOpen}>
                        <FolderOpen className="size-4" />
                        {t("project.actions.open")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={onOpenCanvas}
                      >
                        <Brush className="size-4" />
                        {t("project.actions.openFreezone")}
                      </DropdownMenuItem>
                      {canManageGrants && (
                        <DropdownMenuItem onClick={onShare}>
                          <Share2 className="size-4" />
                          {t("project.actions.share")}
                        </DropdownMenuItem>
                      )}
                      {canLifecycle && (
                        <>
                          <DropdownMenuItem onClick={() => onAction("unarchive")}>
                            <ArchiveRestore className="size-4" />
                            {t("project.actions.unarchive")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onAction("delete")}
                            variant="destructive"
                          >
                            <Trash2 className="size-4" />
                            {t("project.actions.delete")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                  {isDeleted && (
                    <>
                      {canLifecycle && (
                        <>
                          <DropdownMenuItem onClick={() => onAction("restore")}>
                            <Undo2 className="size-4" />
                            {t("project.actions.restore")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onAction("purge")}
                            variant="destructive"
                          >
                            <Trash2 className="size-4" />
                            {t("project.actions.purge")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!isDeleted && (
          <div className="mx-auto mt-2 flex w-[90%] min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground tabular-nums">
            <span className="tabular-nums">
              {t("project.card.episodes", { count: summary.episodeCount ?? 0 })}
            </span>
            {relativeEdited ? (
              <>
                <span className="text-muted-foreground" aria-hidden>
                  ·
                </span>
                <span className="min-w-0 truncate">
                  {t("project.card.editedAgo", { time: relativeEdited })}
                </span>
              </>
            ) : null}
          </div>
        )}

        {isDeleted && (
          <div className="mt-1 text-[11px] tabular-nums text-muted-foreground/80">
            <span className="font-medium text-destructive">
              {relativeDeleted
                ? t("project.card.deletedAgo", { time: relativeDeleted })
                : t("project.archivedBadge")}
            </span>
          </div>
        )}

        {!isDeleted && (
          <div className="mt-3.5 flex min-w-0 items-center justify-between gap-1.5 text-[10px] leading-none text-muted-foreground/80">
            <div className="ml-[5%] flex min-w-0 items-center gap-1.5" title={ownershipMetaLabel}>
              <span className="min-w-0 truncate">{visibleOwnershipLabel}</span>
              {!isShared ? <span className="sr-only">{roleLabel}</span> : null}
            </div>
            {isActive && canManageGrants ? (
              <button
                type="button"
                data-project-menu
                onClick={(e) => {
                  e.stopPropagation();
                  onShare();
                }}
                className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label={t("project.actions.share")}
              >
                <Share2 className="size-3" />
                <span>{t("project.actions.share")}</span>
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateProjectCard({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onCreate}
      className={cn(
        "group flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-3 text-center text-muted-foreground transition-all duration-300 ease-out",
        PROJECT_CARD_MIN_HEIGHT_CLASS,
        "hover:border-primary/35 hover:bg-accent hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
      )}
    >
      <Plus
        className="mb-3 size-7 stroke-[1px] text-muted-foreground transition-colors group-hover:text-foreground"
        aria-hidden="true"
      />
      <span className="text-sm font-normal text-muted-foreground transition-colors group-hover:text-foreground">
        {t("project.createCard")}
      </span>
    </button>
  );
}

function DashboardTabStrip({
  current,
  counts,
  onChange,
}: {
  current: ProjectStatus;
  counts: Record<ProjectStatus, number>;
  onChange: (v: ProjectStatus) => void;
}) {
  const { t } = useTranslation();
  const tabs: { value: ProjectStatus; label: string }[] = [
    { value: "active", label: t("project.statusActive") },
    { value: "archived", label: t("project.statusArchived") },
    { value: "deleted", label: t("project.statusDeleted") },
  ];
  return (
    <div className="inline-flex h-8 items-center rounded-full border border-border bg-card p-1 text-xs shadow-xs">
      {tabs.map((tab) => {
        const active = current === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full px-3 font-normal transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{tab.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                active
                  ? "bg-primary-foreground/15 text-primary-foreground"
                  : "bg-accent text-muted-foreground",
              )}
            >
              {counts[tab.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ProjectRow({
  summary,
  canManageGrants,
  onOpen,
  onOpenCanvas,
  onPreload,
  onShare,
  onAction,
}: {
  summary: ProjectSummary;
  canManageGrants: boolean;
  onOpen: () => void;
  onOpenCanvas: () => void;
  onPreload?: () => void;
  onShare: () => void;
  onAction: (action: ProjectLifecycleAction) => void;
}) {
  const { t } = useTranslation();
  const { gradient, initial } = useMemo(
    () => getProjectCover(summary.name),
    [summary.name],
  );
  const isActive = summary.status === "active";
  const isArchived = summary.status === "archived";
  const isDeleted = summary.status === "deleted";
  const canLifecycle = canDeleteProject(summary);
  const roleLabel = t(`project.roleLabel.${projectRole(summary)}`);
  const sourceLabel = isSharedProject(summary)
    ? t("project.ownership.from", {
        owner: summary.ownerUsername || t("project.ownership.unknownOwner"),
      })
    : t("project.ownership.mine");

  const relativeEdited = summary.updatedAt
    ? formatRelativeTime(summary.updatedAt, t)
    : null;
  const relativeDeleted = summary.deletedAt
    ? formatRelativeTime(summary.deletedAt, t)
    : null;

  const clickable = !isDeleted;
  const rowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-project-menu]")) return;
    if (clickable) onOpen();
  };

  return (
    <div
      onFocus={() => {
        if (clickable) onPreload?.();
      }}
      onMouseEnter={() => {
        if (clickable) onPreload?.();
      }}
      onClick={rowClick}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 transition-colors",
        clickable &&
          "cursor-pointer hover:border-primary/35",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        isArchived && "opacity-80",
        isDeleted && "opacity-65",
      )}
    >
      <div
        className={cn(
          "relative size-10 shrink-0 overflow-hidden rounded-[9px]",
          isDeleted && "grayscale",
        )}
        style={{ background: gradient }}
      >
        <div
          aria-hidden
          className="absolute inset-0 mix-blend-overlay opacity-[0.08]"
          style={{
            backgroundImage: `url("${NOISE_DATA_URI}")`,
            backgroundSize: "200px 200px",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-lg font-bold leading-none text-media-foreground/95 drop-shadow-md"
            style={{ fontFeatureSettings: '"cv01", "ss03"' }}
          >
            {initial}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h3
          className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
          title={summary.name}
        >
          {summary.name}
        </h3>
        <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
          {sourceLabel}
        </span>
        <span className="hidden shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary sm:inline">
          {roleLabel}
        </span>
        {isArchived && (
          <span className="hidden shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            {t("project.archivedBadge")}
          </span>
        )}
        {!isDeleted && summary.episodeCount != null && (
          <div className="hidden shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground/80 md:flex">
            <span>
              {t("project.card.episodes", {
                count: summary.episodeCount ?? 0,
              })}
            </span>
          </div>
        )}
        <div className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
          {isDeleted
            ? relativeDeleted
              ? t("project.card.deletedAgo", { time: relativeDeleted })
              : t("project.archivedBadge")
            : relativeEdited
              ? t("project.card.editedAgo", { time: relativeEdited })
              : null}
        </div>
      </div>

      {isActive && canManageGrants && (
        <button
          type="button"
          data-project-menu
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label={t("project.actions.share")}
        >
          <Share2 className="size-3.5" />
          <span className="hidden sm:inline">{t("project.actions.share")}</span>
        </button>
      )}

      <div
        data-project-menu
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={t("project.actionsLabel")}
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-32 rounded-md border border-border p-1 shadow-xl [&_[data-slot=dropdown-menu-item]]:min-h-8 [&_[data-slot=dropdown-menu-item]]:gap-2 [&_[data-slot=dropdown-menu-item]]:rounded-sm [&_[data-slot=dropdown-menu-item]]:px-2 [&_[data-slot=dropdown-menu-item]]:py-1.5 [&_[data-slot=dropdown-menu-item]]:text-xs [&_[data-slot=dropdown-menu-item]:focus]:bg-accent [&_[data-slot=dropdown-menu-item]:focus]:text-accent-foreground [&_[data-slot=dropdown-menu-item][data-variant=destructive]:focus]:bg-destructive/10 [&_[data-slot=dropdown-menu-item][data-variant=destructive]:focus]:text-destructive [&_[data-slot=dropdown-menu-item]_svg]:size-3.5"
          >
            <DropdownMenuGroup>
              {isActive && (
                <>
                  <DropdownMenuItem onClick={onOpen}>
                    <FolderOpen className="size-4" />
                    {t("project.actions.open")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onOpenCanvas}
                  >
                    <Brush className="size-4" />
                    {t("project.actions.openFreezone")}
                  </DropdownMenuItem>
                  {canLifecycle && (
                    <>
                      <DropdownMenuItem onClick={() => onAction("archive")}>
                        <ArchiveRestore className="size-4" />
                        {t("project.actions.archive")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onAction("delete")}
                        variant="destructive"
                      >
                        <Trash2 className="size-4" />
                        {t("project.actions.delete")}
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
              {isArchived && (
                <>
                  <DropdownMenuItem onClick={onOpen}>
                    <FolderOpen className="size-4" />
                    {t("project.actions.open")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onOpenCanvas}
                  >
                    <Brush className="size-4" />
                    {t("project.actions.openFreezone")}
                  </DropdownMenuItem>
                  {canManageGrants && (
                    <DropdownMenuItem onClick={onShare}>
                      <Share2 className="size-4" />
                      {t("project.actions.share")}
                    </DropdownMenuItem>
                  )}
                  {canLifecycle && (
                    <>
                      <DropdownMenuItem onClick={() => onAction("unarchive")}>
                        <ArchiveRestore className="size-4" />
                        {t("project.actions.unarchive")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onAction("delete")}
                        variant="destructive"
                      >
                        <Trash2 className="size-4" />
                        {t("project.actions.delete")}
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
              {isDeleted && (
                <>
                  {canLifecycle && (
                    <>
                      <DropdownMenuItem onClick={() => onAction("restore")}>
                        <Undo2 className="size-4" />
                        {t("project.actions.restore")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onAction("purge")}
                        variant="destructive"
                      >
                        <Trash2 className="size-4" />
                        {t("project.actions.purge")}
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ProjectDashboardViewMode;
  onChange: (v: ProjectDashboardViewMode) => void;
}) {
  const { t } = useTranslation();
  const options: {
    value: ProjectDashboardViewMode;
    labelKey: string;
    Icon: typeof LayoutGrid;
  }[] = [
    { value: "card", labelKey: "project.view.card", Icon: LayoutGrid },
    { value: "list", labelKey: "project.view.list", Icon: ListIcon },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("project.view.toggle")}
      className="inline-flex h-8 items-center rounded-full border border-border bg-card p-1 text-xs shadow-xs"
    >
      {options.map(({ value: v, labelKey, Icon }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={t(labelKey)}
            title={t(labelKey)}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex h-6 items-center justify-center rounded-full px-2 font-normal transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

function LoadingList() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
        >
          <div className="size-10 rounded-md bg-muted" />
          <div className="h-4 w-1/3 rounded bg-muted" />
          <div className="ml-auto h-3 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function LoadingGrid({ size = "md" }: { size?: "md" | "sm" }) {
  const sm = size === "sm";
  return (
    <div
      className={cn(
        "grid gap-4",
        sm
          ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8"
          : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7",
      )}
    >
      {Array.from({ length: sm ? 8 : 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex animate-pulse flex-col rounded-xl border border-border bg-card",
            sm ? "p-2" : "p-3",
          )}
        >
          <div className="mb-3 aspect-[16/10] rounded-lg bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="mt-1 h-3 w-1/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function FirstTimeEmpty({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  const { gradient } = useMemo(() => getProjectCover("empty-dashboard"), []);
  return (
    <div className="flex flex-col items-center justify-center pt-12 text-center">
      <div className="relative mb-6">
        <div
          className="size-32 rounded-full blur-3xl opacity-50"
          style={{ background: gradient }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <BookOpen className="size-8 text-media-foreground/80 drop-shadow-lg" />
        </div>
      </div>
      <h3 className="mb-5 text-xl font-bold tracking-tight text-foreground">
        {t("project.heroTitle")}
      </h3>
      <p className="mb-8 text-sm text-muted-foreground">
        {t("project.heroDescription")}
      </p>
      <Button
        onClick={onCreate}
        size="lg"
        className="gap-2 rounded-[10px] px-6"
      >
        <Plus className="size-4" />
        {t("project.heroButton")}
      </Button>
    </div>
  );
}

function TabEmpty({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-10 text-center shadow-xs">
      <h3 className="mb-1 text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

function ActiveEmptyWithCreate({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
      <div>
        <CreateProjectCard onCreate={onCreate} />
      </div>
    </div>
  );
}

function PurgeDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const canConfirm = input.trim() === name;

  // Reset input when dialog closes
  const handleOpenChange = (v: boolean) => {
    if (!v) setInput("");
    onOpenChange(v);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("project.purgeDialog.title", { name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("project.purgeDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="relative mt-5 flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">
            {t("project.purgeDialog.typeHint")}
          </label>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={name}
            autoFocus
            className="h-11 rounded-md border-border bg-muted px-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!canConfirm}
            className="min-w-24"
            onClick={() => {
              onConfirm();
              handleOpenChange(false);
            }}
          >
            {t("project.purgeDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ArchiveDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("project.archiveDialog.title", { name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("project.archiveDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t("project.archiveDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteDialog({
  name,
  open,
  onOpenChange,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("project.deleteDialog.title", { name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("project.deleteDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t("project.deleteDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ProjectDashboardView({
  controller,
  shareController,
  sharingEnabled,
}: {
  controller: ProjectDashboardController;
  shareController: ShareProjectController;
  sharingEnabled: boolean;
}) {
  const { t } = useTranslation();
  const {
    activeList,
    allSummariesLoading,
    archivedList,
    canManageProjectGrants,
    confirmPending,
    createNameError,
    createOpen,
    currentTab,
    deletedList,
    handleCreate,
    isCreating,
    newName,
    onAction,
    openCanvas,
    openProject,
    pending,
    preloadProject,
    search,
    searchInputRef,
    setCreateOpen,
    setCurrentTab,
    setNewName,
    setPending,
    setSearch,
    setShareProject,
    setSort,
    setView,
    shareProject,
    sort,
    statusCounts,
    totalProjects,
    trimmedNewName,
    view,
    wasColdOnMount,
  } = controller;

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Header strip */}
      <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("project.dashboardTitle")}
          </h1>
          <p className="mt-[12px] text-[13px] font-medium text-muted-foreground">
            {t("project.dashboardSubtitle")}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {totalProjects > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("project.searchPlaceholder")}
                className="h-9 w-[min(15rem,calc(100vw-3rem))] rounded-full border-border bg-card pl-8 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 md:text-xs"
              />
            </div>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="gap-4 overflow-hidden rounded-xl border border-border bg-popover p-7 shadow-xl sm:max-w-md">
              <DialogHeader className="gap-2">
                <DialogTitle className="flex items-center gap-2 text-lg font-medium tracking-tight">
                  <span aria-hidden="true">✨</span>
                  <span>{t("project.create")}</span>
                </DialogTitle>
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("project.emptyDescription")}
                </p>
              </DialogHeader>
              <div className="mt-2 flex flex-col gap-2">
                <div className="relative">
                  <Input
                    id="project-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t("project.namePlaceholder")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreate();
                      }
                    }}
                    aria-invalid={!!createNameError || undefined}
                    aria-describedby={createNameError ? "project-name-error" : undefined}
                    autoFocus
                    className="h-11 rounded-[8px] border-input bg-background px-3 pr-10 text-sm placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                  />
                  {newName && (
                    <button
                      type="button"
                      onClick={() => setNewName("")}
                      className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={t("project.clearName")}
                    >
                      <XIcon className="size-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
                {createNameError && (
                  <p
                    id="project-name-error"
                    className="text-xs text-destructive"
                  >
                    {createNameError}
                  </p>
                )}
              </div>
              <DialogFooter className="-mx-7 -mb-7 border-t-0 bg-transparent p-7 pt-3 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  className="h-10 w-18 rounded-md border-border bg-card px-0 text-sm font-normal text-foreground/80 hover:border-ring/50 hover:bg-muted hover:text-foreground"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={
                    isCreating || !trimmedNewName || !!createNameError
                  }
                  className="h-10 w-18 rounded-md bg-primary px-0 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
                >
                  {isCreating && (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {t("common.confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tab strip + sort */}
      <div className="mb-10 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2">
          <DashboardTabStrip
            current={currentTab}
            counts={statusCounts}
            onChange={setCurrentTab}
          />
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as ProjectSortKey)}
          >
            <SelectTrigger
              size="sm"
              className="h-8 gap-1 rounded-full border-border bg-transparent px-3 text-xs text-muted-foreground hover:bg-foreground/[0.04] data-[size=sm]:h-8 data-[size=sm]:rounded-full dark:bg-transparent dark:hover:bg-foreground/[0.04]"
            >
              <SelectValue>
                {(value: string) => {
                  const opt = SORT_OPTIONS.find((o) => o.value === value);
                  return opt ? t(opt.labelKey) : value;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              align="end"
              sideOffset={8}
              alignItemWithTrigger={false}
              className="w-40 rounded-md border border-border p-1 shadow-xl data-[align-trigger=true]:animate-in [&_[data-slot=select-item]]:min-h-8 [&_[data-slot=select-item]]:rounded-sm [&_[data-slot=select-item]]:px-2 [&_[data-slot=select-item]]:py-1.5 [&_[data-slot=select-item]]:text-xs [&_[data-slot=select-item]:focus]:bg-accent [&_[data-slot=select-item]:focus]:text-accent-foreground [&_[data-slot=select-item]_svg]:size-3.5"
            >
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {currentTab === "deleted" && deletedList.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("project.trashRetentionHint")}
          </p>
        )}
        <div className="ml-auto flex items-center">
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {/* Grid / list / empty states */}
      {allSummariesLoading ? (
        view === "list" ? (
          <LoadingList />
        ) : (
          <LoadingGrid size="md" />
        )
      ) : (
        (() => {
          const list =
            currentTab === "active"
              ? activeList
              : currentTab === "archived"
                ? archivedList
                : deletedList;

          if (list.length === 0) {
            if (currentTab === "active") {
              const realProjects = statusCounts.active + statusCounts.archived;
              return realProjects === 0 ? (
                <FirstTimeEmpty onCreate={() => setCreateOpen(true)} />
              ) : (
                <ActiveEmptyWithCreate
                  onCreate={() => setCreateOpen(true)}
                />
              );
            }
            if (currentTab === "archived") {
              return (
                <TabEmpty
                  title={t("project.emptyArchived")}
                  description={t("project.emptyArchivedDescription")}
                />
              );
            }
            return (
              <TabEmpty
                title={t("project.emptyTrash")}
                description={t("project.emptyTrashDescription")}
              />
            );
          }

          return (
            <motion.div
              initial={wasColdOnMount ? "hidden" : false}
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.03 } },
              }}
              className={cn(
                view === "list"
                  ? "flex flex-col gap-3"
                  : "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7",
              )}
            >
              {currentTab === "active" && view === "card" && (
                <motion.div
                  className="h-full w-full"
                  variants={{
                    hidden: { opacity: 0.6 },
                    visible: {
                      opacity: 1,
                      transition: { duration: 0.12, ease: "easeOut" },
                    },
                  }}
                >
                  <CreateProjectCard onCreate={() => setCreateOpen(true)} />
                </motion.div>
              )}
              {list.slice(0, 20).map((summary) => (
                <motion.div
                  key={projectRouteParam(summary)}
                  variants={{
                    hidden: { opacity: 0.6 },
                    visible: {
                      opacity: 1,
                      transition: { duration: 0.12, ease: "easeOut" },
                    },
                  }}
                >
                  {view === "list" ? (
                    <ProjectRow
                      summary={summary}
                      canManageGrants={canManageProjectGrants(summary)}
                      onOpen={() => openProject(projectRouteParam(summary))}
                      onOpenCanvas={() => openCanvas(projectRouteParam(summary))}
                      onPreload={() => preloadProject(projectRouteParam(summary))}
                      onShare={() => setShareProject(summary)}
                      onAction={(action) => onAction(summary, action)}
                    />
                  ) : (
                    <ProjectCard
                      summary={summary}
                      size="md"
                      canManageGrants={canManageProjectGrants(summary)}
                      onOpen={() => openProject(projectRouteParam(summary))}
                      onOpenCanvas={() => openCanvas(projectRouteParam(summary))}
                      onPreload={() => preloadProject(projectRouteParam(summary))}
                      onShare={() => setShareProject(summary)}
                      onAction={(action) => onAction(summary, action)}
                    />
                  )}
                </motion.div>
              ))}
              {list
                .slice(20)
                .map((summary) =>
                  view === "list" ? (
                    <ProjectRow
                      key={projectRouteParam(summary)}
                      summary={summary}
                      canManageGrants={canManageProjectGrants(summary)}
                      onOpen={() => openProject(projectRouteParam(summary))}
                      onOpenCanvas={() => openCanvas(projectRouteParam(summary))}
                      onPreload={() => preloadProject(projectRouteParam(summary))}
                      onShare={() => setShareProject(summary)}
                      onAction={(action) => onAction(summary, action)}
                    />
                  ) : (
                    <ProjectCard
                      key={projectRouteParam(summary)}
                      summary={summary}
                      size="md"
                      canManageGrants={canManageProjectGrants(summary)}
                      onOpen={() => openProject(projectRouteParam(summary))}
                      onOpenCanvas={() => openCanvas(projectRouteParam(summary))}
                      onPreload={() => preloadProject(projectRouteParam(summary))}
                      onShare={() => setShareProject(summary)}
                      onAction={(action) => onAction(summary, action)}
                    />
                  ),
                )}
            </motion.div>
          );
        })()
      )}

      {/* Dialogs */}
      <ArchiveDialog
        name={pending?.kind === "archive" ? pending.name : ""}
        open={pending?.kind === "archive"}
        onOpenChange={(v) => !v && setPending(null)}
        onConfirm={confirmPending}
      />
      <DeleteDialog
        name={pending?.kind === "delete" ? pending.name : ""}
        open={pending?.kind === "delete"}
        onOpenChange={(v) => !v && setPending(null)}
        onConfirm={confirmPending}
      />
      <PurgeDialog
        name={pending?.kind === "purge" ? pending.name : ""}
        open={pending?.kind === "purge"}
        onOpenChange={(v) => !v && setPending(null)}
        onConfirm={confirmPending}
      />
      <ShareProjectDialogView
        controller={shareController}
        enabled={sharingEnabled}
        project={shareProject}
        open={!!shareProject}
        onOpenChange={(open) => {
          if (!open) setShareProject(null);
        }}
      />
    </div>
  );
}
