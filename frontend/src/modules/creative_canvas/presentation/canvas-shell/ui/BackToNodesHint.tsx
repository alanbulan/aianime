// Copyright (c) 2026 AI anime
import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import {
  BackToNodesHintView,
  getTopLevelCanvasBounds,
  hasVisibleTopLevelCanvasNode,
} from '@/modules/creative_canvas/public';


import { useCanvasStore } from "@/modules/creative_canvas/public";
/** 「回到节点」时的固定缩放比例（10%）。 */
const BACK_TO_NODES_ZOOM = 0.1;

/**
 * 画布拖到空白区域（当前视口内一个节点都看不到）时，底部浮出的提示条 +
 * 「回到节点」按钮。点击后视口移动到所有节点包围盒的中心，缩放固定为 10%，
 * 让用户一眼看到全部内容的分布。
 *
 * 只检查顶层节点（组的边界会包住成员；子节点的 position 是组内相对坐标，
 * 不能直接和视口比较）。空画布不显示——那是 empty hint 的职责。
 */
export function BackToNodesHint() {
  const { t } = useTranslation();
  const reactFlow = useReactFlow();

  const anyNodeVisible = useCanvasStore((state) => {
    const { width, height } = state.canvasViewportSize;
    if (width <= 0 || height <= 0) return true; // 视口尺寸未知时不打扰
    const bounds = getTopLevelCanvasBounds(state.nodes);
    return bounds
      ? hasVisibleTopLevelCanvasNode(
          state.nodes,
          state.currentViewport,
          { width, height },
        )
      : true;
  });

  const handleBackToNodes = useCallback(() => {
    const bounds = getTopLevelCanvasBounds(useCanvasStore.getState().nodes);
    if (!bounds) return;
    reactFlow.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {
      zoom: BACK_TO_NODES_ZOOM,
      duration: 320,
    });
  }, [reactFlow]);

  return (
    <BackToNodesHintView
      visible={!anyNodeVisible}
      hint={t('canvas.backToNodes.hint')}
      buttonLabel={t('canvas.backToNodes.button')}
      onBackToNodes={handleBackToNodes}
    />
  );
}
