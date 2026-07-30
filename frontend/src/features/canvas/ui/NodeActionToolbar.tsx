// Copyright (c) 2026 AI anime
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { NodeToolbar as ReactFlowNodeToolbar } from "@xyflow/react";
import {
  Copy,
  Download,
  FolderOpen,
  Link2,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { downloadUrlAsFile } from "@/lib/browserDownload";
import { nodeMainlineFlags } from "@/features/canvas/domain/mainlineNodeFlags";
import { deriveNodeDropInfo } from "@/features/canvas/domain/assetDropInfo";

import {
  CANVAS_NODE_TYPES,
  DEFAULT_NODE_WIDTH,
  isAudioNode,
  isGroupNode,
  isImageEditNode,
  isImageGenNode,
  isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
  isVideoNode,
  resolveNodeSourceImageUrl,
  type BeatContextNodeData,
  type CanvasNode,
  type GroupNodeData,
} from "@/features/canvas/domain/canvasNodes";
import type { GridActionRequest } from "@/features/canvas/domain/gridAction";
import { AudioNodeToolbarActions } from "@/features/canvas/ui/AudioNodeToolbarActions";
import { GroupNodeToolbarActions } from "@/features/canvas/ui/GroupNodeToolbarActions";
import { ImageNodeToolbarActions } from "@/features/canvas/ui/ImageNodeToolbarActions";
import { NodeToolbarIconChip } from "@/features/canvas/ui/NodeToolbarIconChip";
import { StoryboardGroupToolbar } from "@/features/canvas/ui/StoryboardGroupToolbar";
import { VideoNodeToolbarActions } from "@/features/canvas/ui/VideoNodeToolbarActions";
import { canvasEventBus } from "@/features/canvas/application/canvasServices";
import { resolveBeatContextWorkbenchTarget } from "@/features/canvas/application/beatContextNodeModel";
import {
  buildNodeActionBeatContextData,
  isSameNodeActionBeatContext,
  resolveNodeActionBeatContext,
} from "@/features/canvas/application/nodeActionBeatContext";
import {
  projectNodeActionGenerationError,
  projectNodeActionStoryboardText,
  resolveNodeActionImageDownloadFilename,
} from "@/features/canvas/application/nodeActionToolbarModel";
import {
  extractMainlineContextsFromNode,
  openPresetProjectionInMyCanvas,
  useCanvasProjectionStatus,
} from "@/features/freezone/public";
import { UiChipButton, UiPanel } from "@/components/ui";
import { ZoomScaledToolbar } from "@/features/canvas/ui/ZoomScaledToolbar";
import { resolveImageDisplayUrl } from "@/features/canvas/application/imageData";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCanvasStore } from "@/features/canvas/canvasStore";
import { readUrl } from "@/lib/url-params";
import {
  NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS,
  NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS,
} from "./nodeActionToolbarStyles";
import {
  NODE_TOOLBAR_ALIGN,
  NODE_TOOLBAR_CLASS,
  NODE_TOOLBAR_OFFSET,
  NODE_TOOLBAR_POSITION,
} from "./nodeToolbarConfig";
interface NodeActionToolbarProps {
  node: CanvasNode;
  onOpenMultiAngleEditor: (nodeId: string) => void;
  onOpenLightEditor: (nodeId: string) => void;
  onOpenScene360: (nodeId: string) => void;
  onOpenUpscale: (nodeId: string) => void;
  onOpenOutpaint: (nodeId: string) => void;
  onOpenGridAction: (request: GridActionRequest) => void;
  onOpenRedraw: (nodeId: string) => void;
  onOpenErase: (nodeId: string) => void;
  onOpenRotate: (nodeId: string) => void;
}

export const NodeActionToolbar = memo(
  ({
    node,
    onOpenMultiAngleEditor,
    onOpenLightEditor,
    onOpenScene360,
    onOpenUpscale,
    onOpenOutpaint,
    onOpenGridAction,
    onOpenRedraw,
    onOpenErase,
    onOpenRotate,
  }: NodeActionToolbarProps) => {
    const { t, i18n } = useTranslation();
    const isImageEdit = isImageEditNode(node);
    // Plain (non-protected) group → eligible for ungroup. Captured up here as a
    // boolean + a plain id while `node` still has its full type: over-broad node
    // type guards below narrow `node` to `never` by the time the ungroup button
    // renders, so reading `node.id` at the call site fails to type-check.
    const nodeId = node.id;
    const isUngroupableGroup = isGroupNode(node) && !isProtectedProjectionGroupNode(node);
    // 同 nodeId:在 node 仍是完整类型时捕获组背景色。下方过宽的类型守卫会把 node
    // 收窄成 never,到 ungroup 按钮渲染处再读 node.data 会编译失败(tsc -b)。
    const groupBackgroundColor = isGroupNode(node)
      ? ((node.data as GroupNodeData).backgroundColor ?? null)
      : null;
    const deleteNode = useCanvasStore((state) => state.deleteNode);
    const addNode = useCanvasStore((state) => state.addNode);
    const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
    const requestFocusNode = useCanvasStore((state) => state.requestFocusNode);
    const ignoreAtTagWhenCopyingAndGenerating = useSettingsStore(
      (state) => state.ignoreAtTagWhenCopyingAndGenerating,
    );
    const [isCopyTextSuccess, setIsCopyTextSuccess] = useState(false);
    const [isCopyErrorSuccess, setIsCopyErrorSuccess] = useState(false);
    const copyTextFeedbackTimerRef = useRef<ReturnType<
      typeof setTimeout
    > | null>(null);
    const copyErrorFeedbackTimerRef = useRef<ReturnType<
      typeof setTimeout
    > | null>(null);
    // mainline canvas readonly state + "打开工作台" 入口需要的本地状态。
    const workbenchTarget = useMemo(
      () =>
        resolveBeatContextWorkbenchTarget(
          node.data as BeatContextNodeData,
        ),
      [node.data],
    );
    const [openingWorkbench, setOpeningWorkbench] = useState(false);
    // 用统一 helper 解析节点当前图片源，避免每种图片节点各写一套判断。
    const imageSource = useMemo(() => resolveNodeSourceImageUrl(node), [node]);
    const canHandleImage = Boolean(imageSource);
    // commit 按钮现在覆盖所有媒体节点(图像/视频/音频/3GS)——只要能从节点推断出
    // 可提交的媒体 url 就显示。具体提交目标在 CommitDialog 里按 mediaType 处理。
    const canCommitNode = useMemo(
      () => Boolean(deriveNodeDropInfo(node)?.sourceUrl),
      [node],
    );
    const protectedProjectionKey =
      isProtectedProjectionGroupNode(node) &&
      typeof node.data.projection_key === "string" &&
      node.data.projection_key.trim()
        ? node.data.projection_key.trim()
        : null;
    const projectionStatus = useCanvasProjectionStatus(protectedProjectionKey);
    const projectionIsStale = projectionStatus?.stale === true;
    const extractableBeatContext = useMemo(
      () => resolveNodeActionBeatContext(node, readUrl().project),
      [node],
    );
    const generationErrorFallback = t("ai.error");
    const generationErrorProjection = useMemo(
      () =>
        projectNodeActionGenerationError(node, generationErrorFallback),
      [generationErrorFallback, node],
    );
    const canCopyGenerationError = generationErrorProjection.canCopy;
    const generationErrorReport = generationErrorProjection.report;

    useEffect(() => {
      return () => {
        if (copyTextFeedbackTimerRef.current) {
          clearTimeout(copyTextFeedbackTimerRef.current);
        }
        if (copyErrorFeedbackTimerRef.current) {
          clearTimeout(copyErrorFeedbackTimerRef.current);
        }
      };
    }, []);

    const storyboardTextProjection = useMemo(
      () =>
        projectNodeActionStoryboardText(
          node,
          ignoreAtTagWhenCopyingAndGenerating,
          (index, content) =>
            t("nodeToolbar.storyboardLine", { index, content }),
        ),
      [
        ignoreAtTagWhenCopyingAndGenerating,
        node,
        t,
        i18n.language,
      ],
    );
    const canCopyStoryboardText = storyboardTextProjection.canCopy;
    const storyboardText = storyboardTextProjection.text;

    const handleCopyStoryboardText = useCallback(async () => {
      if (!storyboardText) {
        return;
      }

      setIsCopyTextSuccess(true);
      if (copyTextFeedbackTimerRef.current) {
        clearTimeout(copyTextFeedbackTimerRef.current);
      }
      copyTextFeedbackTimerRef.current = setTimeout(() => {
        setIsCopyTextSuccess(false);
        copyTextFeedbackTimerRef.current = null;
      }, 1100);

      try {
        await navigator.clipboard.writeText(storyboardText);
      } catch (error) {
        console.error("Failed to copy storyboard text", error);
      }
    }, [storyboardText]);

    const handleCopyGenerationError = useCallback(async () => {
      if (!canCopyGenerationError) {
        return;
      }

      setIsCopyErrorSuccess(true);
      if (copyErrorFeedbackTimerRef.current) {
        clearTimeout(copyErrorFeedbackTimerRef.current);
      }
      copyErrorFeedbackTimerRef.current = setTimeout(() => {
        setIsCopyErrorSuccess(false);
        copyErrorFeedbackTimerRef.current = null;
      }, 1100);

      try {
        await navigator.clipboard.writeText(generationErrorReport);
      } catch (error) {
        console.error("Failed to copy generation error report", error);
      }
    }, [canCopyGenerationError, generationErrorReport]);

    const imageDownloadFilename = useMemo(
      () => resolveNodeActionImageDownloadFilename(node),
      [node],
    );

    const handleDownloadSaveAs = useCallback(async () => {
      if (!imageSource) {
        return;
      }
      try {
        await downloadUrlAsFile(
          resolveImageDisplayUrl(imageSource),
          imageDownloadFilename,
        );
      } catch (error) {
        console.error("Failed to download image", error);
      }
    }, [imageDownloadFilename, imageSource]);

    const handleOpenWorkbench = useCallback(() => {
      if (!workbenchTarget || openingWorkbench) {
        return;
      }
      const projectId = readUrl().project;
      if (!projectId) {
        console.warn("[freezone] no project_id in URL (?p=<project_id>)");
        return;
      }
      setOpeningWorkbench(true);
      void (async () => {
        try {
          await openPresetProjectionInMyCanvas(projectId, {
            scope: workbenchTarget.scope,
            episode: workbenchTarget.episode,
            beat: workbenchTarget.beat,
            primary_slot: "render",
          });
        } catch (error) {
          console.error("[freezone] open workbench failed", error);
        } finally {
          setOpeningWorkbench(false);
        }
      })();
    }, [openingWorkbench, workbenchTarget]);

    const handleEnsureBeatContextNode = useCallback(
      (event: ReactMouseEvent) => {
        event.stopPropagation();
        if (!extractableBeatContext) return;

        const store = useCanvasStore.getState();
        const existing = store.nodes.find((candidate) =>
          extractMainlineContextsFromNode(candidate).some((ctx) =>
            isSameNodeActionBeatContext(ctx, extractableBeatContext),
          ),
        );
        if (existing?.id) {
          setSelectedNode(String(existing.id));
          requestFocusNode(String(existing.id));
          return;
        }

        const nodeWidth =
          node.measured?.width ??
          (typeof node.width === "number" ? node.width : DEFAULT_NODE_WIDTH);
        const contextNodeId = addNode(
          CANVAS_NODE_TYPES.beatContext,
          {
            x: node.position.x + nodeWidth + 80,
            y: node.position.y,
          },
          buildNodeActionBeatContextData(extractableBeatContext),
        );
        setSelectedNode(contextNodeId);
        requestFocusNode(contextNodeId);
      },
      [
        addNode,
        extractableBeatContext,
        node.measured?.width,
        node.position.x,
        node.position.y,
        node.width,
        requestFocusNode,
        setSelectedNode,
      ],
    );

    // Per-node mainline lock decision: only preset-managed nodes are locked.
    // Ordinary/user-created nodes stay editable even on a mainline preset canvas.
    //
    // NB: we deliberately do NOT early-return on locked. preset_managed
    // nodes still need access to **spawn-style** edit tools (relight /
    // multi-dim / crop / repaint / outpaint) — those produce new
    // user_spawned children that carry the inherited slot_target and Push
    // back to the same canonical. The lock affects only:
    //   - mutate-in-place tools (Rotate, the HD/upscale entry inside the
    //     edit-menu dropdown) — they'd violate canonical immutability;
    // The leading "主线投影 · 锁定" pill (+ optional "打开工作台" button)
    // signals the state visually so the user knows why some chips are
    // missing.
    const _toolbarFlags = nodeMainlineFlags(node);
    const isPresetLocked = _toolbarFlags.isPresetManaged;

    // 分镜组 has its own dedicated toolbar (aspect / grid / index / convert /
    // ungroup) — render it instead of the generic node toolbar.
    if (isStoryboardGroupNode(node)) {
      return <StoryboardGroupToolbar node={node} />;
    }

    return (
      <>
        <ReactFlowNodeToolbar
          nodeId={node.id}
          isVisible
          position={NODE_TOOLBAR_POSITION}
          align={NODE_TOOLBAR_ALIGN}
          offset={NODE_TOOLBAR_OFFSET}
          className={NODE_TOOLBAR_CLASS}
        >
          <ZoomScaledToolbar origin="bottom center" mode="counter" counterMax={1}>
          {/* 节点激活时，顶部菜单从节点上沿淡入+轻微上滑浮现（而非生硬地直接出现），
              与下方操作区的入场动画呼应。motion-reduce 下退化为无动画。 */}
          <UiPanel className="flex animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 items-center gap-1.5 rounded-[18px] !border-border !bg-popover/95 px-2 py-1.5 text-sm shadow-xl backdrop-blur-2xl duration-200 ease-out motion-reduce:animate-none [&_svg]:h-4 [&_svg]:w-4">
            {/* Mainline lock indicator — shown as a leading pill when the
                node is preset-managed (or canvas-level fallback applies).
                The chips below remain visible for spawn-style edits; the
                mutate-style chips are gated separately so
                the user can still spawn user_spawned children from a
                canonical slot but cannot violate its immutability. */}
            {isPresetLocked && (
              <span
                key="mainline-lock-pill"
                className="rounded-full border border-warning/35 bg-warning/10 px-3 py-1.5 text-sm text-warning"
              >
                主线投影 · 锁定
              </span>
            )}
            {isPresetLocked && workbenchTarget && (
              <UiChipButton
                key="mainline-open-workbench"
                className={`h-9 ${NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS} border-primary/45 bg-primary/10 px-3 text-sm text-primary hover:bg-primary/15 disabled:opacity-50`}
                disabled={openingWorkbench}
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenWorkbench();
                }}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {openingWorkbench ? "打开中..." : "打开工作台"}
              </UiChipButton>
            )}
            {extractableBeatContext && node.type !== CANVAS_NODE_TYPES.beatContext && (
              <UiChipButton
                key="extract-beat-context"
                className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
                title="创建或定位这个素材对应的镜头上下文节点；不会自动连线"
                onClick={handleEnsureBeatContextNode}
              >
                <Link2 className="h-3.5 w-3.5" />
                镜头上下文
              </UiChipButton>
            )}
            <ImageNodeToolbarActions
              node={node}
              isPresetLocked={isPresetLocked}
              onOpenMultiAngleEditor={onOpenMultiAngleEditor}
              onOpenLightEditor={onOpenLightEditor}
              onOpenScene360={onOpenScene360}
              onOpenUpscale={onOpenUpscale}
              onOpenOutpaint={onOpenOutpaint}
              onOpenGridAction={onOpenGridAction}
              onOpenRedraw={onOpenRedraw}
              onOpenErase={onOpenErase}
              onOpenRotate={onOpenRotate}
            />
            {!isImageEdit && canCopyStoryboardText && (
              <UiChipButton
                key="storyboard-text-copy"
                className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} ${
                  isCopyTextSuccess
                    ? "!border-success/45 !bg-success/10 !text-success hover:!bg-success/15"
                    : ""
                }`}
                onClick={() => {
                  void handleCopyStoryboardText();
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {t("nodeToolbar.copyText")}
              </UiChipButton>
            )}
            {!isImageEdit && canCopyGenerationError && (
              <UiChipButton
                key="generation-error-copy"
                className={`${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} ${
                  isCopyErrorSuccess
                    ? "!border-success/45 !bg-success/10 !text-success hover:!bg-success/15"
                    : "!border-destructive/45 !bg-destructive/10 !text-destructive hover:!bg-destructive/15"
                }`}
                onClick={() => {
                  void handleCopyGenerationError();
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {isCopyErrorSuccess
                  ? t("nodeToolbar.copied")
                  : t("nodeToolbar.copyErrorReport")}
              </UiChipButton>
            )}
            {!isImageEdit && canHandleImage && (
              <NodeToolbarIconChip
                key="image-download"
                label={t("nodeToolbar.download")}
                icon={Download}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleDownloadSaveAs();
                }}
              />
            )}
            {isVideoNode(node) && (
              <VideoNodeToolbarActions nodeId={node.id} data={node.data} />
            )}
            {isAudioNode(node) && (
              <AudioNodeToolbarActions nodeId={node.id} data={node.data} />
            )}
            {!isImageEdit && isUngroupableGroup && (
              <GroupNodeToolbarActions
                nodeId={nodeId}
                backgroundColor={groupBackgroundColor}
              />
            )}
            {protectedProjectionKey && (
              <UiChipButton
                key="projection-refresh"
                className={
                  projectionIsStale
                    ? `${NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS} !border-warning/50 !bg-warning/10 !text-warning hover:!bg-warning/15`
                    : NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS
                }
                title={
                  projectionIsStale
                    ? t("freezone.projections.staleBadge")
                    : undefined
                }
                onClick={(event) => {
                  event.stopPropagation();
                  canvasEventBus.publish("freezone/projection-sync", {
                    projectionKey: protectedProjectionKey,
                  });
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {projectionIsStale
                  ? t("freezone.projections.syncStale")
                  : t("freezone.projections.sync")}
              </UiChipButton>
            )}
            {!isImageGenNode(node) && !isVideoNode(node) && !isAudioNode(node) && (
              <UiChipButton
                key="node-delete"
                className={`h-9 ${NODE_ACTION_TOOLBAR_BUTTON_RADIUS_CLASS} !border-transparent !bg-transparent px-3 text-sm text-destructive hover:!bg-destructive/10 hover:!text-destructive`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (protectedProjectionKey) {
                    canvasEventBus.publish("freezone/projection-remove", {
                      projectionKey: protectedProjectionKey,
                    });
                    return;
                  }
                  deleteNode(node.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {protectedProjectionKey
                  ? t("freezone.projections.remove")
                  : t("common.delete")}
              </UiChipButton>
            )}
            {canCommitNode && (
              <UiChipButton
                key="node-commit"
                className={NODE_ACTION_TOOLBAR_TEXT_BUTTON_CLASS}
                onClick={(event) => {
                  event.stopPropagation();
                  canvasEventBus.publish("freezone/commit-node", {
                    nodeId: node.id,
                  });
                }}
                title="把当前节点的内容写回主流程资产"
              >
                <Send className="h-3.5 w-3.5" />
                提交
              </UiChipButton>
            )}
          </UiPanel>
          </ZoomScaledToolbar>
        </ReactFlowNodeToolbar>
      </>
    );
  },
);

NodeActionToolbar.displayName = "NodeActionToolbar";
