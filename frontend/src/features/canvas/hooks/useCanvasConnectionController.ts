// Copyright (c) 2026 AI anime
import { useCallback } from 'react';
import type { Connection, Edge } from '@xyflow/react';

import type { SkillDefinition } from '@/features/freezone/context/skillRoles';

import {
  planCanvasGraphConnection,
  planSingleBeatContextBinding,
} from '../application/canvasEdgeCreation';
import {
  canNodeBeManualConnectionSource,
  validateCanvasConnection,
} from '../domain/canvasConnection';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';

export interface CanvasGraphSnapshot {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
}

export interface CanvasConnectionControllerOptions {
  getGraph: () => CanvasGraphSnapshot;
  connectRegular: (connection: Connection) => void;
  replaceEdges: (edges: CanvasEdge[]) => void;
  skillById: ReadonlyMap<string, SkillDefinition>;
  reportMissingSkill?: (skillId: string, skillNodeId: string) => void;
}

export interface CanvasConnectionController {
  connectGraphNodes: (
    connection: Connection,
    explicitSkill?: SkillDefinition | null,
  ) => void;
  connectManualGraphNodes: (connection: Connection) => void;
  bindSingleBeatContextInput: (
    skillNodeId: string,
    skill: SkillDefinition,
  ) => void;
  isValidGraphConnection: (connection: Connection | Edge) => boolean;
}

function reportMissingCanvasSkill(skillId: string, skillNodeId: string): void {
  console.warn('[SkillNode] rejected role binding before skill registry loaded', {
    skillId,
    target: skillNodeId,
  });
}

export function useCanvasConnectionController({
  getGraph,
  connectRegular,
  replaceEdges,
  skillById,
  reportMissingSkill = reportMissingCanvasSkill,
}: CanvasConnectionControllerOptions): CanvasConnectionController {
  const connectGraphNodes = useCallback(
    (connection: Connection, explicitSkill?: SkillDefinition | null): void => {
      const graph = getGraph();
      const plan = planCanvasGraphConnection({
        ...graph,
        connection,
        skillById,
        explicitSkill,
      });
      if (plan.kind === 'regular') {
        connectRegular(connection);
        return;
      }
      if (plan.kind === 'skill_registry_unavailable') {
        reportMissingSkill(plan.skillId, plan.skillNodeId);
        return;
      }
      if (plan.edges !== graph.edges) {
        replaceEdges(plan.edges);
      }
    },
    [connectRegular, getGraph, replaceEdges, reportMissingSkill, skillById],
  );

  const connectManualGraphNodes = useCallback(
    (connection: Connection): void => {
      const { nodes } = getGraph();
      if (!canNodeBeManualConnectionSource(connection.source, nodes, connection.target)) {
        return;
      }
      connectGraphNodes(connection);
    },
    [connectGraphNodes, getGraph],
  );

  const bindSingleBeatContextInput = useCallback(
    (skillNodeId: string, skill: SkillDefinition): void => {
      const binding = planSingleBeatContextBinding(
        getGraph().nodes,
        skillNodeId,
        skill,
      );
      if (binding) {
        connectGraphNodes(binding, skill);
      }
    },
    [connectGraphNodes, getGraph],
  );

  const isValidGraphConnection = useCallback(
    (connection: Connection | Edge): boolean => {
      const graph = getGraph();
      return validateCanvasConnection(
        graph.nodes,
        graph.edges,
        connection,
        'react_flow',
      ).ok;
    },
    [getGraph],
  );

  return {
    connectGraphNodes,
    connectManualGraphNodes,
    bindSingleBeatContextInput,
    isValidGraphConnection,
  };
}
