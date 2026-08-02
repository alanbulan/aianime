// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  type AssetTab,
  type CanvasKind,
  type LibraryAsset,
} from "../domain/assetLibraryModel";
import type { FreezoneBeatContextResponse } from "../domain/beatContext";
import type { CanvasCommitMediaType } from "../domain/canvasCommitSource";
import { AssetLibraryAssetCard } from "./AssetLibraryAssetCard";
import { BeatContextPanel } from "./AssetLibraryBeatPanels";
import { CanvasesTab } from "./CanvasesTab";
import {
  buildAssetLibraryTabs,
  filterAssetLibraryAssets,
} from "./assetLibraryViewModel";

type PanelTab = "library" | "canvases";

interface CatalogViewState {
  assets: LibraryAsset[];
  beatContext: FreezoneBeatContextResponse | null;
  error: string | null;
  assetImageCacheToken: string;
}

interface ReplacementViewState {
  activeDragMediaType: CanvasCommitMediaType | null;
  hoverAssetId: string | null;
  confirmingAssetId: string | null;
  busyAssetId: string | null;
  confirmReplacement: (asset: LibraryAsset) => void;
  cancelReplacement: () => void;
}

export interface AssetLibraryPanelViewProps {
  project: string;
  metadata: Record<string, unknown> | null;
  canvasKind: CanvasKind;
  catalog: CatalogViewState;
  replacement: ReplacementViewState;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  currentCanvasId: string;
  onRestoreMainlineDefault?: () => Promise<void> | void;
  hasPresetLabel: boolean;
  reloadToken?: number;
  onAddAsset: (asset: LibraryAsset, index: number) => void;
  cacheBustImage: (imageUrl: string, token: string) => string;
}

export function AssetLibraryPanelView({
  project,
  metadata,
  canvasKind,
  catalog,
  replacement,
  collapsed: collapsedProp,
  onCollapsedChange,
  currentCanvasId,
  onRestoreMainlineDefault,
  hasPresetLabel,
  reloadToken,
  onAddAsset,
  cacheBustImage,
}: AssetLibraryPanelViewProps) {
  const [panelTab, setPanelTab] = useState<PanelTab>("canvases");
  const [tab, setTab] = useState<AssetTab>("beat");
  const [query, setQuery] = useState("");
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const collapsed = collapsedProp ?? internalCollapsed;
  const filtered = useMemo(
    () => filterAssetLibraryAssets(catalog.assets, tab, query),
    [catalog.assets, query, tab],
  );
  const tabs = useMemo(
    () => buildAssetLibraryTabs(canvasKind, catalog.assets),
    [canvasKind, catalog.assets],
  );

  const setCollapsed = (next: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(next);
    } else {
      setInternalCollapsed(next);
    }
  };

  return (
    <aside className="pointer-events-none absolute inset-y-0 left-0 z-30 overflow-visible">
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
          <span className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-border bg-card shadow-lg transition-colors duration-200 group-hover/btn:border-primary/55 group-hover/btn:bg-accent">
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </span>
        </button>
        <span className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] font-medium text-popover-foreground/80 opacity-0 shadow-lg backdrop-blur-md transition-opacity duration-150 group-hover/handle:opacity-100">
          {collapsed ? "展开" : "收起"}
        </span>
      </div>

      <div
        className={`flex min-h-0 flex-col overflow-hidden rounded-[12px] border border-border bg-card text-card-foreground shadow-xl transition-[opacity,transform] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          collapsed
            ? "pointer-events-none -translate-x-3 opacity-0"
            : "pointer-events-auto translate-x-0 opacity-100"
        }`}
        style={{
          width: 288,
          marginLeft: 16,
          marginTop: 16,
          marginBottom: 16,
          height: "calc(100% - 32px)",
        }}
      >
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
            <div className="sticky top-0 z-10">
              <div className="ui-scrollbar-hidden flex items-center gap-1 overflow-x-auto px-3 pt-2.5 pb-2">
                {tabs.map((item) => (
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
                      <span className="ml-0.5 text-[10px] opacity-60">
                        ({item.count})
                      </span>
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

            {catalog.error ? (
              <div className="mx-3 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                项目素材加载失败：{catalog.error}
              </div>
            ) : tab === "beat" ? (
              <BeatContextPanel
                metadata={metadata}
                assets={filtered}
                canvasKind={canvasKind}
                beatContext={catalog.beatContext}
                cacheToken={catalog.assetImageCacheToken}
                cacheBustImage={cacheBustImage}
                onAddAsset={onAddAsset}
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
                    cacheToken={catalog.assetImageCacheToken}
                    cacheBustImage={cacheBustImage}
                    onAdd={() => onAddAsset(asset, index)}
                    activeDragMediaType={replacement.activeDragMediaType}
                    hoverAssetId={replacement.hoverAssetId}
                    isConfirming={replacement.confirmingAssetId === asset.id}
                    isReplacing={replacement.busyAssetId === asset.id}
                    onConfirm={() => replacement.confirmReplacement(asset)}
                    onCancel={replacement.cancelReplacement}
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
