// Copyright (c) 2026 AI anime
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  AlignJustify,
  ArrowUp,
  AlertCircle,
  ChevronDown,
  Expand,
  FileText,
  ImageIcon,
  Languages,
  Loader2,
  User,
  Video,
  X,
} from 'lucide-react';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
  type ScriptGenAction,
  type ScriptNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { isRenderableImageSrc, resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { NodeGenerationOverlay } from '@/features/canvas/ui/NodeGenerationOverlay';
import { RegenerateButton } from '@/features/canvas/ui/RegenerateButton';
import { EditableTableCell } from '@/features/canvas/ui/EditableTableCell';
import {
  CANVAS_NODE_INPUT_FRAME_CLASS,
  CANVAS_NODE_INPUT_PLACEHOLDER_CLASS,
  CANVAS_NODE_INPUT_SURFACE_CLASS,
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  canvasNodeFrameClass,
} from '@/features/canvas/ui/nodeFrameStyles';
import { OperationPanelShell } from '@/features/canvas/ui/OperationPanelShell';
import { PanelExpandButton } from '@/features/canvas/ui/PanelExpandButton';
import { useCanvasStore } from '@/stores/canvasStore';
import {
  buildCanvasStoryScriptCommand,
  classifyCanvasStoryScriptReference,
  isCanvasStoryScriptResult as isScriptResult,
  STORY_SCRIPT_SOURCE_REQUIRED_MESSAGE,
  type CanvasStoryScriptReference as ScriptReference,
} from '@/features/canvas/application/generateCanvasStoryScript';
import type { CanvasGenerationHistoryRecord } from '@/features/canvas/application/generationHistory';
import type { CanvasStoryScriptRow } from '@/features/canvas/application/ports';
import {
  generateCanvasStoryScript,
  translateCanvasText,
} from '@/features/canvas/composition';
import { generationTaskDescriptor } from '@/features/canvas/application/resumeGeneration';
import { useUpstreamNodes } from '@/features/canvas/hooks/useUpstreamGraph';
import { useNodeGenerationTaskState } from '@/features/canvas/hooks/useNodeGenerationTaskState';
import { useNodeGenerationHistory } from '@/features/canvas/hooks/useNodeGenerationHistory';
import {
  NodeGenerationHistory,
  hasCompletedHistoryRecords,
} from '@/features/canvas/ui/NodeGenerationHistory';
import { readUrl } from '@/lib/url-params';
import { CreditCostPill } from '@/components/credits/credit-visual';
import { useGenerationCreditCost } from '@/lib/queries/generation-credit-cost';
import {
  NODE_CREDIT_PILL_FLAT_CLASS,
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_DISABLED_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
  NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS,
  NODE_INLINE_ICON_BUTTON_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';

type ScriptNodeProps = NodeProps & {
  id: string;
  data: ScriptNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 320;
// 出现表格后默认放大到 libtv 同款尺寸（800x400）。
const DEFAULT_WIDTH_WITH_RESULT = 800;
const DEFAULT_HEIGHT_WITH_RESULT = 400;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;
const PANEL_GAP_PX = 12;
const PANEL_OVERHANG_PX = 60;
// 「放大」后的输入面板尺寸：给提示词编辑区更舒适的高度与宽度（与 ImageGenNode 同款体验）。
const OPS_PANEL_EXPANDED_WIDTH = 880;
const OPS_PANEL_EXPANDED_HEIGHT = 560;

// 上游节点的预估尺寸（与各自节点 DEFAULT_WIDTH / DEFAULT_HEIGHT 对齐），
// 用于把生成的 text / video / upload 节点放到脚本节点左侧时计算坐标。
// 注：addNode 实际尺寸由 canvasNodeFactory 决定，这里只是布局用近似值。
const SPAWN_TEXT_WIDTH = 440;
const SPAWN_TEXT_HEIGHT = 320;
const SPAWN_VIDEO_WIDTH = 580;
const SPAWN_VIDEO_HEIGHT = 380;
const SPAWN_UPLOAD_WIDTH = 320;
const SPAWN_UPLOAD_HEIGHT = 350;
const SPAWN_GAP_X = 40;
const SPAWN_GAP_Y = 24;

// 后端 freezone/text/story-script 接口未来会调整，模型参数暂不前端控制，
// 也不在 UI 里暴露选择器；提交时不传 model，由后端默认行为决定。

interface ScriptActionDef {
  key: ScriptGenAction;
  label: string;
  Icon: typeof AlignJustify;
}

const SCRIPT_ACTIONS: ScriptActionDef[] = [
  {
    key: 'fromScript',
    label: '剧本生成分镜脚本',
    Icon: AlignJustify,
  },
  {
    key: 'fromVideoRef',
    label: '视频参考生成分镜脚本',
    Icon: Video,
  },
  {
    key: 'fromCharacter',
    label: '角色生成分镜脚本',
    Icon: User,
  },
];

// 与 libtv 脚本表格列对齐：19 列、宽度按像素硬性给定，整体 min-width 由 tailwind 继承。
// 当前脚本结果未提供 character_2 / character_image_* / reference 字段，
// 通过 row[key] 软查询：缺值统一渲染 "-"。
type ScriptCellRender = 'text' | 'image';

interface ScriptColumnDef {
  key: string;
  label: string;
  /** 像素宽度（既作为 min-width 也作为 width，避免列在长文本下抖动）。 */
  widthPx: number;
  render?: ScriptCellRender;
}

const SCRIPT_COLUMNS: ScriptColumnDef[] = [
  { key: 'shot_no', label: '镜号', widthPx: 60 },
  { key: 'duration', label: '时长', widthPx: 80 },
  { key: 'visual_description', label: '画面描述', widthPx: 200 },
  { key: 'character', label: '角色1', widthPx: 120 },
  { key: 'character_desc_1', label: '角色描述1', widthPx: 180 },
  { key: 'character_image_1', label: '角色图1', widthPx: 80, render: 'image' },
  { key: 'character_2', label: '角色2', widthPx: 120 },
  { key: 'character_desc_2', label: '角色描述2', widthPx: 180 },
  { key: 'character_image_2', label: '角色图2', widthPx: 80, render: 'image' },
  { key: 'reference', label: '参考', widthPx: 80, render: 'image' },
  { key: 'shot', label: '景别', widthPx: 120 },
  { key: 'action', label: '角色动作', widthPx: 120 },
  { key: 'emotion', label: '情绪', widthPx: 120 },
  { key: 'scene_tags', label: '场景标签', widthPx: 120 },
  { key: 'lighting_mood', label: '光影氛围', widthPx: 120 },
  { key: 'sound', label: '音效', widthPx: 120 },
  { key: 'dialogue', label: '对白', widthPx: 120 },
  { key: 'shot_prompt', label: '分镜提示词', widthPx: 200 },
  { key: 'video_motion_prompt', label: '视频运动提示词', widthPx: 200 },
];

const SCRIPT_TABLE_MIN_WIDTH = SCRIPT_COLUMNS.reduce(
  (sum, col) => sum + col.widthPx,
  0,
);

// 提交逻辑抽成共享 hook：节点本体的「重试」按钮与底部操作面板的「生成」按钮共用同一条
// 提交路径。错误统一写进 data.generationError（渲染在节点本体上），不再用面板本地 state。
function useScriptStorySubmit(
  nodeId: string,
  references: ScriptReference[],
  prompt: string,
  data: ScriptNodeData,
  onSettled?: () => void,
): { submit: () => Promise<void>; isGenerating: boolean } {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const { isGenerating } = useNodeGenerationTaskState(data);

  const submit = useCallback(async () => {
    if (isGenerating) return;
    const project = readUrl().project;
    if (!project) {
      console.error('[script-node] submit: no project in URL');
      updateNodeData(nodeId, { generationError: '缺少 project 参数' });
      return;
    }

    const command = buildCanvasStoryScriptCommand({
      references,
      prompt,
      canvasId: readUrl().canvas ?? 'default',
      nodeId,
    });
    if (!command) {
      updateNodeData(nodeId, {
        generationError: STORY_SCRIPT_SOURCE_REQUIRED_MESSAGE,
      });
      return;
    }

    updateNodeData(nodeId, {
      isGenerating: true,
      generationStartedAt: Date.now(),
      generationError: null,
    });
    try {
      const result = await generateCanvasStoryScript(
        { projectId: project, command },
        (task) => {
          // Persist the task handle so a page refresh can resume this job.
          updateNodeData(nodeId, generationTaskDescriptor(task));
        },
      );
      updateNodeData(nodeId, {
        isGenerating: false,
        generationStartedAt: null,
        scriptResult: result.scriptResult,
        scriptTitle: result.scriptResult.title ?? null,
        generationError: null,
      });
    } catch (error) {
      console.error('[script-node] submit failed', error);
      updateNodeData(nodeId, {
        isGenerating: false,
        generationStartedAt: null,
        generationError: error instanceof Error ? error.message : '生成失败',
      });
    } finally {
      onSettled?.();
    }
  }, [isGenerating, nodeId, references, prompt, updateNodeData, onSettled]);

  return { submit, isGenerating };
}

export const ScriptNode = memo(({ id, data, selected, width, height }: ScriptNodeProps) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  // Subscribe to ONLY one-hop upstream (not the whole nodes array) so unrelated
  // node drags don't re-render this node. See useUpstreamGraph.
  const upstreamNodes = useUpstreamNodes(id);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const resolvedTitle = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.script, data),
    [data],
  );

  const scriptResult = isScriptResult(data.scriptResult) ? data.scriptResult : null;
  const rows = scriptResult?.rows ?? [];
  const hasResult = rows.length > 0;

  // 表格单元格编辑：把编辑过的值写回 data.scriptResult.rows[idx][colKey]。
  // 整个 scriptResult 是 store 持有的 single source of truth，节点表格 +
  // 全屏表格都共享同一个 onCommit，确保两处编辑都能落盘。
  const handleCellCommit = useCallback(
    (rowIndex: number, colKey: string, nextValue: string) => {
      if (!scriptResult) return;
      const existingRows = scriptResult.rows ?? [];
      const existing = existingRows[rowIndex];
      if (!existing) return;
      const prevRaw = existing[colKey];
      const prev = typeof prevRaw === 'string' ? prevRaw : prevRaw == null ? '' : String(prevRaw);
      if (prev === nextValue) return;
      const nextRows = existingRows.map((row, index) =>
        index === rowIndex ? { ...row, [colKey]: nextValue } : row,
      );
      updateNodeData(id, {
        scriptResult: { ...scriptResult, rows: nextRows },
      });
    },
    [id, scriptResult, updateNodeData],
  );
  // 出现表格后默认尺寸切到 800x400；用户已 resize 过的节点尊重原宽高。
  const fallbackWidth = hasResult ? DEFAULT_WIDTH_WITH_RESULT : DEFAULT_WIDTH;
  const fallbackHeight = hasResult ? DEFAULT_HEIGHT_WITH_RESULT : DEFAULT_HEIGHT;
  const resolvedWidth = Math.max(MIN_WIDTH, Math.round(width ?? fallbackWidth));
  const resolvedHeight = Math.max(MIN_HEIGHT, Math.round(height ?? fallbackHeight));

  const headerSubtitle = scriptResult?.title?.trim() || data.scriptTitle?.trim() || '';

  // 上游节点 → references；用于隐藏「尝试」入口、生成 chip、提交时拼 source_text。
  const references = useMemo<ScriptReference[]>(() => {
    const upstream = [...upstreamNodes];
    upstream.sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));
    return upstream
      .map((node) => classifyCanvasStoryScriptReference(node))
      .filter((entry): entry is ScriptReference => entry != null);
  }, [upstreamNodes]);
  const hasUpstream = references.length > 0;
  const isNodeSelected = Boolean(selected) || selectedNodeId === id;
  const promptText = typeof data.prompt === 'string' ? data.prompt : '';
  // Per-node story-script history; fetched only while the node is selected.
  // 提到节点本体这一层：本体「重试」与面板「生成」共用下面同一个提交实例，任何
  // 一条提交路径 settle 都会刷新历史（拆成两个实例时重试路径不刷新，历史会缺新记录）。
  const {
    records: historyRecords,
    isLoading: historyLoading,
    refresh: refreshHistory,
  } = useNodeGenerationHistory(id, { enabled: isNodeSelected });
  const { submit, isGenerating } = useScriptStorySubmit(
    id,
    references,
    promptText,
    data,
    refreshHistory,
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, resolvedHeight, resolvedWidth, updateNodeInternals]);

  // Esc 关闭全屏。
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFullscreen]);

  const cardToneClass = canvasNodeFrameClass({ selected: isNodeSelected });

  // 三个快捷动作：在脚本节点左侧创建对应类型的上游节点并连边。
  // - fromScript     → 1 个 text 节点
  // - fromVideoRef   → 1 个 video 节点
  // - fromCharacter  → 2 个 upload 节点（垂直堆叠）
  const handlePickAction = useCallback(
    (action: ScriptActionDef) => {
      const state = useCanvasStore.getState();
      const self = state.nodes.find((n) => n.id === id);
      if (!self) return;
      const selfHeight = self.height ?? resolvedHeight;
      const centerY = self.position.y + selfHeight / 2;
      const nodeSize = (
        node: CanvasNode,
        fallbackWidth: number,
        fallbackHeight: number,
      ) => ({
        width:
          node.measured?.width ??
          (typeof node.width === 'number' ? node.width : fallbackWidth),
        height:
          node.measured?.height ??
          (typeof node.height === 'number' ? node.height : fallbackHeight),
      });
      const overlaps = (
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number },
      ) => {
        const margin = 12;
        return (
          a.x < b.x + b.width + margin &&
          a.x + a.width + margin > b.x &&
          a.y < b.y + b.height + margin &&
          a.y + a.height + margin > b.y
        );
      };
      const occupiedRects = state.nodes
        .filter((node) => node.id !== self.id)
        .map((node) => {
          const size = nodeSize(node, SPAWN_UPLOAD_WIDTH, SPAWN_UPLOAD_HEIGHT);
          return {
            x: node.position.x,
            y: node.position.y,
            width: size.width,
            height: size.height,
          };
        });

      const spawn = (
        type: CanvasNodeType,
        spawnWidth: number,
        spawnHeight: number,
        offsetY: number,
        extra?: Record<string, unknown>,
      ) => {
        const x = self.position.x - spawnWidth - SPAWN_GAP_X;
        const y = centerY - spawnHeight / 2 + offsetY;
        const newId = state.addNode(type, { x, y }, extra ?? {});
        state.addEdge(newId, id);
        return newId;
      };

      const spawnStacked = (
        type: CanvasNodeType,
        spawnWidth: number,
        spawnHeight: number,
        seeds: ReadonlyArray<Record<string, unknown>>,
      ): string[] => {
        const newIds: string[] = [];
        if (seeds.length === 0) return newIds;
        const baseX = self.position.x - spawnWidth - SPAWN_GAP_X;
        const stepY = spawnHeight + SPAWN_GAP_Y;
        const totalH = spawnHeight * seeds.length + SPAWN_GAP_Y * (seeds.length - 1);
        const preferredStartY = self.position.y + (selfHeight - totalH) / 2;
        const upstreamIds = new Set(
          state.edges.filter((edge) => edge.target === id).map((edge) => edge.source),
        );
        const columnNodes = state.nodes.filter((node) => {
          if (!upstreamIds.has(node.id)) return false;
          if (node.type !== type) return false;
          return Math.abs(node.position.x - baseX) < 8;
        });
        const lastColumnY = columnNodes.reduce<number | null>(
          (maxY, node) => (maxY === null ? node.position.y : Math.max(maxY, node.position.y)),
          null,
        );
        let y =
          lastColumnY === null
            ? preferredStartY
            : Math.max(preferredStartY, lastColumnY + stepY);

        seeds.forEach((seed) => {
          for (let attempt = 0; attempt < 40; attempt += 1) {
            const candidate = { x: baseX, y, width: spawnWidth, height: spawnHeight };
            if (!occupiedRects.some((rect) => overlaps(candidate, rect))) {
              break;
            }
            y += stepY;
          }
          occupiedRects.push({ x: baseX, y, width: spawnWidth, height: spawnHeight });
          const newId = state.addNode(type, { x: baseX, y }, seed);
          state.addEdge(newId, id);
          newIds.push(newId);
          y += stepY;
        });
        return newIds;
      };

      if (action.key === 'fromScript') {
        // 上游 text 节点只用作内容输入：referenceOnly 关掉 mode 列表 / 模型 / 提交。
        const newId = spawn(CANVAS_NODE_TYPES.textAnnotation, SPAWN_TEXT_WIDTH, SPAWN_TEXT_HEIGHT, 0, {
          referenceOnly: true,
          displayName: '剧本',
        });
        state.autoGroupSpawn(id, [newId], { label: `${action.label}组` });
      } else if (action.key === 'fromVideoRef') {
        // 上游 video 节点只用作素材引用：referenceOnly 关掉底部生成操作面板，
        // 顶部 toolbar（剪辑/高清/解析/智能去字幕/...）保持可用。
        const newId = spawn(CANVAS_NODE_TYPES.video, SPAWN_VIDEO_WIDTH, SPAWN_VIDEO_HEIGHT, 0, {
          referenceOnly: true,
        });
        state.autoGroupSpawn(id, [newId], { label: `${action.label}组` });
      } else if (action.key === 'fromCharacter') {
        const newIds = spawnStacked(
          CANVAS_NODE_TYPES.upload,
          SPAWN_UPLOAD_WIDTH,
          SPAWN_UPLOAD_HEIGHT,
          [{ displayName: '角色 1' }, { displayName: '角色 2' }],
        );
        state.autoGroupSpawn(id, newIds, { label: `${action.label}组` });
      }

      updateNodeData(id, { lastAction: action.key });
    },
    [id, resolvedHeight, updateNodeData],
  );

  return (
    <div
      className="group relative h-full w-full overflow-visible"
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="!h-2 !w-2 !border-0 !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="!h-2 !w-2 !border-0 !bg-muted-foreground"
      />

      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<FileText className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
      />

      <NodeResizeHandle
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        maxWidth={MAX_WIDTH}
        maxHeight={MAX_HEIGHT}
      />

      <div
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-[var(--node-radius)] border ${CANVAS_NODE_PANEL_SURFACE_CLASS} transition-colors ${cardToneClass}`}
      >
        {isGenerating && (
          <NodeGenerationOverlay
            startedAt={data.generationStartedAt ?? null}
            durationMs={data.generationDurationMs}
          />
        )}
        {hasResult ? (
          <>
            <ScriptResultHeader
              title={headerSubtitle}
              onFullscreen={() => setIsFullscreen(true)}
            />
            {/* 已有结果时重新生成失败：表格上方横幅提示 + 重试，
                否则失败只写进 data.generationError、界面毫无反应。 */}
            {data.generationError && !isGenerating && (
              <div className="flex items-center gap-2 border-b border-destructive/25 bg-destructive/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <span
                  className="min-w-0 flex-1 truncate text-[12px] leading-5 text-destructive"
                  title={data.generationError}
                >
                  {data.generationError}
                </span>
                <RegenerateButton label="重试" onClick={() => void submit()} />
              </div>
            )}
            <div className="flex-1 overflow-hidden p-2">
              <ScriptResultTable rows={rows} onCellCommit={handleCellCommit} />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <div
              className="flex h-full flex-col justify-center gap-2 py-4"
              style={{ marginInline: 32 }}
            >
              {!hasUpstream && (
                <>
                  <div className="text-xs text-[var(--canvas-node-input-helper)]">试试：</div>
                  <div className="flex flex-col gap-0.5">
                    {SCRIPT_ACTIONS.map((action) => {
                      const Icon = action.Icon;
                      return (
                        <button
                          key={action.key}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePickAction(action);
                          }}
                          className="-mx-2 inline-flex items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-text-muted/90" />
                          <span className="truncate">{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {data.generationError && !isGenerating && (
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertCircle className="h-6 w-6 opacity-90" />
                  <span className="max-h-[72px] overflow-y-auto break-words text-center text-[12px] leading-5 text-destructive">
                    {data.generationError}
                  </span>
                  <RegenerateButton
                    label="重试"
                    onClick={() => void submit()}
                    busy={isGenerating}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isNodeSelected && (hasUpstream || promptHasContent(data)) && (
        <ScriptOperationsPanel
          nodeId={id}
          data={data}
          references={references}
          onSubmit={submit}
          isGenerating={isGenerating}
          historyRecords={historyRecords}
          historyLoading={historyLoading}
          refreshHistory={refreshHistory}
        />
      )}

      {hasResult && isFullscreen && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[220] flex flex-col bg-background/95 p-6 backdrop-blur-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between text-foreground">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5" />
                <span className="text-base font-medium">{resolvedTitle}</span>
                {headerSubtitle && (
                  <span className="text-sm text-text-muted">{headerSubtitle}</span>
                )}
                <span className="text-sm text-text-muted">共 {rows.length} 个分镜</span>
              </div>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded border border-border bg-muted px-3 text-sm text-foreground hover:border-foreground/30"
                onClick={() => setIsFullscreen(false)}
              >
                <X className="h-4 w-4" />
                关闭
              </button>
            </div>
            <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card/95">
              <ScriptResultTable rows={rows} onCellCommit={handleCellCommit} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});

ScriptNode.displayName = 'ScriptNode';

function promptHasContent(data: ScriptNodeData): boolean {
  return typeof data.prompt === 'string' && data.prompt.trim().length > 0;
}

interface ScriptResultHeaderProps {
  title: string;
  onFullscreen: () => void;
}

function ScriptResultHeader({ title, onFullscreen }: ScriptResultHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-medium text-foreground">
          {title || '分镜脚本'}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* 「脚本视图」目前只有一种视图，先放占位下拉，后续接其它视图（卡片视图等）。 */}
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded border border-border bg-muted px-2 text-[11px] text-foreground hover:border-foreground/30"
          onClick={(event) => event.stopPropagation()}
        >
          脚本视图
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded border border-border bg-muted px-2 text-[11px] text-foreground hover:border-foreground/30"
          onClick={(event) => {
            event.stopPropagation();
            onFullscreen();
          }}
        >
          <Expand className="h-3 w-3" />
          全屏
        </button>
      </div>
    </div>
  );
}

interface ScriptResultTableProps {
  rows: CanvasStoryScriptRow[];
  onCellCommit?: (rowIndex: number, colKey: string, nextValue: string) => void;
}

// 镜号 / 时长这类短数字列居中、等宽数字，便于扫读。
const NUMERIC_COLUMN_KEYS = new Set(['shot_no', 'duration']);
// 单格内容过多时在格内出现滚动条，避免把整行撑得很高。
const CELL_MAX_HEIGHT_PX = 196;

function ScriptResultTable({ rows, onCellCommit }: ScriptResultTableProps) {
  return (
    <div className="ui-scrollbar h-full w-full overflow-auto rounded-lg border border-border bg-background">
      <table
        className="border-collapse text-left text-[12px] text-foreground"
        style={{ minWidth: SCRIPT_TABLE_MIN_WIDTH, tableLayout: 'fixed' }}
      >
        <thead className="sticky top-0 z-10">
          <tr>
            {SCRIPT_COLUMNS.map((col) => (
              <th
                key={col.key}
                style={{ width: col.widthPx, minWidth: col.widthPx }}
                className={`border-b border-r border-border bg-muted px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur last:border-r-0 ${
                  NUMERIC_COLUMN_KEYS.has(col.key) ? 'text-center' : ''
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className={`align-top transition-colors hover:bg-primary/5 ${
                idx % 2 === 1 ? 'bg-muted' : ''
              }`}
            >
              {SCRIPT_COLUMNS.map((col) => {
                const numeric = NUMERIC_COLUMN_KEYS.has(col.key);
                return (
                  <td
                    key={col.key}
                    style={{ width: col.widthPx, minWidth: col.widthPx }}
                    className={`border-b border-r border-border px-3 py-2 align-top last:border-r-0 ${
                      numeric ? 'text-center tabular-nums text-foreground/90' : ''
                    }`}
                  >
                    <div
                      className="ui-scrollbar nowheel overflow-y-auto overflow-x-hidden"
                      style={{ maxHeight: CELL_MAX_HEIGHT_PX }}
                    >
                      <ScriptResultCell
                        row={row}
                        col={col}
                        onCommit={
                          onCellCommit
                            ? (next) => onCellCommit(idx, col.key, next)
                            : undefined
                        }
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ScriptResultCellProps {
  row: CanvasStoryScriptRow;
  col: ScriptColumnDef;
  onCommit?: (nextValue: string) => void;
}

function ScriptResultCell({ row, col, onCommit }: ScriptResultCellProps) {
  const raw = row[col.key];

  if (col.render === 'image') {
    // 图片列暂不支持 inline 编辑 —— 替换图需要走文件选择器 / URL 输入，
    // 是另一条交互，等用户后续提。
    // 角色图/参考是后端占位字符串字段：模型经常写入 `无` 之类的非 URL 文本，
    // 只有真正的图片来源才渲染 <img>，否则一律回退到空占位（避免 404 裂图）。
    const url =
      typeof raw === 'string' && isRenderableImageSrc(raw) ? raw : null;
    if (!url) {
      return (
        <div className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-border bg-muted text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
        </div>
      );
    }
    return (
      <img
        src={resolveImageDisplayUrl(url)}
        alt=""
        className="h-14 w-14 rounded border border-border object-cover"
        draggable={false}
      />
    );
  }

  const initialText =
    raw == null
      ? ''
      : typeof raw === 'string' || typeof raw === 'number'
        ? String(raw)
        : JSON.stringify(raw);

  if (!onCommit) {
    // 没传 onCommit 视为只读，保留旧渲染。
    if (initialText.length === 0) {
      return <span className="text-text-muted">-</span>;
    }
    return (
      <span className="block whitespace-pre-wrap break-words leading-snug">{initialText}</span>
    );
  }

  return <EditableTableCell value={initialText} onCommit={onCommit} />;
}

interface ScriptOperationsPanelProps {
  nodeId: string;
  data: ScriptNodeData;
  references: ScriptReference[];
  /** 与节点本体「重试」共用的提交实例 + 历史（见 ScriptNode 里的 hook 调用）。 */
  onSubmit: () => Promise<void>;
  isGenerating: boolean;
  historyRecords: CanvasGenerationHistoryRecord[];
  historyLoading: boolean;
  refreshHistory: () => Promise<void>;
}

function ScriptOperationsPanel({
  nodeId,
  data,
  references,
  onSubmit,
  isGenerating,
  historyRecords,
  historyLoading,
  refreshHistory,
}: ScriptOperationsPanelProps) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [isTranslating, setIsTranslating] = useState(false);
  // 收起态是节点下方的浮动面板；点右上角「放大」后改为居中弹窗展示同一份内容。
  const [panelExpanded, setPanelExpanded] = useState(false);
  const scriptCost = useGenerationCreditCost('freezone_story_script');

  const handleRestoreHistory = useCallback(
    (record: CanvasGenerationHistoryRecord) => {
      // Only story-script records carry a usable `{ title, rows }` payload.
      if (!isScriptResult(record.result)) return;
      updateNodeData(nodeId, {
        scriptResult: record.result,
        scriptTitle: record.result.title ?? null,
        isGenerating: false,
        generationStartedAt: null,
      });
    },
    [nodeId, updateNodeData],
  );

  const prompt = typeof data.prompt === 'string' ? data.prompt : '';

  const handleTranslate = useCallback(async () => {
    if (isGenerating || isTranslating) return;
    if (prompt.trim().length === 0) return;
    const project = readUrl().project;
    if (!project) {
      console.error('[script-node] translate: no project in URL');
      return;
    }
    setIsTranslating(true);
    try {
      const result = await translateCanvasText({
        projectId: project,
        text: prompt,
        nodeType: 'text',
        canvasId: readUrl().canvas ?? 'default',
        nodeId,
      });
      updateNodeData(nodeId, { prompt: result.translatedText });
    } catch (error) {
      console.error('[script-node] translate failed', error);
    } finally {
      setIsTranslating(false);
    }
  }, [isGenerating, isTranslating, nodeId, prompt, updateNodeData]);

  // 文本 / 视频 / 角色图任一有内容即可提交（与 useScriptStorySubmit 的分流一致）。
  const hasContent =
    prompt.trim().length > 0 ||
    references.some(
      (ref) =>
        (ref.kind === 'text' && (ref.text ?? '').trim().length > 0) ||
        (ref.kind === 'video' && Boolean(ref.videoUrl)) ||
        (ref.kind === 'image' && Boolean(ref.thumbUrl)),
    );
  const submitDisabled = isGenerating || !hasContent;

  return (
    <OperationPanelShell
      expanded={panelExpanded}
      onCollapse={() => setPanelExpanded(false)}
      inlineClassName={`nodrag absolute z-10 flex flex-col rounded-[var(--node-radius)] border ${CANVAS_NODE_INPUT_SURFACE_CLASS} ${CANVAS_NODE_INPUT_FRAME_CLASS}`}
      inlineStyle={{
        top: `calc(100% + ${PANEL_GAP_PX}px)`,
        left: -PANEL_OVERHANG_PX,
        right: -PANEL_OVERHANG_PX,
      }}
      modalStyle={{
        width: `min(${OPS_PANEL_EXPANDED_WIDTH}px, 92vw)`,
        height: `min(${OPS_PANEL_EXPANDED_HEIGHT}px, 86vh)`,
      }}
    >
      <PanelExpandButton
        expanded={panelExpanded}
        onToggle={() => setPanelExpanded((v) => !v)}
        className="absolute right-2 top-2 z-20"
      />
      {references.length > 0 && (
        <div className="px-3 pr-10 pt-3">
          <ScriptReferencesRow references={references} />
        </div>
      )}

      <div className={`px-3 pt-3 ${panelExpanded ? 'flex-1 overflow-hidden' : ''}`}>
        <textarea
          value={prompt}
          onChange={(event) => updateNodeData(nodeId, { prompt: event.target.value })}
          placeholder="描述剧情或添加角色参考、视频参考等，为你生成分镜脚本"
          rows={3}
          className={`nodrag nowheel ui-scrollbar w-full resize-none bg-transparent text-[14px] leading-[1.6] text-text-dark outline-none ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS} ${panelExpanded ? 'h-full' : 'min-h-[72px]'}`}
          disabled={isGenerating}
        />
      </div>

      {data.generationError && !isGenerating && (
        <div className="break-words px-3 pb-1 text-[11px] text-destructive [overflow-wrap:anywhere]">{data.generationError}</div>
      )}

      <div className="flex shrink-0 items-center justify-end gap-2 px-3 pb-3 pt-1">
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            title="翻译（中英文互译）"
            onClick={handleTranslate}
            disabled={isGenerating || isTranslating || prompt.trim().length === 0}
            active={isTranslating}
          >
            {isTranslating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Languages className="h-4 w-4" />
            )}
          </IconButton>
          <CreditCostPill
            display={scriptCost.data?.data.display}
            disabled={submitDisabled}
            className={NODE_CREDIT_PILL_FLAT_CLASS}
          />
          <button
            type="button"
            disabled={submitDisabled}
            title="生成"
            onClick={() => void onSubmit()}
            className={`${NODE_GENERATE_BUTTON_BASE_CLASS} ${
              submitDisabled
                ? NODE_GENERATE_BUTTON_DISABLED_CLASS
                : NODE_GENERATE_BUTTON_ENABLED_CLASS
            }`}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {hasCompletedHistoryRecords(historyRecords) && (
        <div className="border-t border-border px-3 py-2">
          <NodeGenerationHistory
            records={historyRecords}
            isLoading={historyLoading}
            onRestore={handleRestoreHistory}
            onRefresh={() => void refreshHistory()}
            isActive={(record) => {
              if (!isScriptResult(record.result) || !isScriptResult(data.scriptResult)) {
                return false;
              }
              return JSON.stringify(record.result) === JSON.stringify(data.scriptResult);
            }}
          />
        </div>
      )}
    </OperationPanelShell>
  );
}

interface ScriptReferencesRowProps {
  references: ScriptReference[];
}

function ScriptReferencesRow({ references }: ScriptReferencesRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {references.map((ref, index) => (
        <ScriptReferenceChip key={ref.nodeId} reference={ref} index={index} />
      ))}
    </div>
  );
}

interface ScriptReferenceChipProps {
  reference: ScriptReference;
  index: number;
}

function ScriptReferenceChip({ reference, index }: ScriptReferenceChipProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [previewPos, setPreviewPos] = useState<{ left: number; top: number } | null>(null);
  const PREVIEW_W = 240;
  const PREVIEW_OFFSET = 10;

  // 仅 image / video 有可视预览；text / audio chip 不弹大图。
  const hasPreview =
    (reference.kind === 'image' && Boolean(reference.thumbUrl)) ||
    (reference.kind === 'video' && Boolean(reference.videoUrl || reference.thumbUrl));

  const showPreview = useCallback(() => {
    if (!hasPreview) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(
      8,
      Math.min(window.innerWidth - PREVIEW_W - 8, rect.left + rect.width / 2 - PREVIEW_W / 2),
    );
    const top = rect.top - PREVIEW_OFFSET;
    setPreviewPos({ left, top });
  }, [hasPreview]);

  const hidePreview = useCallback(() => {
    setPreviewPos(null);
  }, []);

  const titleText = reference.displayName?.trim()
    ? reference.displayName.trim()
    : `引用 ${index + 1}`;

  // chip 视觉：image 用缩略图，video 用首帧（fallback 视频元素），text 用 T 字标，audio 用 A。
  const chipBody = (() => {
    if (reference.kind === 'image' && reference.thumbUrl) {
      return (
        <img
          src={resolveImageDisplayUrl(reference.thumbUrl)}
          alt={titleText}
          className="h-full w-full object-cover"
        />
      );
    }
    if (reference.kind === 'video') {
      if (reference.thumbUrl) {
        return (
          <img
            src={resolveImageDisplayUrl(reference.thumbUrl)}
            alt={titleText}
            className="h-full w-full object-cover"
          />
        );
      }
      if (reference.videoUrl) {
        return (
          <video
            src={resolveImageDisplayUrl(reference.videoUrl)}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        );
      }
      return <Video className="h-4 w-4 text-text-muted" />;
    }
    if (reference.kind === 'text') {
      return <span className="text-[11px] font-semibold text-text-muted">T</span>;
    }
    return <span className="text-[11px] text-text-muted">A</span>;
  })();

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={showPreview}
        onMouseLeave={hidePreview}
        className="nodrag relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-border bg-muted transition-colors hover:border-foreground/30"
        title={titleText}
      >
        {chipBody}
        <span className="absolute right-1 top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-media/30 px-0.5 text-[9px] font-medium leading-none text-media-foreground/90 backdrop-blur-sm">
          {index + 1}
        </span>
      </button>
      {previewPos &&
        hasPreview &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[400] -translate-y-full"
            style={{ left: previewPos.left, top: previewPos.top, width: PREVIEW_W }}
          >
            <div className="overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl backdrop-blur-sm">
              {reference.kind === 'video' && reference.videoUrl ? (
                <video
                  src={resolveImageDisplayUrl(reference.videoUrl)}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="block h-auto w-full object-contain"
                />
              ) : reference.thumbUrl ? (
                <img
                  src={resolveImageDisplayUrl(reference.thumbUrl)}
                  alt={titleText}
                  className="block h-auto w-full object-contain"
                  draggable={false}
                />
              ) : null}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

interface IconButtonProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

function IconButton({ title, onClick, disabled, active, children }: IconButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${NODE_INLINE_ICON_BUTTON_CLASS} ${
        active ? NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS : ''
      }`}
    >
      {children}
    </button>
  );
}
