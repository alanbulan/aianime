// Copyright (c) 2026 AI anime
import { migrateCanvasClipboardAssets } from './application/canvasClipboardAssetMigration';
import { createCanvasClipboardSession } from './application/canvasClipboardSession';
import { platformCanvasAssetGateway } from './assetTransferComposition';
import { clearBrowserClipboard } from './infrastructure/browserClipboardGateway';
import {
  createUseCanvasClipboardController,
  type CanvasClipboardControllerEdge,
  type CanvasClipboardControllerPorts,
} from './presentation/useCanvasClipboardController';
import type { CanvasClipboardSelectableNode } from './presentation/useCanvasClipboardDuplicationController';

export function createCanvasClipboardControllerHook<
  TNode extends CanvasClipboardSelectableNode<TNodeData>,
  TEdge extends CanvasClipboardControllerEdge,
  TNodeType,
  TNodeData extends object,
>(ports: CanvasClipboardControllerPorts<TNode, TEdge, TNodeType, TNodeData>) {
  const session = createCanvasClipboardSession<TNode, TEdge>();

  return createUseCanvasClipboardController(ports, {
    session,
    migrateAssets: (params) => migrateCanvasClipboardAssets(
      platformCanvasAssetGateway,
      {
        ...params,
        currentOrigin: window.location.origin,
      },
    ),
    clearSystemClipboard: clearBrowserClipboard,
    reportMigrationError: (error) => {
      console.warn('[canvas] cross-project asset migration failed', error);
    },
  });
}
