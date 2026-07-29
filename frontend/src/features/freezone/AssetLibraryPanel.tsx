// Copyright (c) 2026 AI anime
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Video,
} from "lucide-react";
import { CanvasesTab } from "./CanvasesTab";
import { hasLegacyPresetCanvasMetadata } from "@/features/freezone/projections";
import {
  useFreezoneBeatContext,
  useFreezoneProjectAssets,
} from "@/features/freezone/composition";
import { buildLibraryAssets } from "@/features/freezone/application/assetLibraryProjection";
import { assetToDragPayload } from "@/features/freezone/application/assetLibraryCanvasInsertion";
import { addAssetToCanvas } from "@/features/freezone/assetLibraryCanvasInsertionComposition";
import {
  countAssetsForTab,
  resolveCanvasKind,
  resolveCurrentBeat,
  resolveCurrentEpisode,
  sceneAssetTypeBadge,
} from "@/features/freezone/presentation/assetLibraryViewModel";
import { BeatContextPanel } from "@/features/freezone/presentation/AssetLibraryBeatPanels";
import { withImageCacheBust } from "@/features/canvas/application/imageData";
import { CANVAS_ASSET_DRAG_MIME } from "@/features/canvas/domain/assetDrag";
import { useAssetDropStore } from "@/features/canvas/assetDropStore";
import { assetToPushTarget } from "@/features/freezone/commit/pushTarget";
import { promoteToAsset } from "@/features/freezone/commit/promoteToAsset";
import { commitDirectorRenderFromCanvasSource } from "@/features/freezone/commit/directorRenderCommit";
import type { PushResult, PushTarget } from "@/features/freezone/domain/assetCommit";
import {
  assetDropMediaType,
  isThreeDAsset,
  type AssetTab,
  type LibraryAsset,
} from "@/features/freezone/domain/assetLibraryModel";

/** 拖拽替换的协调上下文,供深层 AssetCard 消费(避免逐层透传)。 */
interface AssetReplaceContextValue {
  confirmingAssetId: string | null;
  busyAssetId: string | null;
  onConfirm: (asset: LibraryAsset) => void;
  onCancel: () => void;
}
const AssetReplaceContext = createContext<AssetReplaceContextValue | null>(null);

type PanelTab = "library" | "canvases";

interface AssetLibraryPanelProps {
  project: string;
  metadata: Record<string, unknown> | null;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  /** 拖拽节点替换某条素材完成(或失败)后回调:成功时携带 target/result。 */
  onReplaced?: (
    payload: { target: PushTarget; result: PushResult } | null,
    message: string,
  ) => void;
  /** 当前画布 id —— 用于「画布」tab 高亮当前项。 */
  currentCanvasId: string;
  /** 主线 preset 画布的「同步主线视图」回调；只在 preset 画布下显示按钮。 */
  onRestoreMainlineDefault?: () => Promise<void> | void;
  /** 外部提交成功后自增，通知素材库重拉项目资产。 */
  reloadToken?: number;
}

/* ─────────────────── 主面板 ─────────────────── */

export function AssetLibraryPanel({
  project,
  metadata,
  collapsed: collapsedProp,
  onCollapsedChange,
  onReplaced,
  currentCanvasId,
  onRestoreMainlineDefault,
  reloadToken,
}: AssetLibraryPanelProps) {
  const canvasKind = resolveCanvasKind(metadata);
  const beatTabLabel =
    canvasKind === "default" || canvasKind === "blank"
      ? "全部Beat"
      : canvasKind === "episode"
        ? "本集Beat"
        : "当前Beat";
  const tabs: Array<{ id: AssetTab; label: string }> = [
    { id: "beat", label: beatTabLabel },
    { id: "characters", label: "人物" },
    { id: "scenes", label: "场景" },
    { id: "props", label: "道具" },
  ];

  const [panelTab, setPanelTab] = useState<PanelTab>("canvases");
  const [tab, setTab] = useState<AssetTab>("beat");
  const [query, setQuery] = useState("");
  const hasPresetLabel = hasLegacyPresetCanvasMetadata(metadata);
  // 替换/提交成功后自增,用于强制重新拉取素材列表。
  const [internalReloadToken, setInternalReloadToken] = useState(0);
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const collapsed = collapsedProp ?? internalCollapsed;
  const setCollapsed = (next: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(next);
    } else {
      setInternalCollapsed(next);
    }
  };

  const projectAssetsQuery = useFreezoneProjectAssets(project);
  const projectAssets = projectAssetsQuery.data ?? [];
  const projectAssetsReloadKey = `${internalReloadToken}:${reloadToken ?? 0}`;
  const previousProjectAssetsReloadKeyRef = useRef(projectAssetsReloadKey);

  useEffect(() => {
    if (previousProjectAssetsReloadKeyRef.current === projectAssetsReloadKey) return;
    previousProjectAssetsReloadKeyRef.current = projectAssetsReloadKey;
    void projectAssetsQuery.refetch();
  }, [projectAssetsQuery, projectAssetsReloadKey]);

  const currentEpisode = useMemo(
    () => resolveCurrentEpisode(metadata),
    [metadata],
  );
  const currentBeat = useMemo(
    () => resolveCurrentBeat(metadata),
    [metadata],
  );

  const beatContextEnabled =
    canvasKind !== "asset" &&
    !(canvasKind === "episode" && currentEpisode === null) &&
    !(canvasKind === "beat" && (currentEpisode === null || currentBeat === null));
  const beatContextQuery = useFreezoneBeatContext(
    project,
    {
      episode: typeof currentEpisode === "number" ? currentEpisode : null,
      beat: canvasKind === "beat" && typeof currentBeat === "number" ? currentBeat : null,
    },
    beatContextEnabled,
  );
  const beatContext = beatContextEnabled ? (beatContextQuery.data ?? null) : null;
  const beatContextReloadKey = `${internalReloadToken}:${reloadToken ?? 0}`;
  const previousBeatContextReloadKeyRef = useRef(beatContextReloadKey);

  useEffect(() => {
    if (previousBeatContextReloadKeyRef.current === beatContextReloadKey) return;
    previousBeatContextReloadKeyRef.current = beatContextReloadKey;
    if (!beatContextEnabled) return;
    void beatContextQuery.refetch();
  }, [beatContextEnabled, beatContextQuery, beatContextReloadKey]);

  const projectAssetsError =
    projectAssetsQuery.error instanceof Error
      ? projectAssetsQuery.error.message
      : projectAssetsQuery.error
        ? String(projectAssetsQuery.error)
        : null;
  const beatContextError =
    beatContextQuery.error instanceof Error
      ? beatContextQuery.error.message
      : beatContextQuery.error
        ? String(beatContextQuery.error)
        : null;
  const error = projectAssetsError ?? beatContextError;

  const assets = useMemo(
    () => buildLibraryAssets({ project, metadata, projectAssets, beatContext, canvasKind }),
    [project, metadata, projectAssets, beatContext, canvasKind],
  );
  const assetPreviewCacheToken = `${internalReloadToken}:${reloadToken ?? 0}`;
  const assetImageCacheToken = assetPreviewCacheToken;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (tab === "beat") {
        if (!asset.source.from_beat_context) return false;
      } else if (asset.tab !== tab) {
        return false;
      }
      if (!q) return true;
      return `${asset.label} ${asset.sublabel ?? ""} ${asset.kind} ${asset.role}`
        .toLowerCase()
        .includes(q);
    });
  }, [assets, query, tab]);

  // —— 拖拽节点替换素材 ——
  const pendingReplace = useAssetDropStore((s) => s.pendingReplace);
  const clearPendingReplace = useAssetDropStore((s) => s.clearPendingReplace);
  const [replaceBusyId, setReplaceBusyId] = useState<string | null>(null);
  const confirmingAssetId = pendingReplace?.assetId ?? null;

  const handleCancelReplace = useCallback(() => {
    clearPendingReplace();
  }, [clearPendingReplace]);

  const handleConfirmReplace = useCallback(
    (asset: LibraryAsset) => {
      const replace = useAssetDropStore.getState().pendingReplace;
      if (!replace || replace.assetId !== asset.id) return;
      const target = assetToPushTarget(asset.source);
      if (!target) {
        const src = asset.source as Record<string, unknown>;
        console.warn("[freezone] 无法推断替换目标", asset.label, asset.source);
        onReplaced?.(
          null,
          `无法识别「${asset.label}」的提交目标（kind=${String(src.kind)} / role=${String(src.role)}）`,
        );
        clearPendingReplace();
        return;
      }
      if (target.kind === "director_render") {
        setReplaceBusyId(asset.id);
        commitDirectorRenderFromCanvasSource(project, target, {
          sourceUrl: replace.sourceUrl,
          bundle: replace.directorControlBundle,
          sourceNodeId: replace.nodeId,
          label: replace.label,
        })
          .then((result) => {
            setInternalReloadToken((t) => t + 1);
            onReplaced?.({ target, result }, `已提交到「${asset.label}」`);
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            onReplaced?.(null, `替换「${asset.label}」失败：${msg}`);
          })
          .finally(() => {
            setReplaceBusyId(null);
            clearPendingReplace();
          });
        return;
      }
      const sourceUrl = replace.sourceUrl;
      setReplaceBusyId(asset.id);
      promoteToAsset(project, sourceUrl, target, { mark_stale: false })
        .then((result) => {
          // 重新拉取素材列表,让左侧缩略图同步成最新资产。
          setInternalReloadToken((t) => t + 1);
          onReplaced?.({ target, result }, `已用画布节点替换「${asset.label}」`);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          onReplaced?.(null, `替换「${asset.label}」失败：${msg}`);
        })
        .finally(() => {
          setReplaceBusyId(null);
          clearPendingReplace();
        });
    },
    [clearPendingReplace, onReplaced, project],
  );

  const replaceContextValue = useMemo<AssetReplaceContextValue>(
    () => ({
      confirmingAssetId,
      busyAssetId: replaceBusyId,
      onConfirm: handleConfirmReplace,
      onCancel: handleCancelReplace,
    }),
    [confirmingAssetId, replaceBusyId, handleConfirmReplace, handleCancelReplace],
  );

  const tabCounts = useMemo(
    () => tabs.map((t) => ({ ...t, count: countAssetsForTab(assets, t.id) })),
    [assets],
  );

  return (
    <AssetReplaceContext.Provider value={replaceContextValue}>
      <aside
        className="pointer-events-none absolute inset-y-0 left-0 z-30 overflow-visible"
      >
        {/* 折叠/展开胶囊 — 停在卡片右侧的画布上 */}
        <div
          className="group/handle pointer-events-auto absolute top-3 z-30 flex h-10 w-10 items-center justify-center transition-[left] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: collapsed ? 16 : 316 }}
        >
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "展开素材抽屉" : "收起素材抽屉"}
            aria-expanded={!collapsed}
            className="group/btn relative flex h-10 w-10 items-center justify-center rounded-[10px] text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-border bg-card shadow-lg transition-colors duration-200 group-hover/btn:border-primary/55 group-hover/btn:bg-accent"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </span>
          </button>
          <span
            className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] font-medium text-popover-foreground/80 opacity-0 shadow-lg backdrop-blur-md transition-opacity duration-150 group-hover/handle:opacity-100"
          >
            {collapsed ? "展开" : "收起"}
          </span>
        </div>

        {/* 悬浮圆角卡片 */}
        <div
          className={`flex min-h-0 flex-col overflow-hidden rounded-[12px] border border-border bg-card text-card-foreground shadow-xl transition-[opacity,transform] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
            collapsed
              ? "pointer-events-none -translate-x-3 opacity-0"
              : "pointer-events-auto translate-x-0 opacity-100"
          }`}
          style={{ width: 288, marginLeft: 16, marginTop: 16, marginBottom: 16, height: 'calc(100% - 32px)' }}
        >
          {/* ─ 分段 Tab 栏 ── */}
          <div className="flex rounded-full border border-border mx-3 mt-4 mb-1.5 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setPanelTab("canvases")}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors rounded-full ${
                panelTab === "canvases"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              项目画布
            </button>
            <button
              type="button"
              onClick={() => setPanelTab("library")}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors rounded-full ${
                panelTab === "library"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              主线资产
            </button>
          </div>

          {panelTab === "library" ? (
            <>
              {/* ── 分类标签 + 搜索（固定头部） ── */}
              <div className="sticky top-0 z-10">
                <div className="ui-scrollbar-hidden flex items-center gap-1 overflow-x-auto px-3 pt-2.5 pb-2">
                  {tabCounts.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
                        tab === item.id
                          ? "text-foreground"
                          : "text-muted-foreground/70 hover:text-foreground/70"
                      }`}
                    >
                      {item.label}
                      {item.count > 0 ? (
                        <span className="ml-0.5 text-[10px] opacity-60">({item.count})</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <div className="px-3 pt-1.5 pb-2">
                  <div className="relative">
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索素材..."
                      className="w-full h-7 rounded-md border border-border bg-muted px-2.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring/50 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* ─ 列表内容 ── */}
              {error ? (
                <div className="mx-3 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  项目素材加载失败：{error}
                </div>
              ) : tab === "beat" ? (
                <BeatContextPanel
                  metadata={metadata}
                  assets={filtered}
                  canvasKind={canvasKind}
                  beatContext={beatContext}
                  cacheToken={assetImageCacheToken}
                  onAddAsset={addAssetToCanvas}
                />
              ) : filtered.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-xs text-muted-foreground/70">
                  当前分类没有可用素材
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
                  {filtered.map((asset, index) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      index={index}
                      cacheToken={assetImageCacheToken}
                      onAdd={() => addAssetToCanvas(asset, index)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <CanvasesTab
              project={project}
              currentCanvasId={currentCanvasId}
              onRestoreMainlineDefault={onRestoreMainlineDefault}
              hasPresetLabel={hasPresetLabel}
              reloadToken={reloadToken}
            />
          )}
        </div>
      </aside>
    </AssetReplaceContext.Provider>
  );
}

/* ─────────────────── 辅助组件 ─────────────────── */

/* ─────────────────── AssetCard（非 beat tab 用） ─────────────────── */

function AssetCard({
  asset,
  index,
  onAdd,
  cacheToken,
}: {
  asset: LibraryAsset;
  index: number;
  cacheToken: string;
  onAdd: () => void;
}) {
  const isThreeD = isThreeDAsset(asset);
  const isAudio = asset.mediaType === "audio";
  const isVideo = asset.mediaType === "video";
  const thumbUrl = isThreeD || isVideo ? asset.coverUrl : asset.url;
  const displayThumbUrl = thumbUrl ? withImageCacheBust(thumbUrl, cacheToken) : null;
  const showImage =
    !isAudio &&
    Boolean(thumbUrl) &&
    (!isThreeD || Boolean(asset.coverUrl)) &&
    (!isVideo || Boolean(asset.coverUrl));
  // 视频没有后端封面时，用 <video> 抓首帧当缩略图。
  const videoPosterUrl =
    isVideo && !asset.coverUrl && asset.url
      ? `${withImageCacheBust(asset.url, cacheToken)}#t=0.1`
      : null;
  const disabled = !isThreeD && (asset.mediaType === "text" || asset.mediaType === "file");
  const dropMediaType = assetDropMediaType(asset);
  const activeDrag = useAssetDropStore((s) => s.activeDrag);
  const target = assetToPushTarget(asset.source);
  const replaceable =
    asset.source.pushable !== false &&
    Boolean(dropMediaType) &&
    target !== null &&
    (target.kind !== "director_render" || activeDrag?.mediaType === "image");
  const hoverAssetId = useAssetDropStore((s) => s.hoverAssetId);
  const isDropHover = replaceable && hoverAssetId === asset.id;
  const replaceCtx = useContext(AssetReplaceContext);
  const isConfirming = replaceCtx?.confirmingAssetId === asset.id;
  const isReplacing = replaceCtx?.busyAssetId === asset.id;
  const dragPayload = disabled ? null : assetToDragPayload(asset);
  const typeBadge = sceneAssetTypeBadge(asset);

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!dragPayload) return;
    event.dataTransfer.setData(CANVAS_ASSET_DRAG_MIME, JSON.stringify(dragPayload));
    event.dataTransfer.effectAllowed = "copy";
    const preview = createAssetDragImage(event.currentTarget, asset);
    if (preview) {
      event.dataTransfer.setDragImage(preview, 24, 24);
      window.setTimeout(() => preview.remove(), 0);
    }
  };

  return (
    <div
      data-asset-id={replaceable ? asset.id : undefined}
      data-asset-media-type={replaceable ? dropMediaType ?? undefined : undefined}
      draggable={Boolean(dragPayload)}
      onDragStart={handleDragStart}
      className={`group relative flex items-center gap-3 rounded-[8px] border border-transparent px-1.5 py-2 cursor-pointer transition-all duration-200 hover:border-border hover:bg-accent ${
        dragPayload ? "active:cursor-grabbing" : ""
      } ${isDropHover ? "opacity-70" : ""}`}
      onClick={onAdd}
    >
      <div
        data-drag-thumb
        className="relative h-[80px] w-[60px] shrink-0 overflow-hidden rounded-[6px] bg-muted border border-border flex items-center justify-center transition-colors duration-200 group-hover:border-foreground/20"
      >
        {showImage ? (
          <img
            src={displayThumbUrl ?? ""}
            alt={asset.label}
            className="h-full w-full object-cover"
            loading={index < 8 ? "eager" : "lazy"}
            draggable={false}
          />
        ) : isAudio ? (
          <div className="flex h-full w-full items-center justify-center bg-primary/10">
            <AudioLines className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : videoPosterUrl ? (
          <div className="relative h-full w-full">
            <video
              src={videoPosterUrl}
              className="h-full w-full bg-media object-cover"
              preload="metadata"
              muted
              playsInline
              tabIndex={-1}
            />
            <div className="pointer-events-none absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded bg-media/65 ring-1 ring-media-foreground/15">
              <Video className="h-2.5 w-2.5 text-media-foreground/90" />
            </div>
          </div>
        ) : isVideo ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-foreground/[0.08] to-transparent">
            <Video className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {isThreeD ? "3gs" : asset.mediaType}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate text-sm font-medium text-foreground/85" title={asset.label}>
            {asset.label}
          </div>
          {typeBadge ? (
            <span
              className={`shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${typeBadge.className}`}
              title={typeBadge.title}
            >
              {typeBadge.label}
            </span>
          ) : null}
        </div>
        <div
          className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground/80"
          title={asset.sublabel}
        >
          {asset.sublabel || asset.role}
        </div>
      </div>
      <button
        type="button"
        className="tap-button h-6 rounded border border-border px-2 text-[11px] text-muted-foreground opacity-0 transition hover:border-foreground/25 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        title="加入画布"
        disabled={disabled}
      >
        加入
      </button>
      {isConfirming && (
        <div className="absolute inset-0 z-10 flex flex-col justify-center gap-1.5 rounded-lg border border-border bg-popover/95 px-2.5 backdrop-blur-sm">
          <div className="line-clamp-2 text-[11px] leading-snug text-popover-foreground/85">
            用画布节点替换「{asset.label}」？
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="h-6 flex-1 rounded-md border border-border text-[11px] text-foreground/85 hover:bg-muted disabled:opacity-50"
              onClick={() => replaceCtx?.onConfirm(asset)}
              disabled={isReplacing}
            >
              {isReplacing ? "替换中…" : "替换"}
            </button>
            <button
              type="button"
              className="h-6 flex-1 rounded-md text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              onClick={() => replaceCtx?.onCancel()}
              disabled={isReplacing}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function createAssetDragImage(source: HTMLElement, asset: LibraryAsset): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const thumb = source.querySelector<HTMLElement>("[data-drag-thumb]");
  const preview = document.createElement("div");
  preview.style.position = "fixed";
  preview.style.left = "-1000px";
  preview.style.top = "-1000px";
  preview.style.zIndex = "2147483647";
  preview.style.display = "flex";
  preview.style.alignItems = "center";
  preview.style.gap = "10px";
  preview.style.width = "210px";
  preview.style.minHeight = "72px";
  preview.style.padding = "8px";
  preview.style.borderRadius = "10px";
  preview.style.border = "1px solid var(--border)";
  preview.style.background = "var(--popover)";
  preview.style.boxShadow = "var(--shadow-xl)";
  preview.style.backdropFilter = "blur(12px)";
  preview.style.pointerEvents = "none";

  if (thumb) {
    const thumbClone = thumb.cloneNode(true) as HTMLElement;
    thumbClone.removeAttribute("data-drag-thumb");
    thumbClone.style.width = "48px";
    thumbClone.style.height = "64px";
    thumbClone.style.flexShrink = "0";
    thumbClone.style.borderRadius = "7px";
    thumbClone.style.transform = "none";
    preview.appendChild(thumbClone);
  }

  const textWrap = document.createElement("div");
  textWrap.style.minWidth = "0";
  textWrap.style.flex = "1";

  const title = document.createElement("div");
  title.textContent = asset.label;
  title.style.overflow = "hidden";
  title.style.textOverflow = "ellipsis";
  title.style.whiteSpace = "nowrap";
  title.style.fontSize = "13px";
  title.style.fontWeight = "600";
  title.style.color = "var(--popover-foreground)";
  title.style.opacity = "0.88";

  const subtitle = document.createElement("div");
  subtitle.textContent = asset.sublabel || asset.role;
  subtitle.style.marginTop = "5px";
  subtitle.style.overflow = "hidden";
  subtitle.style.textOverflow = "ellipsis";
  subtitle.style.whiteSpace = "nowrap";
  subtitle.style.fontSize = "11px";
  subtitle.style.color = "var(--popover-foreground)";
  subtitle.style.opacity = "0.62";

  textWrap.append(title, subtitle);
  preview.appendChild(textWrap);
  document.body.appendChild(preview);
  return preview;
}
