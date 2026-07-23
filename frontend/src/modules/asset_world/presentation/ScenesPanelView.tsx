// Copyright (c) 2026 AI anime
import { Loader2, Map, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { AssetHeaderActions } from "@/components/assets/asset-header-actions-slot";
import {
  AssetSearchBox,
  AssetSortSelect,
} from "@/components/assets/asset-search-box";
import { CreditCostInline } from "@/components/credit-cost-inline";
import { Button } from "@/components/ui/button";
import { EMPTY_STATE_ACTION_BUTTON_CLASS } from "@/components/ui/empty-state-styles";
import { HeaderRefreshButton } from "@/components/ui/header-refresh-button";
import { SUBTLE_HEADER_ACTION_BUTTON_CLASS } from "@/components/ui/header-action-styles";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveMediaUrl } from "@/lib/media-url";
import type { ScenesPanelController } from "@/modules/asset_world/application/use-scenes-panel-controller";
import type {
  SceneAsset,
  SceneGroup,
} from "@/modules/asset_world/domain/scene";

function sceneGroupPreviewUrl(group: SceneGroup): string {
  const withMaster = group.scenes.find((scene) =>
    resolveMediaUrl(scene.master_url),
  );
  return resolveMediaUrl(withMaster?.master_url) ?? "";
}

function SceneGroupListItem({
  group,
  selected,
  referenceCount,
  onSelect,
}: {
  group: SceneGroup;
  selected: boolean;
  referenceCount: number;
  onSelect(): void;
}) {
  const { t } = useTranslation();
  const previewUrl = sceneGroupPreviewUrl(group);
  return (
    <button
      type="button"
      aria-label={t("assets.scenes.selectScene", {
        name: group.baseName,
        defaultValue: "选择场景 {{name}}",
      })}
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        "flex w-full min-w-0 items-center gap-3 rounded-[10px] border p-2 text-left transition",
        selected
          ? "border-primary/35 bg-primary/[0.075] text-foreground"
          : "border-border bg-card text-foreground/82 hover:border-foreground/25 hover:bg-muted",
      ].join(" ")}
    >
      <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-media/20">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
          />
        ) : (
          <Map className="size-4 text-muted-foreground/65" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{group.baseName}</div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {group.scenes.length > 1 ? (
            <span>
              {t("assets.scenes.variantCount", {
                count: group.scenes.length,
                defaultValue: "{{count}} 个变体",
              })}
            </span>
          ) : null}
          {referenceCount > 0 ? (
            <span>
              {t("assets.scenes.referenceCount", {
                count: referenceCount,
                defaultValue: "{{count}} 次使用",
              })}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function ScenesPanelView({
  controller,
  dialogContent,
  imageSourceControl,
  renderSceneCard,
}: {
  controller: ScenesPanelController;
  dialogContent: ReactNode;
  imageSourceControl: ReactNode;
  renderSceneCard(scene: SceneAsset): ReactNode;
}) {
  const { t } = useTranslation();
  const {
    allItems,
    buildScenesCostDisplay,
    buildScenesPending,
    gridRef,
    handleBuildScenes,
    isLoading,
    isRefetching,
    openNewPlate,
    openNewScene,
    referenceCountForGroup,
    refresh,
    sceneGroups,
    searchQuery,
    selectedBaseName,
    selectedGroup,
    selectGroup,
    setSearchQuery,
    setSortKey,
    sortKey,
  } = controller;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <AssetHeaderActions>
        {imageSourceControl}
        <HeaderRefreshButton
          label={t("common.refresh")}
          onRefresh={refresh}
          refreshing={isRefetching}
          data-scenes-refresh
        />
        <Button
          variant="outline"
          size="sm"
          onClick={openNewScene}
          className={SUBTLE_HEADER_ACTION_BUTTON_CLASS}
        >
          <Plus className="size-3.5" />
          {t("assets.scenes.newScene")}
        </Button>
        <Button
          size="sm"
          onClick={() => void handleBuildScenes()}
          disabled={buildScenesPending}
          className="h-8 gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-normal text-primary-foreground shadow-none hover:bg-primary/85 active:bg-primary/75"
        >
          {buildScenesPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {t("assets.scenes.build")}
          <CreditCostInline
            display={buildScenesCostDisplay}
            className="text-primary-foreground"
            iconClassName="text-primary-foreground drop-shadow-none [&_path]:fill-current"
          />
        </Button>
      </AssetHeaderActions>
      {isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : allItems.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-border bg-card">
            <Map className="size-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">
              {t("assets.scenes.emptyTitle")}
            </h3>
            <p className="max-w-[15rem] text-xs leading-5 text-muted-foreground">
              {t("assets.scenes.emptyDescription")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={openNewScene}
            className={EMPTY_STATE_ACTION_BUTTON_CLASS}
          >
            <Plus className="size-3.5" />
            {t("assets.scenes.newScene")}
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden bg-background lg:flex">
          <aside className="flex max-h-[42vh] w-full shrink-0 flex-col overflow-hidden border-b border-border bg-background lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
            <div className="px-3 pb-2 pt-3">
              <div className="flex min-w-0 items-center gap-2">
                <AssetSearchBox
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder={t("assets.common.searchScenes")}
                  ariaLabel={t("assets.common.searchScenes")}
                  className="min-w-0 flex-1"
                />
                <div className="shrink-0">
                  <AssetSortSelect
                    value={sortKey}
                    onValueChange={setSortKey}
                  />
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2">
              {sceneGroups.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t("assets.common.noMatch")}
                </div>
              ) : (
                <div className="space-y-2">
                  {sceneGroups.map((group) => (
                    <SceneGroupListItem
                      key={group.baseName}
                      group={group}
                      selected={selectedBaseName === group.baseName}
                      referenceCount={referenceCountForGroup(group)}
                      onSelect={() => selectGroup(group.baseName)}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>
          <section className="min-w-0 flex-1 overflow-hidden bg-background">
            {!selectedGroup ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t("assets.common.noMatch")}
              </div>
            ) : (
              <div className="@container h-full overflow-y-auto px-4 py-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {selectedGroup.baseName}
                      </h3>
                      <span className="rounded-[5px] bg-muted px-1 py-0 text-[11px] font-medium leading-5 tabular-nums text-muted-foreground">
                        {selectedGroup.scenes.length}
                      </span>
                    </div>
                  </div>
                  <TooltipProvider delay={80}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={openNewPlate}
                            title={t("assets.scenes.newPlateHint", {
                              defaultValue:
                                "场景变体即「同一个地点的不同状态」",
                            })}
                            className="h-8 gap-1 rounded-[8px] border-border bg-transparent px-3 text-xs font-normal shadow-none hover:bg-muted"
                          />
                        }
                      >
                        <Plus className="size-3.5" />
                        {t("assets.scenes.newPlate", {
                          defaultValue: "添加场景变体",
                        })}
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {t("assets.scenes.newPlateHint", {
                          defaultValue:
                            "场景变体即「同一个地点的不同状态」",
                        })}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div
                  ref={gridRef}
                  className="mt-1.5 grid grid-cols-1 gap-3 xl:grid-cols-2"
                >
                  {selectedGroup.scenes.map((scene) => (
                    <div key={scene.name} data-asset-id={scene.name}>
                      {renderSceneCard(scene)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      {dialogContent}
    </div>
  );
}
