// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Boxes, Camera, Crop, FileText, Loader2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  findSkillBoundEdges,
  isNoSkillReferenceEdge,
  isSkillReferenceInputRole,
  labelFromSkillReferenceHandle,
  nonEmptySkillHandleId,
  resolveSkillInputPreviewUrl,
  resolveSkillInputSourceLabel,
  SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS,
} from '@/features/canvas/application/skillNodeModel';
import type { CanvasEdge } from '@/features/canvas/domain/canvasNodes';
import type { SkillNodeController } from '@/features/canvas/hooks/useSkillNodeController';
import { ProviderModelPicker } from '@/features/canvas/ui/ProviderModelPicker';
import {
  BackgroundCropperDialog,
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/modules/creative_canvas/public';
import {
  NODE_INLINE_ERROR_MESSAGE_CLASS,
  translateSkillCardinality,
  translateSkillInputLabel,
  translateSkillOutputLabel,
  translateSkillParameterLabel,
  translateSkillParameterOption,
  translateSkillRequirement,
  type SkillProvider,
} from '@/modules/creative_canvas/public';
import { ThreeDDirectorDialog } from '@/features/viewer-kit/three-d/ThreeDDirectorDialog';

const PROVIDER_LABELS: Record<SkillProvider, string> = {
  freezone_mainline: '主线技能',
  agent: 'Agent 技能',
  tool: '工具技能',
  workflow: '工作流技能',
};
const EMPHASIZED_INPUT_ROLES = new Set<string>([
  'source_image',
  'scene_master',
  'scene_reverse_master',
  'background',
]);
const SKILL_INPUT_HANDLE_LEFT = -17;
const SKILL_ROW_INPUT_HANDLE_LEFT = -30;
const SKILL_CARD_CLASS =
  'rounded-[8px] border border-border bg-muted px-3 py-2';

function handleTop(index: number, count: number): string {
  return `${((index + 1) / (count + 1)) * 100}%`;
}

function SourceActionButton({
  icon,
  title,
  detail,
  disabled,
  onClick,
  className = '',
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`min-h-[58px] rounded-[8px] border border-border bg-muted px-3 py-2 text-left transition hover:border-foreground/25 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      disabled={disabled}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-text-muted">
        {detail}
      </div>
    </button>
  );
}

function SkillInputHandle({
  id,
  emphasized = false,
  leftOffset = SKILL_INPUT_HANDLE_LEFT,
}: {
  id: string;
  emphasized?: boolean;
  leftOffset?: number;
}) {
  const className = emphasized
    ? 'skill-node-input-handle !h-2.5 !w-2.5 !border-0 !bg-cyan-300'
    : 'skill-node-input-handle !h-2.5 !w-2.5 !border-0 !bg-cyan-300';

  return (
    <Handle
      type="target"
      position={Position.Left}
      id={id}
      className={className}
      style={{ left: leftOffset, top: '50%' }}
    />
  );
}

export function SkillNodeView({
  controller,
}: {
  controller: SkillNodeController;
}) {
  const { t } = useTranslation();
  const {
    data,
    resolvedWidth,
    skill,
    imageModels,
    parameterEntries,
    skillParameters,
    incomingEdges,
    nodeById,
    beatContextReferences,
    inputHandleIds,
    referenceInputHandlesByRole,
    outputHandleIds,
    beatTarget,
    ready,
    isBusy,
    submitLabel,
    isLoading,
    loadError,
    localizedSkillName,
    localizedSkillDescription,
    mainlineManaged,
    isSetSelectedBackgroundSkill,
    isSetDirectorCombinedSkill,
    directorEnvOnlyPreviewUrl,
    sourcePickerBusy,
    sourcePickerError,
    cropSource,
    directorStageOpen,
    directorStageManifest,
    directorWorldDestination,
    selectNode,
    changeParameter,
    pickFlatSource,
    openContextDirectorWorld,
    submit,
    closeCropSource,
    uploadAndStageSelectedBackground,
    clearSourcePickerError,
    setSourcePickerError,
    changeDirectorWorldOpen,
    captureDirectorWorld,
  } = controller;

  return (
    <div
      className="group relative w-full overflow-visible"
      style={{ width: resolvedWidth }}
      onClick={selectNode}
    >
      {outputHandleIds.map((handleId, index) => (
        <Handle
          key={handleId}
          type="source"
          position={Position.Right}
          id={handleId}
          className="!h-2.5 !w-2.5 !border-0 !bg-emerald-300"
          style={{ top: handleTop(index, outputHandleIds.length) }}
        />
      ))}
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Boxes className="h-4 w-4" />}
        titleText={localizedSkillName ?? data.displayName ?? '技能'}
        editable={false}
      />

      <div className="flex min-h-[240px] flex-col overflow-visible rounded-[var(--node-radius)] border border-primary/30 bg-card text-card-foreground shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {localizedSkillName ??
                  (isLoading ? '加载技能...' : '未知技能')}
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                {localizedSkillDescription ?? loadError ?? data.skill_id}
              </div>
            </div>
            <div className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
              {skill ? PROVIDER_LABELS[skill.provider] : 'skill'}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-xs text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            loading registry
          </div>
        ) : skill ? (
          <div className="flex flex-1 flex-col gap-3 p-4">
            {parameterEntries.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  {t('viewer.threeD.skillParametersTitle')}
                </div>
                {parameterEntries.map((entry) => {
                  const currentValue =
                    skillParameters[entry.key] ?? entry.value;
                  const parameterLabel = translateSkillParameterLabel(
                    skill.id,
                    entry.key,
                    entry.label,
                    t,
                  );
                  if (entry.type === 'image_model') {
                    const selectedApiModel = String(currentValue || '');
                    const selectedModel = imageModels.find(
                      (model) => model.apiModel === selectedApiModel,
                    ) ?? imageModels[0];
                    return (
                      <div key={entry.key} className={SKILL_CARD_CLASS}>
                        <div className="mb-2 text-xs font-medium text-foreground">
                          {parameterLabel}
                        </div>
                        <ProviderModelPicker
                          selectedModelId={selectedModel?.id ?? ''}
                          models={imageModels}
                          popoverPlacement="bottom"
                          onChange={(modelId) => {
                            const model = imageModels.find(
                              (candidate) => candidate.id === modelId,
                            );
                            changeParameter(entry.key, model?.apiModel ?? '');
                          }}
                        />
                      </div>
                    );
                  }
                  if (entry.type === 'boolean') {
                    const isSelected = currentValue === true;
                    return (
                      <div key={entry.key} className={SKILL_CARD_CLASS}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 text-xs font-medium text-foreground">
                            {parameterLabel}
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isSelected}
                            disabled={isBusy}
                            onClick={(event) => {
                              event.stopPropagation();
                              changeParameter(entry.key, !isSelected);
                            }}
                            className={[
                              'relative h-6 w-11 shrink-0 rounded-full border transition',
                              isSelected
                                ? 'border-primary bg-primary'
                                : 'border-border bg-muted hover:bg-accent',
                              isBusy ? 'cursor-not-allowed opacity-60' : '',
                            ].join(' ')}
                          >
                            <span
                              className={[
                                'absolute top-[3px] h-[18px] w-[18px] rounded-full bg-card shadow transition-transform',
                                isSelected
                                  ? 'translate-x-5'
                                  : 'translate-x-0.5',
                              ].join(' ')}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  }
                  const selectedValue = String(currentValue);
                  const optionColumnCount = Math.min(
                    Math.max(entry.options.length, 1),
                    4,
                  );
                  return (
                    <div key={entry.key} className={SKILL_CARD_CLASS}>
                      <div className="mb-2 text-xs font-medium text-foreground">
                        {parameterLabel}
                      </div>
                      <div
                        className="nodrag nopan grid gap-1 rounded-[6px] border border-border bg-muted p-1"
                        style={{
                          gridTemplateColumns: `repeat(${optionColumnCount}, minmax(0, 1fr))`,
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {entry.options.map((option) => {
                          const isSelected = selectedValue === option;
                          const optionLabel = translateSkillParameterOption(
                            skill.id,
                            entry.key,
                            option,
                            t,
                          );
                          return (
                            <button
                              key={option}
                              type="button"
                              disabled={isBusy}
                              onPointerDown={(event) =>
                                event.stopPropagation()
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                changeParameter(entry.key, option);
                              }}
                              className={[
                                'min-h-8 rounded-[5px] px-2 text-xs font-semibold transition active:scale-[0.99]',
                                isSelected
                                  ? 'bg-primary text-primary-foreground shadow-sm'
                                  : 'cursor-pointer text-muted-foreground hover:bg-card hover:text-foreground',
                                isBusy
                                  ? 'cursor-not-allowed opacity-60'
                                  : '',
                              ].join(' ')}
                            >
                              {optionLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Inputs
              </div>
              {skill.inputs.map((input) => {
                const boundEdges = findSkillBoundEdges(
                  incomingEdges,
                  input.role,
                ).filter(
                  (edge) => !isNoSkillReferenceEdge(edge, input.role),
                );
                const referenceHandles = isSkillReferenceInputRole(input.role)
                  ? referenceInputHandlesByRole[input.role]
                  : [];
                const usesRowHandles = referenceHandles.length > 0;
                const emphasizedInput = EMPHASIZED_INPUT_ROLES.has(input.role);
                const noReferenceLabel =
                  input.role === 'identity' &&
                  beatContextReferences.noCharacter
                    ? t('viewer.threeD.skillInputNoCharacter', {
                        defaultValue: '无角色',
                      })
                    : input.role === 'prop' && beatContextReferences.noProp
                      ? t('viewer.threeD.skillInputNoProp', {
                          defaultValue: '无道具',
                        })
                      : null;
                const renderBoundChip = (edge: CanvasEdge) => {
                  const sourceNode = nodeById.get(edge.source);
                  const previewUrl = resolveSkillInputPreviewUrl(sourceNode);
                  return (
                    <div
                      key={edge.id}
                      className="flex max-w-full items-center gap-2 text-xs text-foreground"
                    >
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-border bg-muted text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                        </div>
                      )}
                      <span className="truncate">
                        {resolveSkillInputSourceLabel(
                          sourceNode,
                          t('viewer.threeD.skillStatus.missingSource'),
                        )}
                      </span>
                    </div>
                  );
                };
                const renderAnchoredChipRow = (
                  edge: CanvasEdge,
                  forcedHandleId?: string,
                ) => {
                  const handleId =
                    forcedHandleId ??
                    (referenceHandles.length > 0
                      ? nonEmptySkillHandleId(edge.targetHandle)
                      : input.role);
                  return (
                    <div key={edge.id} className="relative flex max-w-full">
                      {usesRowHandles && handleId ? (
                        <SkillInputHandle
                          id={handleId}
                          leftOffset={SKILL_ROW_INPUT_HANDLE_LEFT}
                        />
                      ) : null}
                      {renderBoundChip(edge)}
                    </div>
                  );
                };
                const renderContextReferenceRow = (handleId: string) => (
                  <div key={handleId} className="relative flex max-w-full">
                    <SkillInputHandle
                      id={handleId}
                      leftOffset={SKILL_ROW_INPUT_HANDLE_LEFT}
                    />
                    <div className="flex max-w-full items-center gap-2 text-xs text-foreground">
                      <div className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-border bg-muted text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <span className="truncate">
                        {t('viewer.threeD.skillInputFromBeatContext')} ·{' '}
                        {labelFromSkillReferenceHandle(handleId)}
                      </span>
                    </div>
                  </div>
                );
                const renderReferenceRows = () => {
                  const renderedEdgeIds = new Set<string>();
                  const rows: ReactNode[] = referenceHandles.map(
                    (handleId) => {
                      const edge = boundEdges.find(
                        (candidate) =>
                          nonEmptySkillHandleId(candidate.targetHandle) ===
                          handleId,
                      );
                      if (edge) {
                        renderedEdgeIds.add(edge.id);
                        return renderAnchoredChipRow(edge, handleId);
                      }
                      return renderContextReferenceRow(handleId);
                    },
                  );
                  for (const edge of boundEdges) {
                    if (!renderedEdgeIds.has(edge.id)) {
                      rows.push(renderAnchoredChipRow(edge));
                    }
                  }
                  return rows;
                };
                return (
                  <div
                    key={input.role}
                    className={`relative ${SKILL_CARD_CLASS}`}
                  >
                    {!usesRowHandles ? (
                      <SkillInputHandle
                        id={input.role}
                        emphasized={emphasizedInput}
                      />
                    ) : null}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-foreground">
                        {translateSkillInputLabel(
                          input.role,
                          input.label,
                          t,
                        )}
                      </span>
                      <span
                        className={
                          input.required ? 'text-warning' : 'text-text-muted'
                        }
                      >
                        {translateSkillRequirement(input.required, t)} ·{' '}
                        {translateSkillCardinality(input.cardinality, t)}
                      </span>
                    </div>
                    <div
                      className={
                        referenceHandles.length > 0
                          ? 'mt-2 space-y-2'
                          : 'mt-2 flex flex-wrap gap-2'
                      }
                    >
                      {referenceHandles.length > 0 ? (
                        renderReferenceRows()
                      ) : boundEdges.length === 0 && noReferenceLabel ? (
                        <span className="text-xs text-text-muted">
                          {noReferenceLabel}
                        </span>
                      ) : boundEdges.length === 0 ? (
                        <span
                          className={`text-xs ${
                            emphasizedInput
                              ? 'text-primary'
                              : 'text-text-muted'
                          }`}
                        >
                          {t('viewer.threeD.skillInputUnbound')}
                          {emphasizedInput
                            ? ` · ${t('viewer.threeD.skillInputDragHint')}`
                            : null}
                        </span>
                      ) : (
                        boundEdges.map((edge) =>
                          renderAnchoredChipRow(edge),
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isSetSelectedBackgroundSkill && (
              <div className="rounded-[8px] border border-warning/30 bg-warning/10 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-warning">
                    {t('viewer.threeD.currentBackgroundSource')}
                  </div>
                  {sourcePickerBusy && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />
                  )}
                </div>
                <div className="mb-3 rounded-[8px] border border-border bg-muted p-2">
                  <div className="mb-1 text-[11px] text-text-muted">
                    {t('viewer.threeD.savedEnvOnlyBackground')}
                  </div>
                  {directorEnvOnlyPreviewUrl ? (
                    <img
                      src={directorEnvOnlyPreviewUrl}
                      alt=""
                      className="h-24 w-full rounded-[6px] object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-20 items-center justify-center rounded-[6px] bg-card text-xs text-muted-foreground">
                      {t('viewer.threeD.noEnvOnlyBackground')}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SourceActionButton
                    icon={<Crop className="h-3.5 w-3.5" />}
                    title={t('viewer.threeD.cropDirectorBackground')}
                    detail={t('viewer.threeD.cropDirectorBackgroundDetail', {
                      aspects:
                        SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS.join(' / '),
                    })}
                    disabled={!beatTarget || sourcePickerBusy}
                    onClick={() => void pickFlatSource('director_background')}
                  />
                  <SourceActionButton
                    icon={<Crop className="h-3.5 w-3.5" />}
                    title={t('viewer.threeD.cropMaster')}
                    detail={t('viewer.threeD.cropMasterDetail', {
                      aspects:
                        SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS.join(' / '),
                    })}
                    disabled={!beatTarget || sourcePickerBusy}
                    onClick={() => void pickFlatSource('master')}
                  />
                  <SourceActionButton
                    icon={<Crop className="h-3.5 w-3.5" />}
                    title={t('viewer.threeD.cropReverse')}
                    detail={t('viewer.threeD.cropReverseDetail', {
                      aspects:
                        SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS.join(' / '),
                    })}
                    disabled={!beatTarget || sourcePickerBusy}
                    onClick={() => void pickFlatSource('reverse')}
                  />
                </div>
                <div className="mt-2 text-[11px] leading-4 text-text-muted">
                  {t('viewer.threeD.selectedBackgroundSourceHint')}
                </div>
                {sourcePickerError && (
                  <div
                    className={`mt-2 max-h-24 overflow-y-auto ${NODE_INLINE_ERROR_MESSAGE_CLASS}`}
                  >
                    {sourcePickerError}
                  </div>
                )}
              </div>
            )}

            {isSetDirectorCombinedSkill && (
              <div className="rounded-[8px] border border-primary/30 bg-primary/10 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-primary">
                    {t('viewer.threeD.directorCombinedSourceTitle')}
                  </div>
                  {sourcePickerBusy && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  )}
                </div>
                <SourceActionButton
                  icon={<Camera className="h-3.5 w-3.5" />}
                  title={t('viewer.threeD.directorWorld')}
                  detail={t(
                    'viewer.threeD.directorCombinedDirectorWorldDetail',
                  )}
                  disabled={!beatTarget || sourcePickerBusy}
                  onClick={() =>
                    void openContextDirectorWorld('director_combined')
                  }
                  className="w-full"
                />
                <div className="mt-2 text-[11px] leading-4 text-text-muted">
                  {t('viewer.threeD.directorCombinedSourceHint')}
                </div>
                {sourcePickerError && (
                  <div
                    className={`mt-2 max-h-24 overflow-y-auto ${NODE_INLINE_ERROR_MESSAGE_CLASS}`}
                  >
                    {sourcePickerError}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                {t('viewer.threeD.skillStatus.outputs')}
              </div>
              <div className="flex flex-wrap gap-2">
                {skill.outputs.map((output) => (
                  <span
                    key={output.role}
                    className="rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[11px] text-success"
                  >
                    {translateSkillOutputLabel(
                      output.role,
                      output.label,
                      t,
                    )}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!ready || isBusy}
              onClick={(event) => {
                event.stopPropagation();
                void submit();
              }}
              className="mt-auto inline-flex items-center justify-center gap-2 rounded-[8px] bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {isBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {submitLabel}
            </button>
            {data.generationError ? (
              <div
                className={`max-h-32 overflow-y-auto ${NODE_INLINE_ERROR_MESSAGE_CLASS}`}
              >
                {data.generationError}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-text-muted">
            {t('viewer.threeD.skillStatus.missingSkill', {
              id:
                data.skill_id ||
                t('viewer.threeD.skillStatus.emptySkillId'),
            })}
          </div>
        )}
      </div>
      {isSetSelectedBackgroundSkill && beatTarget && cropSource && (
        <BackgroundCropperDialog
          isOpen={Boolean(cropSource)}
          onClose={closeCropSource}
          sourceUrl={cropSource.url}
          sourceLabel={cropSource.label}
          aspectOptions={SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS}
          onConfirmBlob={(blob, filename) =>
            uploadAndStageSelectedBackground(
              blob,
              filename,
              t('viewer.threeD.selectedBackgroundOutputLabel', {
                episode: beatTarget.episode,
                beat: beatTarget.beat,
              }),
            )
          }
          onCandidateSuccess={clearSourcePickerError}
          onError={setSourcePickerError}
        />
      )}
      {inputHandleIds.map((handleId, index) => (
        <Handle
          key={`fallback-${handleId}`}
          type="target"
          position={Position.Left}
          id={handleId}
          className="!pointer-events-none !h-2.5 !w-2.5 !border-0 !bg-cyan-300 !opacity-0"
          style={{ top: handleTop(index, inputHandleIds.length) }}
        />
      ))}
      {(isSetSelectedBackgroundSkill || isSetDirectorCombinedSkill) &&
        beatTarget && (
          <ThreeDDirectorDialog
            open={directorStageOpen}
            onOpenChange={changeDirectorWorldOpen}
            manifest={directorStageManifest}
            title={t('viewer.threeD.beatDirectorWorld')}
            description={t('viewer.threeD.beatDirectorWorldDescription')}
            viewerPurpose="beat"
            autoCommitDirectorCombined={mainlineManaged}
            onCaptureSelectedBackground={
              directorWorldDestination === 'selected_background'
                ? captureDirectorWorld
                : undefined
            }
            onSubmitDirectorCombined={
              directorWorldDestination === 'director_combined'
                ? captureDirectorWorld
                : undefined
            }
          />
        )}
    </div>
  );
}
