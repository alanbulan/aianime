// Copyright (c) 2026 AI anime
import type {
  PushResult,
  PushTarget,
  PushTargetKind,
} from "@/features/freezone/domain/assetCommit";
import type { DropMediaType } from "@/features/canvas/domain/assetDropInfo";

import { useCommitDialogSubmitController } from "../hooks/useCommitDialogSubmitController";
import { useCommitDialogTargetController } from "../hooks/useCommitDialogTargetController";
import { CommitDialogView } from "../presentation/CommitDialogView";

interface CommitDialogProps {
  project: string;
  /** Source media URL (must be /static/<u>/<p>/...). 图像/视频/音频/3GS。 */
  sourceUrl: string;
  /** Optional thumbnail for header preview. */
  previewUrl?: string | null;
  /** Optional human label from the canvas node; avoids exposing raw generated file names. */
  sourceLabelOverride?: string | null;
  /** 来源节点的媒体类型;决定预览方式与可选提交目标。默认 image。 */
  mediaType?: DropMediaType;
  /** Optional default target inferred from where the source came from. */
  defaultTarget?: Partial<PushTarget> & { kind: PushTargetKind };
  /** Complete director bundle, if this image is still the original Director render asset. */
  directorControlBundle?: Record<string, unknown> | null;
  /** Canvas node state for structured commits that are not plain file replacements. */
  nodeData?: Record<string, unknown> | null;
  /** Reads the latest canvas node state at submit time. */
  getNodeData?: () => Record<string, unknown> | null | undefined;
  onClose: () => void;
  onSuccess: (
    message: string,
    result: PushResult,
    target: PushTarget,
    nodeDataPatch?: Record<string, unknown> | null,
  ) => void;
}

export function CommitDialog({
  project,
  sourceUrl,
  previewUrl,
  sourceLabelOverride,
  mediaType = "image",
  defaultTarget,
  directorControlBundle,
  nodeData,
  getNodeData,
  onClose,
  onSuccess,
}: CommitDialogProps) {
  const targetController = useCommitDialogTargetController({
    project,
    sourceUrl,
    mediaType,
    defaultTarget,
    nodeData,
  });
  const submitController = useCommitDialogSubmitController({
    project,
    sourceUrl,
    previewUrl,
    mediaType,
    target: targetController.target,
    modelSlotKinds: targetController.modelSlotKinds,
    noTargetYet: targetController.noTargetYet,
    isGlobalSlot: targetController.isGlobalSlot,
    markStale: targetController.markStale,
    directorControlBundle,
    nodeData,
    getNodeData,
    setError: targetController.setError,
    onClose,
    onSuccess,
  });

  return (
    <CommitDialogView
      project={project}
      sourceUrl={sourceUrl}
      previewUrl={previewUrl}
      sourceLabelOverride={sourceLabelOverride}
      mediaType={mediaType}
      nodeData={nodeData}
      targetState={targetController}
      submission={submitController}
      onClose={onClose}
    />
  );
}
