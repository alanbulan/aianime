// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SkillDefinition } from '@/modules/creative_canvas/public';

import {
  useCanvasNodeCreationSurfaceController,
  type CanvasNodeCreationSurfaceControllerOptions,
} from './useCanvasNodeCreationSurfaceController';

const controllerMocks = vi.hoisted(() => {
  const menuPosition = { x: 10, y: 20 };
  const nodeMenu = {
    showNodeMenu: true,
    menuPosition,
    flowPosition: { x: 30, y: 40 },
    menuAllowedTypes: undefined,
    pendingConnectStart: null,
    pendingBatchConnectIds: null,
    previewConnectionVisual: null,
    handleMarqueeStart: vi.fn(),
    prepareBatchConnectionDrag: vi.fn(),
    dismissNodeMenuForPaneClick: vi.fn(),
    updateConnectionPreview: vi.fn(),
    prepareConnectionStart: vi.fn(),
    clearConnection: vi.fn(),
    openConnectionMenu: vi.fn(),
    openBatchConnectionMenu: vi.fn(),
    openPlainNodeMenu: vi.fn(),
    closeNodeMenu: vi.fn(),
    hideNodeMenuForPlacement: vi.fn(),
  };
  const skill = { id: 'freezone.test' } as SkillDefinition;
  const nodeCatalog = {
    skills: [skill],
    skillById: new Map([[skill.id, skill]]),
    resolvePlacementLabel: vi.fn(() => 'Upload'),
  };
  const connection = {
    connectGraphNodes: vi.fn(),
    connectManualGraphNodes: vi.fn(),
    bindSingleBeatContextInput: vi.fn(),
    connectSpawnedNode: vi.fn(),
    isValidGraphConnection: vi.fn(() => true),
  };
  const nodeInteraction = {
    placementActive: false,
    placementPreview: null,
    cancelNodePlacement: vi.fn(),
    openNodeMenuAtClientPosition: vi.fn(),
    handlePaneClick: vi.fn(),
    suppressNextPaneClick: vi.fn(),
    handleCanvasPointerMove: vi.fn(),
    getPreferredCanvasPointerPosition: vi.fn(),
    handleNodeClick: vi.fn(),
    selectNodeType: vi.fn(),
    selectSkill: vi.fn(),
    getViewportCenter: vi.fn(),
    quickAddNode: vi.fn(),
    quickAddSkill: vi.fn(),
  };
  return {
    nodeMenu,
    nodeCatalog,
    connection,
    nodeInteraction,
    useNodeMenu: vi.fn(() => nodeMenu),
    useNodeCatalog: vi.fn(() => nodeCatalog),
    useConnection: vi.fn(() => connection),
    useNodeInteraction: vi.fn(() => nodeInteraction),
  };
});

vi.mock('@/modules/creative_canvas/public', () => ({
  useCanvasNodeMenuStateController: controllerMocks.useNodeMenu,
  useCanvasNodeCatalogController: controllerMocks.useNodeCatalog,
}));
vi.mock('./useCanvasConnectionController', () => ({
  useCanvasConnectionController: controllerMocks.useConnection,
}));
vi.mock('./useCanvasNodeInteractionController', () => ({
  useCanvasNodeInteractionController: controllerMocks.useNodeInteraction,
}));

function createOptions(): CanvasNodeCreationSurfaceControllerOptions {
  return {
    translate: vi.fn() as unknown as
      CanvasNodeCreationSurfaceControllerOptions['translate'],
    wrapperRef: { current: document.createElement('div') },
    nodes: [],
    screenToFlowPosition: vi.fn((position) => position),
    createNode: vi.fn(() => 'node-1'),
    selectNode: vi.fn(),
    confirmPlacement: vi.fn(),
    onBlankPaneClick: vi.fn(),
    centerViewport: vi.fn(),
    getGraph: vi.fn(() => ({ nodes: [], edges: [] })),
    connectRegular: vi.fn(),
    replaceEdges: vi.fn(),
  };
}

describe('useCanvasNodeCreationSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shares catalog, connection and menu dependencies internally', () => {
    const options = createOptions();
    renderHook(() => useCanvasNodeCreationSurfaceController(options));

    expect(controllerMocks.useNodeCatalog).toHaveBeenCalledWith({
      translate: options.translate,
      loadSkillRegistry: expect.any(Function),
      resolveNodeTypeLabel: expect.any(Function),
    });
    expect(controllerMocks.useConnection).toHaveBeenCalledWith({
      getGraph: options.getGraph,
      connectRegular: options.connectRegular,
      replaceEdges: options.replaceEdges,
      skillById: controllerMocks.nodeCatalog.skillById,
    });
    expect(controllerMocks.useNodeInteraction).toHaveBeenCalledWith({
      wrapperRef: options.wrapperRef,
      nodes: options.nodes,
      screenToFlowPosition: options.screenToFlowPosition,
      createNode: options.createNode,
      selectNode: options.selectNode,
      bindSkill: controllerMocks.connection.bindSingleBeatContextInput,
      confirmPlacement: options.confirmPlacement,
      resolvePlacementLabel:
        controllerMocks.nodeCatalog.resolvePlacementLabel,
      openPlainNodeMenu: controllerMocks.nodeMenu.openPlainNodeMenu,
      dismissNodeMenu: controllerMocks.nodeMenu.dismissNodeMenuForPaneClick,
      onBlankPaneClick: options.onBlankPaneClick,
      centerViewport: options.centerViewport,
      flowPosition: controllerMocks.nodeMenu.flowPosition,
      menuPosition: controllerMocks.nodeMenu.menuPosition,
      menuAllowedTypes: controllerMocks.nodeMenu.menuAllowedTypes,
      pendingConnection: controllerMocks.nodeMenu.pendingConnectStart,
      pendingBatchSourceIds: controllerMocks.nodeMenu.pendingBatchConnectIds,
      connectSpawnedNode: controllerMocks.connection.connectSpawnedNode,
      hideMenuForPlacement:
        controllerMocks.nodeMenu.hideNodeMenuForPlacement,
      closeNodeMenu: controllerMocks.nodeMenu.closeNodeMenu,
    });
  });

  it('exposes only the node-creation surface contract', () => {
    const { result } = renderHook(() =>
      useCanvasNodeCreationSurfaceController(createOptions()),
    );

    expect(result.current.skills).toBe(controllerMocks.nodeCatalog.skills);
    expect(result.current.showNodeMenu).toBe(true);
    expect(result.current.connectGraphNodes).toBe(
      controllerMocks.connection.connectGraphNodes,
    );
    expect(result.current.handlePaneClick).toBe(
      controllerMocks.nodeInteraction.handlePaneClick,
    );
    expect(result.current).not.toHaveProperty('skillById');
    expect(result.current).not.toHaveProperty('resolvePlacementLabel');
    expect(result.current).not.toHaveProperty('bindSingleBeatContextInput');
    expect(result.current).not.toHaveProperty('connectSpawnedNode');
    expect(result.current).not.toHaveProperty('flowPosition');
    expect(result.current).not.toHaveProperty('openPlainNodeMenu');
    expect(result.current).not.toHaveProperty('pendingBatchConnectIds');
  });
});
