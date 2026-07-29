// Copyright (c) 2026 AI anime
import {
  useMemo,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CanvasesTab } from "./CanvasesTab";
import { hasLegacyPresetCanvasMetadata } from "@/features/freezone/projections";
import { addAssetToCanvas } from "@/features/freezone/assetLibraryCanvasInsertionComposition";
import {
  countAssetsForTab,
  resolveCanvasKind,
} from "@/features/freezone/presentation/assetLibraryViewModel";
import { BeatContextPanel } from "@/features/freezone/presentation/AssetLibraryBeatPanels";
import { AssetLibraryAssetCard } from "@/features/freezone/presentation/AssetLibraryAssetCard";
import {
  useAssetLibraryReplacementController,
  type AssetLibraryReplacementHandler,
} from "@/features/freezone/hooks/useAssetLibraryReplacementController";
import { useAssetLibraryCatalogController } from "@/features/freezone/hooks/useAssetLibraryCatalogController";
import type { AssetTab } from "@/features/freezone/domain/assetLibraryModel";

type PanelTab = "library" | "canvases";

interface AssetLibraryPanelProps {
  project: string;
  metadata: Record<string, unknown> | null;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  /** 拖拽节点替换某条素材完成(或失败)后回调:成功时携带 target/result。 */
  onReplaced?: AssetLibraryReplacementHandler;
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
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const replacementController = useAssetLibraryReplacementController({
    project,
    onReplaced,
  });
  const catalogController = useAssetLibraryCatalogController({
    project,
    metadata,
    canvasKind,
    replacementReloadToken: replacementController.reloadToken,
    reloadToken,
  });
  const {
    assets,
    beatContext,
    error,
    assetImageCacheToken,
  } = catalogController;
  const collapsed = collapsedProp ?? internalCollapsed;
  const setCollapsed = (next: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(next);
    } else {
      setInternalCollapsed(next);
    }
  };

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

  const tabCounts = useMemo(
    () => tabs.map((t) => ({ ...t, count: countAssetsForTab(assets, t.id) })),
    [assets],
  );

  return (
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
                    <AssetLibraryAssetCard
                      key={asset.id}
                      asset={asset}
                      index={index}
                      cacheToken={assetImageCacheToken}
                      onAdd={() => addAssetToCanvas(asset, index)}
                      activeDragMediaType={replacementController.activeDragMediaType}
                      hoverAssetId={replacementController.hoverAssetId}
                      isConfirming={replacementController.confirmingAssetId === asset.id}
                      isReplacing={replacementController.busyAssetId === asset.id}
                      onConfirm={() => replacementController.confirmReplacement(asset)}
                      onCancel={replacementController.cancelReplacement}
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
  );
}
