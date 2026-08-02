// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
  type ScriptNodeData,
} from '@/features/canvas/domain/canvasNodes';
import type { CanvasStoryScriptResult } from '@/modules/creative_canvas/public';

import {
  hasScriptGenerationSource,
  hasScriptReferencePreview,
  resolveScriptNodeReferences,
  resolveScriptNodeResult,
  resolveScriptNodeSize,
  resolveScriptNodeSpawnPlan,
  scriptPromptHasContent,
  updateScriptResultCell,
} from './scriptNodeModel';

function node({
  id,
  type,
  x = 0,
  y = 0,
  width,
  height,
  data = {},
}: {
  id: string;
  type: CanvasNode['type'];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  data?: Record<string, unknown>;
}): CanvasNode {
  return {
    id,
    type,
    position: { x, y },
    width,
    height,
    data,
  } as CanvasNode;
}

describe('scriptNodeModel', () => {
  it('projects result-aware node size and validates script results', () => {
    expect(resolveScriptNodeSize(false)).toEqual({ width: 480, height: 320 });
    expect(resolveScriptNodeSize(true)).toEqual({ width: 800, height: 400 });
    expect(resolveScriptNodeSize(true, 300.6, 199.5)).toEqual({
      width: 360,
      height: 240,
    });
    expect(resolveScriptNodeResult({ title: '第一集', rows: [] })).toEqual({
      title: '第一集',
      rows: [],
    });
    expect(resolveScriptNodeResult({ rows: null })).toBeNull();
  });

  it('updates only changed table cells without mutating the previous result', () => {
    const result: CanvasStoryScriptResult = {
      title: '第一集',
      rows: [{ shot_no: 1, dialogue: '原对白' }],
    };
    const updated = updateScriptResultCell(result, 0, 'dialogue', '新对白');

    expect(updated).toEqual({
      title: '第一集',
      rows: [{ shot_no: 1, dialogue: '新对白' }],
    });
    expect(updated).not.toBe(result);
    expect(result.rows[0].dialogue).toBe('原对白');
    expect(updateScriptResultCell(result, 0, 'dialogue', '原对白')).toBeNull();
    expect(updateScriptResultCell(result, 3, 'dialogue', '无效')).toBeNull();
  });

  it('orders supported references and preserves generation-source rules', () => {
    const references = resolveScriptNodeReferences([
      node({
        id: 'video-a',
        type: CANVAS_NODE_TYPES.video,
        y: 200,
        data: { videoUrl: '/video.mp4' },
      }),
      node({
        id: 'text-a',
        type: CANVAS_NODE_TYPES.textAnnotation,
        y: 50,
        data: { content: '剧情正文' },
      }),
      node({ id: 'script-a', type: CANVAS_NODE_TYPES.script, y: 0 }),
    ]);

    expect(references.map((reference) => reference.nodeId)).toEqual([
      'text-a',
      'video-a',
    ]);
    expect(references).toEqual([
      {
        nodeId: 'text-a',
        kind: 'text',
        text: '剧情正文',
        displayName: null,
      },
      {
        nodeId: 'video-a',
        kind: 'video',
        thumbUrl: null,
        videoUrl: '/video.mp4',
        durationSec: null,
        displayName: null,
      },
    ]);
    expect(hasScriptGenerationSource('', references)).toBe(true);
    expect(hasScriptGenerationSource(' 本地剧情 ', [])).toBe(true);
    expect(hasScriptGenerationSource('', [{ nodeId: 'audio-a', kind: 'audio' }])).toBe(false);
    expect(scriptPromptHasContent({ prompt: ' 内容 ' } as ScriptNodeData)).toBe(true);
    expect(scriptPromptHasContent({ prompt: ' ' } as ScriptNodeData)).toBe(false);
    expect(
      hasScriptReferencePreview({
        nodeId: 'video-a',
        kind: 'video',
        videoUrl: '/video.mp4',
      }),
    ).toBe(true);
  });

  it('places text and video references to the left of the script node', () => {
    const self = node({
      id: 'script-a',
      type: CANVAS_NODE_TYPES.script,
      x: 1000,
      y: 200,
      height: 400,
    });
    expect(
      resolveScriptNodeSpawnPlan({
        action: 'fromScript',
        self,
        nodes: [self],
        edges: [],
        fallbackHeight: 320,
      }),
    ).toEqual({
      groupLabel: '剧本生成分镜脚本组',
      items: [
        {
          type: CANVAS_NODE_TYPES.textAnnotation,
          position: { x: 520, y: 240 },
          data: { referenceOnly: true, displayName: '剧本' },
        },
      ],
    });
    expect(
      resolveScriptNodeSpawnPlan({
        action: 'fromVideoRef',
        self,
        nodes: [self],
        edges: [],
        fallbackHeight: 320,
      }).items[0],
    ).toEqual({
      type: CANVAS_NODE_TYPES.video,
      position: { x: 380, y: 210 },
      data: { referenceOnly: true },
    });
  });

  it('stacks character uploads below occupied upstream slots', () => {
    const self = node({
      id: 'script-a',
      type: CANVAS_NODE_TYPES.script,
      x: 1000,
      y: 200,
      height: 400,
    });
    const existing = node({
      id: 'upload-existing',
      type: CANVAS_NODE_TYPES.upload,
      x: 640,
      y: 220,
      width: 320,
      height: 350,
    });
    const edges: CanvasEdge[] = [
      { id: 'edge-a', source: existing.id, target: self.id } as CanvasEdge,
    ];
    const plan = resolveScriptNodeSpawnPlan({
      action: 'fromCharacter',
      self,
      nodes: [self, existing],
      edges,
      fallbackHeight: 320,
    });

    expect(plan.groupLabel).toBe('角色生成分镜脚本组');
    expect(plan.items).toEqual([
      {
        type: CANVAS_NODE_TYPES.upload,
        position: { x: 640, y: 594 },
        data: { displayName: '角色 1' },
      },
      {
        type: CANVAS_NODE_TYPES.upload,
        position: { x: 640, y: 968 },
        data: { displayName: '角色 2' },
      },
    ]);
  });
});
