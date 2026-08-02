// Copyright (c) 2026 AI anime
import {
  hasLegacyPresetCanvasMetadata,
  resolveCanvasKind,
  useAssetLibraryCatalogController,
} from "@/modules/creative_canvas/public";

import { addAssetToCanvas } from "../assetLibraryCanvasInsertionComposition";
import {
  useAssetLibraryReplacementController,
  type AssetLibraryReplacementHandler,
} from "../hooks/useAssetLibraryReplacementController";
import { AssetLibraryPanelView } from "./AssetLibraryPanelView";

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
  const hasPresetLabel = hasLegacyPresetCanvasMetadata(metadata);
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

  return (
    <AssetLibraryPanelView
      project={project}
      metadata={metadata}
      canvasKind={canvasKind}
      catalog={catalogController}
      replacement={replacementController}
      collapsed={collapsedProp}
      onCollapsedChange={onCollapsedChange}
      currentCanvasId={currentCanvasId}
      onRestoreMainlineDefault={onRestoreMainlineDefault}
      hasPresetLabel={hasPresetLabel}
      reloadToken={reloadToken}
      onAddAsset={addAssetToCanvas}
    />
  );
}
