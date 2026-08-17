// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { Loader2, Package, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AssetHeaderActions } from "@/components/assets/asset-header-actions-slot";
import {
  AssetResultCount,
  AssetSearchBox,
  AssetSortSelect,
} from "@/components/assets/asset-search-box";
import { CreditCostInline } from "@/components/credit-cost-inline";
import { StageProgressPanel } from "@/components/stage-progress-panel";
import { Button } from "@/components/ui/button";
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
import { EMPTY_STATE_ACTION_BUTTON_CLASS } from "@/components/ui/empty-state-styles";
import { HeaderRefreshButton } from "@/components/ui/header-refresh-button";
import { SUBTLE_HEADER_ACTION_BUTTON_CLASS } from "@/components/ui/header-action-styles";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PropsPanelController } from "@/modules/asset_world/application/use-props-panel-controller";
import type { PropAsset } from "@/modules/asset_world/domain/prop";

export function PropsPanelView({
  controller,
  dialogContent,
  imageSourceControl,
  renderPropCard,
}: {
  controller: PropsPanelController;
  dialogContent: ReactNode;
  imageSourceControl: ReactNode;
  renderPropCard(prop: PropAsset): ReactNode;
}) {
  const { t } = useTranslation();
  const {
    allItems,
    batchCurrentTask,
    batchGeneratePending,
    batchLogs,
    batchProgress,
    batchReferenceCost,
    batchStopping,
    deleteDialog,
    gridRef,
    handleBatchGenerate,
    isLoading,
    isRefetching,
    items,
    openNewProp,
    refresh,
    searchQuery,
    setSearchQuery,
    setSortKey,
    showBatchTask,
    sortKey,
    stopBatch,
  } = controller;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <AssetHeaderActions>
        {imageSourceControl}
        <HeaderRefreshButton
          label={t("common.refresh")}
          onRefresh={refresh}
          refreshing={isRefetching}
          data-props-refresh
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleBatchGenerate()}
          disabled={batchGeneratePending}
          className={cn(SUBTLE_HEADER_ACTION_BUTTON_CLASS, "relative")}
        >
          {batchGeneratePending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {t("assets.props.batchGenerate")}
          <CreditCostInline display={batchReferenceCost} />
        </Button>
        <TooltipProvider delay={80}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  onClick={openNewProp}
                  className="h-8 gap-1.5 rounded-[8px] bg-primary px-3 text-xs font-normal text-primary-foreground shadow-none hover:bg-primary/85 active:bg-primary/75"
                />
              }
            >
              <Plus className="size-3.5" />
              {t("assets.props.newProp")}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("assets.props.newPropHint")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </AssetHeaderActions>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {showBatchTask ? (
          <div className="mb-4 overflow-hidden rounded-lg border border-border/70">
            <StageProgressPanel
              title={t("assets.props.batchStatusTitle")}
              currentTask={batchCurrentTask}
              progress={batchProgress}
              logs={batchLogs}
              onStop={stopBatch}
              stopping={batchStopping}
            />
          </div>
        ) : null}
        {!isLoading && allItems.length > 0 ? (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <AssetSearchBox
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder={t("assets.common.searchProps")}
                ariaLabel={t("assets.common.searchProps")}
              />
              <AssetSortSelect value={sortKey} onValueChange={setSortKey} />
            </div>
            <AssetResultCount
              resultCount={items.length}
              totalCount={allItems.length}
            />
          </div>
        ) : null}
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : allItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-border bg-card">
              <Package className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-foreground">
                {t("assets.props.emptyTitle")}
              </h3>
              <p className="max-w-[15rem] text-xs leading-5 text-muted-foreground">
                {t("assets.props.emptyDescription")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={openNewProp}
              className={EMPTY_STATE_ACTION_BUTTON_CLASS}
            >
              <Plus className="size-3.5" />
              {t("assets.props.newProp")}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("assets.common.noMatch")}
          </div>
        ) : (
          <div
            ref={gridRef}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {items.map((prop) => (
              <div key={prop.name} data-asset-id={prop.name}>
                {renderPropCard(prop)}
              </div>
            ))}
          </div>
        )}
      </div>
      {dialogContent}
      <AlertDialog open={deleteDialog.open} onOpenChange={deleteDialog.onOpenChange}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assets.props.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("assets.props.confirmDelete", { name: deleteDialog.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDialog.pending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteDialog.pending}
              onClick={() => void deleteDialog.confirm()}
            >
              {deleteDialog.pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
