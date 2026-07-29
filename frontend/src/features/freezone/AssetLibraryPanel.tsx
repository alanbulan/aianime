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
  type ReactNode,
} from "react";
import {
  AudioLines,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Video,
} from "lucide-react";
import { CanvasesTab } from "./CanvasesTab";
import { hasLegacyPresetCanvasMetadata } from "@/features/freezone/projections";
import type { FreezoneBeatContextResponse } from "@/features/freezone/domain/beatContext";
import {
  useFreezoneBeatContext,
  useFreezoneProjectAssets,
} from "@/features/freezone/composition";
import { buildLibraryAssets } from "@/features/freezone/application/assetLibraryProjection";
import {
  beatAssetItems,
  countAssetsForTab,
  groupBeatAssets,
  resolveCanvasKind,
  resolveCurrentBeat,
  resolveCurrentEpisode,
  sceneAssetTypeBadge,
} from "@/features/freezone/presentation/assetLibraryViewModel";
import { DEFAULT_NODE_WIDTH } from "@/features/canvas/domain/canvasNodes";
import { withImageCacheBust } from "@/features/canvas/application/imageData";
import {
  CANVAS_ASSET_DRAG_MIME,
  spawnAssetNode,
  type CanvasAssetDragPayload,
} from "@/features/canvas/domain/assetDrag";
import { hydrateAssetDragPayload } from "@/features/canvas/composition";
import { useCanvasStore } from "@/features/canvas/canvasStore";
import { useAssetDropStore } from "@/features/canvas/assetDropStore";
import { assetToPushTarget } from "@/features/freezone/commit/pushTarget";
import { promoteToAsset } from "@/features/freezone/commit/promoteToAsset";
import { commitDirectorRenderFromCanvasSource } from "@/features/freezone/commit/directorRenderCommit";
import type { PushResult, PushTarget } from "@/features/freezone/domain/assetCommit";
import {
  assetDropMediaType,
  isThreeDAsset,
  type AssetTab,
  type CanvasKind,
  type LibraryAsset,
} from "@/features/freezone/domain/assetLibraryModel";
import type { DirectorWorldSource } from "@/features/viewer-kit/three-d/directorManifest";

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

/* ─────────────────── 资产缩略图卡片 ─────────────────── */

function MiniThumb({
  asset,
  index,
  onAdd,
  cacheToken,
}: {
  asset: LibraryAsset;
  index: number;
  onAdd: () => void;
  cacheToken: string;
}) {
  const isThreeD = isThreeDAsset(asset);
  const isAudio = asset.mediaType === "audio";
  const isVideo = asset.mediaType === "video";
  const [imageFailed, setImageFailed] = useState(false);
  const thumbUrl = isThreeD || isVideo ? asset.coverUrl : asset.url;
  const displayThumbUrl = thumbUrl ? withImageCacheBust(thumbUrl, cacheToken) : null;
  const showImage =
    !imageFailed &&
    !isAudio &&
    Boolean(thumbUrl) &&
    (!isThreeD || Boolean(asset.coverUrl)) &&
    (!isVideo || Boolean(asset.coverUrl));
  // 视频没有后端封面时，用 <video> 抓首帧当缩略图（#t 强制浏览器渲染一帧）。
  const videoPosterUrl =
    isVideo && !imageFailed && !asset.coverUrl && asset.url
      ? `${withImageCacheBust(asset.url, cacheToken)}#t=0.1`
      : null;
  const disabled = !isThreeD && (asset.mediaType === "text" || asset.mediaType === "file");
  const dragPayload = disabled ? null : assetToDragPayload(asset);

  useEffect(() => {
    setImageFailed(false);
  }, [asset.id, thumbUrl]);

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!dragPayload) return;
    event.dataTransfer.setData(CANVAS_ASSET_DRAG_MIME, JSON.stringify(dragPayload));
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onAdd();
  };

  return (
    <div
      draggable={Boolean(dragPayload)}
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      onClick={onAdd}
      className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded bg-muted border border-border hover:border-foreground/20 hover:bg-accent/60 hover:scale-[1.02] transition-all duration-350"
      title={asset.label}
    >
      {showImage ? (
        <img
          src={displayThumbUrl ?? ""}
          alt={asset.label}
          className="h-full w-full rounded object-contain"
          loading={index < 20 ? "eager" : "lazy"}
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : isAudio ? (
        <div className="flex h-full w-full items-center justify-center rounded bg-primary/10">
          <AudioLines className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : videoPosterUrl ? (
        <div className="relative h-full w-full">
          <video
            src={videoPosterUrl}
            className="h-full w-full rounded bg-media object-contain"
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            onError={() => setImageFailed(true)}
          />
          <div className="pointer-events-none absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded bg-media/65 ring-1 ring-media-foreground/15">
            <Video className="h-2.5 w-2.5 text-media-foreground/90" />
          </div>
        </div>
      ) : isVideo ? (
        <div className="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-foreground/[0.08] to-transparent">
          <Video className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded">
          {imageFailed ? (
            <ImageOff className="h-5 w-5 text-muted-foreground" />
          ) : (
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">
              {isThreeD ? "3gs" : asset.mediaType}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Beat 行（可折叠） ─────────────────── */

function BeatSectionHeader({
  primary,
  secondary,
  action,
}: {
  primary: string;
  secondary: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between py-2">
      <span className="flex min-w-0 items-baseline gap-3">
        <span className="text-[13px] font-semibold text-foreground/70">{primary}</span>
        <span className="text-[12px] font-medium text-muted-foreground">{secondary}</span>
      </span>
      {action}
    </div>
  );
}

function BeatRow({
  beat,
  assets,
  allAssets,
  cacheToken,
}: {
  beat: number;
  assets: LibraryAsset[];
  allAssets: LibraryAsset[];
  cacheToken: string;
}) {
  const [open, setOpen] = useState(false);
  const items = beatAssetItems(assets);

  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
        />
        <span className="font-medium">
          Beat {beat}
        </span>
        <span className="text-[10px] text-muted-foreground/70">({items.length})</span>
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-1.5 pt-1.5">
          {items.map(({ role, label, asset }) => (
            <div key={role} className="space-y-1.5">
              <MiniThumb
                asset={asset}
                index={allAssets.indexOf(asset)}
                onAdd={() => addAssetToCanvas(asset, allAssets.indexOf(asset))}
                cacheToken={cacheToken}
              />
              <span className="block text-left text-[12px] text-foreground/70">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── 剧集（可折叠） ─────────────────── */

function EpisodeSection({
  episode,
  assets,
  allAssets,
  cacheToken,
}: {
  episode: number;
  assets: LibraryAsset[];
  allAssets: LibraryAsset[];
  cacheToken: string;
}) {
  const [open, setOpen] = useState(true);

  // Group by beat
  const beatMap = new Map<number, LibraryAsset[]>();
  for (const a of assets) {
    const ep = a.source.episode as number | undefined;
    const b = a.source.beat as number | undefined;
    if (ep === episode && typeof b === "number") {
      const list = beatMap.get(b) ?? [];
      list.push(a);
      beatMap.set(b, list);
    }
  }

  const beats = [...beatMap.entries()].sort(([a], [b]) => a - b);
  if (beats.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left transition-colors hover:[&_span:first-child]:text-foreground/80"
      >
        <BeatSectionHeader
          primary={`第${episode}集`}
          secondary={`${beats.length} Beat`}
          action={(
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
            />
          )}
        />
      </button>
      {open && (
        <div className="pb-2">
          {beats.map(([beatNum, beatAssets]) => (
            <BeatRow
              key={beatNum}
              beat={beatNum}
              assets={beatAssets}
              allAssets={allAssets}
              cacheToken={cacheToken}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Beat 面板（新设计） ─────────────────── */

function DefaultCanvasBeatPanel({
  beatContext,
  assets,
  cacheToken,
}: {
  beatContext: FreezoneBeatContextResponse | null;
  assets: LibraryAsset[];
  cacheToken: string;
}) {
  const episodes = beatContext?.episodes ?? [];

  if (assets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-xs text-muted-foreground/70">
        暂无镜头上下文素材
      </div>
    );
  }

  return (
    <div className="min-h-0 overflow-y-auto px-3 pt-1">
      {episodes.map((ep) => {
        const epAssets = assets.filter(
          (a) => (a.source.episode as number | undefined) === ep.episode,
        );
        if (epAssets.length === 0) return null;
        return (
          <EpisodeSection
            key={ep.episode}
            episode={ep.episode}
            assets={epAssets}
            allAssets={assets}
            cacheToken={cacheToken}
          />
        );
      })}
    </div>
  );
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

function BeatContextPanel({
  metadata,
  assets,
  canvasKind,
  beatContext,
  cacheToken,
}: {
  metadata: Record<string, unknown> | null;
  assets: LibraryAsset[];
  canvasKind: CanvasKind;
  beatContext: FreezoneBeatContextResponse | null;
  cacheToken: string;
}) {
  if (canvasKind === "default" || canvasKind === "blank" || canvasKind === "episode") {
    return (
      <DefaultCanvasBeatPanel beatContext={beatContext} assets={assets} cacheToken={cacheToken} />
    );
  }
  if (canvasKind !== "beat") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-xs text-muted-foreground/70">
        当前画布没有镜头上下文
      </div>
    );
  }
  return <PresetBeatPanel metadata={metadata} assets={assets} cacheToken={cacheToken} />;
}

function PresetBeatPanel({
  metadata,
  assets,
  cacheToken,
}: {
  metadata: Record<string, unknown> | null;
  assets: LibraryAsset[];
  cacheToken: string;
}) {
  const groups = groupBeatAssets(assets);
  const preset = (metadata?.preset ?? {}) as Record<string, unknown>;
  const defaultTarget = (metadata?.default_push_target ?? null) as
    | Record<string, unknown>
    | null;
  const episode =
    typeof preset.episode === "number"
      ? preset.episode
      : typeof defaultTarget?.episode === "number"
        ? defaultTarget.episode
        : null;
  const beatNum =
    typeof preset.beat === "number"
      ? preset.beat
      : typeof defaultTarget?.beat === "number"
        ? defaultTarget.beat
        : null;

  return (
    <div className="min-h-0 overflow-y-auto px-3 pt-1 pb-3 space-y-3">
      <BeatSectionHeader
        primary={episode !== null ? `第${episode}集` : "第?集"}
        secondary={beatNum !== null ? `Beat ${beatNum}` : "Beat ?"}
      />

      {assets.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-xs text-muted-foreground/70">
          当前镜头没有可用上下文素材
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.id}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {group.label}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {group.assets.map((asset) => (
                <MiniThumb
                  key={asset.id}
                  asset={asset}
                  index={assets.indexOf(asset)}
                  onAdd={() => addAssetToCanvas(asset, assets.indexOf(asset))}
                  cacheToken={cacheToken}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

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

function viewportCenteredPosition(
  store: ReturnType<typeof useCanvasStore.getState>,
  index: number,
  nodeWidth: number,
  nodeHeight: number,
): { x: number; y: number } {
  const { width: viewportWidth, height: viewportHeight } = store.canvasViewportSize;
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    const fallbackCol = index % 2;
    const fallbackRow = Math.floor(index / 2);
    return {
      x: -720 + fallbackCol * (nodeWidth + 28),
      y: 120 + fallbackRow * 260,
    };
  }
  const zoom = Math.max(0.01, store.currentViewport.zoom || 1);
  const cx = -store.currentViewport.x / zoom + viewportWidth / (2 * zoom);
  const cy = -store.currentViewport.y / zoom + viewportHeight / (2 * zoom);
  const col = index % 4;
  const row = Math.floor(index / 4) % 4;
  const offsetX = (col - 1.5) * 24;
  const offsetY = (row - 1.5) * 24;
  const baseX = cx - nodeWidth / 2 + offsetX;
  const baseY = cy - nodeHeight / 2 + offsetY;
  const collides = (x: number, y: number): boolean => {
    const margin = 8;
    return store.nodes.some((node) => {
      const nw = node.measured?.width ?? DEFAULT_NODE_WIDTH;
      const nh = node.measured?.height ?? 200;
      return (
        x < node.position.x + nw + margin &&
        x + nodeWidth + margin > node.position.x &&
        y < node.position.y + nh + margin &&
        y + nodeHeight + margin > node.position.y
      );
    });
  };
  if (!collides(baseX, baseY)) {
    return { x: baseX, y: baseY };
  }
  const stepX = Math.max(nodeWidth + 16, 120);
  const stepY = Math.max(Math.round(nodeHeight * 0.35), 60);
  for (let ring = 1; ring <= 10; ring += 1) {
    const ringOffsets = [
      [ring, 0], [-ring, 0], [0, ring], [0, -ring],
      [ring, 1], [ring, -1], [-ring, 1], [-ring, -1],
      [1, ring], [-1, ring], [1, -ring], [-1, -ring],
      [ring, ring], [-ring, -ring], [ring, -ring], [-ring, ring],
    ];
    for (const [dx, dy] of ringOffsets) {
      const x = baseX + dx * stepX;
      const y = baseY + dy * stepY;
      if (!collides(x, y)) return { x, y };
    }
  }
  return { x: baseX, y: baseY };
}

function assetToDragPayload(asset: LibraryAsset): CanvasAssetDragPayload | null {
  const sourceMeta = { ...asset.source } as Record<string, unknown>;
  const mainline = asset.mainlineContext?.length ? asset.mainlineContext : undefined;
  if (isThreeDAsset(asset)) {
    const relPath = typeof asset.source.rel_path === "string" ? asset.source.rel_path : "";
    const modelSources = Array.isArray(sourceMeta.director_world_sources)
      ? (sourceMeta.director_world_sources as DirectorWorldSource[])
      : undefined;
    const activeSourceId =
      typeof sourceMeta.active_source_id === "string" ? sourceMeta.active_source_id : undefined;
    const activeSource =
      modelSources?.find((source) => source.id && source.id === activeSourceId) ??
      modelSources?.find((source) => source.current) ??
      modelSources?.[0];
    return {
      kind: "model",
      label: asset.label,
      url: asset.url,
      coverUrl: asset.coverUrl ?? null,
      modelSources,
      activeSourceId,
      plyUrl:
        activeSource?.ply_url ??
        (activeSource?.source_type === "sog" ? activeSource.url : undefined) ??
        (modelSources ? null : asset.url),
      panoUrl:
        activeSource?.pano_url ??
        (activeSource?.source_type === "pano360" ? activeSource.url : undefined) ??
        null,
      sourceFileName: relPath.split("/").pop() || asset.label,
      source: sourceMeta,
      mainlineContext: mainline,
    };
  }
  if (asset.mediaType === "video") {
    return { kind: "video", label: asset.label, url: asset.url, aspectRatio: asset.aspectRatio, source: sourceMeta, mainlineContext: mainline };
  }
  if (asset.mediaType === "audio") {
    return { kind: "audio", label: asset.label, url: asset.url, source: sourceMeta, mainlineContext: mainline };
  }
  if (asset.mediaType === "text" || asset.mediaType === "file") return null;
  return { kind: "image", label: asset.label, url: asset.url, aspectRatio: asset.aspectRatio, source: sourceMeta, mainlineContext: mainline };
}

function addAssetToCanvas(asset: LibraryAsset, index: number): void {
  const payload = assetToDragPayload(asset);
  if (!payload) return;
  const store = useCanvasStore.getState();
  const APPROX_NODE_HEIGHT = 360;
  const position = viewportCenteredPosition(store, index, DEFAULT_NODE_WIDTH, APPROX_NODE_HEIGHT);
  void (async () => {
    let hydratedPayload = payload;
    try {
      hydratedPayload = await hydrateAssetDragPayload(payload);
    } catch (error) {
      console.warn("[freezone] scene director world manifest unavailable during import", error);
    }
    const newId = spawnAssetNode(store, hydratedPayload, position);
    store.requestFocusNode(newId);
  })();
}
