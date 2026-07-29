// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  Film,
  Frame,
  Home,
  RotateCcw,
  SquareDashed,
  Trash2,
  UserRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  createBlankFreezoneCanvas,
  deleteFreezoneCanvas,
  useFreezoneCanvases,
} from "@/features/canvas/composition";
import { ApiError, BackendStatusError } from "@/shared/api/errors";
import { writeUrl } from "@/lib/url-params";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/modules/identity_access/public";
import { personalCanvasIdForUsername } from "@/features/freezone/projections";
import {
  PERSONAL_CANVAS_DISPLAY_NAME,
  buildCanvasBrowserSections,
  canDeleteCanvasSummary,
  canvasKindFromSummary,
  displayNameForCanvasSummary,
  findDuplicateCanvasName,
  formatCanvasRelativeTime,
  isConflictCopyCanvas,
  sourceCanvasIdFromSummary,
  userCreatedCanvasId,
  type CanvasDisplaySummary,
  type CanvasKind,
} from "./presentation/canvasBrowserViewModel";

const CANVAS_KIND_ICON: Record<CanvasKind, LucideIcon> = {
  default: Home,
  episode: Film,
  beat: Frame,
  personal: UserRound,
  asset: Box,
  workflow: Workflow,
  blank: SquareDashed,
  other: Frame,
};

interface CanvasesTabProps {
  project: string;
  currentCanvasId: string;
  /**
   * Refresh the current preset/mainline canvas in place. The shell exposes
   * this via `useCanvasSync.restoreMainlineDefault`; we only show the button
   * when the current canvas is a preset/mainline canvas (`hasPresetLabel`).
   */
  onRestoreMainlineDefault?: () => Promise<void> | void;
  hasPresetLabel: boolean;
  reloadToken?: number;
}

export function CanvasesTab({
  project,
  currentCanvasId,
  onRestoreMainlineDefault,
  hasPresetLabel,
  reloadToken,
}: CanvasesTabProps) {
  const { t } = useTranslation();
  const username = useAuthStore((state) => state.username);
  const canvasesQuery = useFreezoneCanvases(project);
  const [deletedCanvasIds, setDeletedCanvasIds] = useState<Set<string>>(() => new Set());
  const items = (canvasesQuery.data ?? []).filter((item) => !deletedCanvasIds.has(item.id));
  const loading = canvasesQuery.isLoading;
  const queryError = canvasesQuery.error;
  const [localError, setLocalError] = useState<string | null>(null);
  const [deletingCanvasId, setDeletingCanvasId] = useState<string | null>(null);
  const [creatingCanvas, setCreatingCanvas] = useState(false);
  const [newCanvasName, setNewCanvasName] = useState("");
  const [restoringMainline, setRestoringMainline] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState(false);
  const [expandedOther, setExpandedOther] = useState(false);
  const reloadKey = `${reloadToken ?? 0}`;
  const previousReloadKeyRef = useRef(reloadKey);

  useEffect(() => {
    if (previousReloadKeyRef.current === reloadKey) return;
    previousReloadKeyRef.current = reloadKey;
    void canvasesQuery.refetch();
  }, [canvasesQuery, reloadKey]);

  const error = localError ?? (queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null);

  const switchTo = (id: string) => {
    if (id === currentCanvasId) return;
    writeUrl({ canvas: id });
  };

  const handleRestoreMainline = async () => {
    if (!onRestoreMainlineDefault) return;
    const ok = window.confirm(t("freezone.canvases.restoreConfirm"));
    if (!ok) return;
    setRestoringMainline(true);
    try {
      await onRestoreMainlineDefault();
    } finally {
      setRestoringMainline(false);
    }
  };

  const sections = buildCanvasBrowserSections(items, currentCanvasId, username);
  const currentCanvasInMembers = sections.memberCanvases.some((item) => item.id === currentCanvasId);
  const currentCanvasInOther = sections.otherCanvases.some((item) => item.id === currentCanvasId);
  const showRestoreMainlineAction = currentCanvasId !== "default" && hasPresetLabel;

  useEffect(() => {
    if (currentCanvasInMembers) {
      setExpandedMembers(true);
    }
  }, [currentCanvasInMembers]);

  useEffect(() => {
    if (currentCanvasInOther) {
      setExpandedOther(true);
    }
  }, [currentCanvasInOther]);

  const handleRestoreMainlineClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void handleRestoreMainline();
  };

  const handleCreateCanvas = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newCanvasName.trim();
    if (!name) {
      setLocalError(t("freezone.canvases.createNameRequired"));
      return;
    }
    const duplicate = findDuplicateCanvasName(items, name, t);
    if (duplicate) {
      setLocalError(t("freezone.canvases.createDuplicate", { name }));
      return;
    }
    const canvasId = userCreatedCanvasId(name, username);
    if (items.some((item) => item.id === canvasId)) {
      setLocalError(t("freezone.canvases.createDuplicate", { name }));
      return;
    }
    setCreatingCanvas(true);
    setLocalError(null);
    try {
      await createBlankFreezoneCanvas(project, {
        canvasId,
        name,
        creatorUsername: username,
      });
      setDeletedCanvasIds((prev) => {
        if (!prev.has(canvasId)) return prev;
        const next = new Set(prev);
        next.delete(canvasId);
        return next;
      });
      setNewCanvasName("");
      await canvasesQuery.refetch();
      writeUrl({ canvas: canvasId });
    } catch (err) {
      if (isConflictError(err)) {
        setLocalError(t("freezone.canvases.createDuplicate", { name }));
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setLocalError(t("freezone.canvases.createFailed", { message }));
    } finally {
      setCreatingCanvas(false);
    }
  };

  const handleDeleteCanvas = async (item: CanvasDisplaySummary) => {
    if (!canDeleteCanvasSummary(item, username)) return;
    const name = displayNameForCanvasSummary(item, t);
    const ok = window.confirm(t("freezone.canvases.deleteConfirm", { name }));
    if (!ok) return;
    setDeletingCanvasId(item.id);
    setLocalError(null);
    try {
      await deleteFreezoneCanvas(project, item.id);
      setDeletedCanvasIds((prev) => new Set(prev).add(item.id));
      await canvasesQuery.refetch();
      if (item.id === currentCanvasId) {
        writeUrl({ canvas: username ? personalCanvasIdForUsername(username) : "default" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocalError(t("freezone.canvases.deleteFailed", { message }));
    } finally {
      setDeletingCanvasId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error && (
        <div className="px-3 pb-2 pt-3">
          <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {error}
          </div>
        </div>
      )}

      <div className="ui-scrollbar-hidden flex-1 min-h-0 overflow-y-auto px-3 pt-1 space-y-0">
        <form onSubmit={handleCreateCanvas} className="pb-2 pt-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2">
            <input
              value={newCanvasName}
              onChange={(event) => {
                setNewCanvasName(event.target.value);
                if (localError) setLocalError(null);
              }}
              maxLength={40}
              placeholder={t("freezone.canvases.createPlaceholder")}
              disabled={creatingCanvas}
              className="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={creatingCanvas || !newCanvasName.trim()}
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-border bg-card px-2.5 text-[11px] font-medium text-foreground/75 transition hover:border-foreground/25 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
              title={t("freezone.canvases.createTitle")}
            >
              {creatingCanvas ? t("freezone.canvases.createBusy") : t("freezone.canvases.create")}
            </button>
          </div>
        </form>
        {loading ? (
          <div className="py-8 text-center text-xs text-text-muted">
            {t("freezone.canvases.loading")}
          </div>
        ) : (
          <>
            <CanvasSectionTitle label={t("freezone.canvases.myCanvasSection")} />
            <CanvasListItem
              item={sections.defaultCanvas}
              currentCanvasId={currentCanvasId}
              showRestoreMainlineAction={showRestoreMainlineAction && sections.defaultCanvas.id === currentCanvasId}
              restoringMainline={restoringMainline}
              onSwitch={switchTo}
              onRestoreMainline={handleRestoreMainlineClick}
              canDelete={canDeleteCanvasSummary(sections.defaultCanvas, username)}
              deleting={deletingCanvasId === sections.defaultCanvas.id}
              onDelete={handleDeleteCanvas}
            />

            {sections.memberCanvases.length > 0 && (
              <CollapsibleCanvasSection
                title={t("freezone.canvases.memberCanvasesSection")}
                count={sections.memberCanvases.length}
                expanded={expandedMembers}
                onToggle={() => setExpandedMembers((value) => !value)}
                expandTitle={t("freezone.canvases.expandMemberCanvases")}
                collapseTitle={t("freezone.canvases.collapseMemberCanvases")}
              >
                {sections.memberCanvases.map((item) => (
                  <CanvasListItem
                    key={`member:${item.id}`}
                    item={item}
                    currentCanvasId={currentCanvasId}
                    showRestoreMainlineAction={showRestoreMainlineAction && item.id === currentCanvasId}
                    restoringMainline={restoringMainline}
                    onSwitch={switchTo}
                    onRestoreMainline={handleRestoreMainlineClick}
                    canDelete={canDeleteCanvasSummary(item, username)}
                    deleting={deletingCanvasId === item.id}
                    onDelete={handleDeleteCanvas}
                  />
                ))}
              </CollapsibleCanvasSection>
            )}

            {sections.otherCanvases.length > 0 && (
              <CollapsibleCanvasSection
                title={t("freezone.canvases.otherCanvasesSection")}
                count={sections.otherCanvases.length}
                expanded={expandedOther}
                onToggle={() => setExpandedOther((value) => !value)}
                expandTitle={t("freezone.canvases.expandOtherCanvases")}
                collapseTitle={t("freezone.canvases.collapseOtherCanvases")}
              >
                {sections.otherCanvases.map((item) => (
                  <CanvasListItem
                    key={`other:${item.id}`}
                    item={item}
                    currentCanvasId={currentCanvasId}
                    showRestoreMainlineAction={showRestoreMainlineAction && item.id === currentCanvasId}
                    restoringMainline={restoringMainline}
                    onSwitch={switchTo}
                    onRestoreMainline={handleRestoreMainlineClick}
                    canDelete={canDeleteCanvasSummary(item, username)}
                    deleting={deletingCanvasId === item.id}
                    onDelete={handleDeleteCanvas}
                  />
                ))}
              </CollapsibleCanvasSection>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CanvasSectionTitle({ label, className }: { label: string; className?: string }) {
  return (
    <div className={`pb-2 pt-4 text-xs font-semibold text-foreground/75 ${className ?? ""}`}>
      {label}
    </div>
  );
}

function CollapsibleCanvasSection({
  title,
  count,
  expanded,
  onToggle,
  expandTitle,
  collapseTitle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  expandTitle: string;
  collapseTitle: string;
  children: ReactNode;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <div className="pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-2 text-left text-xs font-semibold text-foreground/75 hover:text-foreground"
        aria-expanded={expanded}
        title={expanded ? collapseTitle : expandTitle}
      >
        <span>{title}</span>
        <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          {count}
          <Icon className="h-3.5 w-3.5" />
        </span>
      </button>
      {expanded && <div className="space-y-2 pb-1 pt-1">{children}</div>}
    </div>
  );
}

function CanvasListItem({
  item,
  currentCanvasId,
  showRestoreMainlineAction,
  restoringMainline,
  onSwitch,
  onRestoreMainline,
  canDelete,
  deleting,
  onDelete,
}: {
  item: CanvasDisplaySummary;
  currentCanvasId: string;
  showRestoreMainlineAction: boolean;
  restoringMainline: boolean;
  onSwitch: (id: string) => void;
  onRestoreMainline: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  canDelete: boolean;
  deleting: boolean;
  onDelete: (item: CanvasDisplaySummary) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const isCurrent = item.id === currentCanvasId;
  const sourceCanvasId = sourceCanvasIdFromSummary(item);
  const summary =
    item.displayKind === "personal" && item.displayName === PERSONAL_CANVAS_DISPLAY_NAME
      ? t("freezone.canvases.personalCanvasName")
      : displayNameForCanvasSummary(item, t);
  const kind = canvasKindFromSummary(item);
  const Icon = isConflictCopyCanvas(item) ? Copy : CANVAS_KIND_ICON[kind] ?? Frame;
  const relative = formatCanvasRelativeTime(item.modified_at, t);
  const canRestoreMainline = isCurrent && showRestoreMainlineAction;

  return (
    <div
      className={
        "group relative flex items-center gap-3 rounded-lg py-2 transition " +
        (isCurrent ? "cursor-default" : "cursor-pointer opacity-60 hover:opacity-90")
      }
      aria-current={isCurrent ? "true" : undefined}
      title={`${item.id} · ${relative} · ${(item.size / 1024).toFixed(1)} KB`}
    >
      <div className="flex w-full min-w-0 items-center gap-4">
        <button
          type="button"
          onClick={() => onSwitch(item.id)}
          disabled={isCurrent}
          className="block shrink-0 disabled:cursor-default"
        >
          <div
            className={
              "relative flex h-[80px] w-[60px] items-center justify-center overflow-hidden rounded-[6px] border " +
              (isCurrent
                ? "border-primary/30 bg-primary/[0.12]"
                : "border-border bg-muted")
            }
          >
            <Icon className={"h-5 w-5 " + (isCurrent ? "text-primary" : "text-muted-foreground")} />
          </div>
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onSwitch(item.id)}
            disabled={isCurrent}
            className="block max-w-full text-left disabled:cursor-default"
          >
            <span
              className={
                "block max-w-full truncate text-sm font-medium " +
                (isCurrent ? "text-foreground" : "text-muted-foreground")
              }
            >
              {summary}
            </span>
            {relative ? (
              <span className="mt-2 block truncate text-[11px] leading-snug tabular-nums text-muted-foreground">
                {relative}
              </span>
            ) : null}
          </button>
        {canRestoreMainline || canDelete ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canRestoreMainline && (
              <button
                type="button"
                onClick={onRestoreMainline}
                disabled={restoringMainline}
                className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-border bg-muted px-2 text-[10px] font-medium text-foreground/75 transition hover:border-foreground/25 hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-50"
                title={t("freezone.canvases.restoreTitle")}
              >
                <RotateCcw className="h-3 w-3" />
                {restoringMainline ? t("freezone.canvases.restoreBusy") : t("freezone.canvases.restore")}
              </button>
            )}
            {canDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onDelete(item);
              }}
              disabled={deleting}
              className="inline-flex h-6 items-center justify-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 text-[10px] font-medium text-destructive transition hover:border-destructive/45 hover:bg-destructive/20 disabled:opacity-50"
              title={t("freezone.canvases.deleteTitle")}
            >
              <Trash2 className="h-3 w-3" />
              {deleting ? t("freezone.canvases.deleteBusy") : t("freezone.canvases.delete")}
            </button>
            )}
          </div>
        ) : null}
        </div>
      </div>
      {sourceCanvasId && sourceCanvasId !== currentCanvasId && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSwitch(sourceCanvasId);
          }}
          title={t("freezone.canvases.sourceCanvasTitle", { canvasId: sourceCanvasId })}
          className="tap-button h-6 border-warning/35 px-2 text-[10px] text-warning hover:bg-warning/15 hover:text-warning"
        >
          {t("freezone.canvases.sourceCanvas")}
        </button>
      )}
    </div>
  );
}

function isConflictError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.status === 409) ||
    (error instanceof BackendStatusError && error.status === 409)
  );
}
