// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  FolderOpen,
  Package,
  RefreshCw,
  UserRound,
} from 'lucide-react';

import {
  BEAT_CONTEXT_NODE_SIZE_LIMITS,
  BEAT_CONTEXT_NONE_SENTINEL,
  BEAT_CONTEXT_NO_CHARACTER_MARKER,
  BEAT_CONTEXT_NO_PROP_MARKER,
  projectBeatContextSelectableTokens,
  type BeatContextMentionKind,
} from '@/features/canvas/application/beatContextNodeModel';
import type { BeatContextNodeController } from '@/features/canvas/hooks/useBeatContextNodeController';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { NodeContextBadges } from '@/modules/creative_canvas/public';
import { UiSelect } from '@/components/ui';
import { parseColorValue } from '@/lib/sketch-colors';
import { timeOfDayLabel } from '@/lib/time-of-day';

const BEAT_CONTEXT_SELECT_CLASS =
  '!h-8 !rounded-[6px] !border-border !bg-muted !px-2 !text-xs !text-foreground hover:!border-warning/45 focus-visible:!border-warning/55';
const BEAT_CONTEXT_SELECT_MENU_CLASS =
  '!z-[260] !border-border !bg-popover text-popover-foreground shadow-xl';

const STANDALONE_ACTOR_COLORS = [
  '#FF00FF',
  '#00FFFF',
  '#CCFF00',
  '#FF6B00',
  '#7C4DFF',
  '#00FF66',
  '#00A2FF',
  '#FFD400',
  '#9D00FF',
  '#00FFCC',
  '#39FF14',
  '#5C6BC0',
] as const;

const STANDALONE_PROP_COLORS = [
  '#B71C1C',
  '#6D4C41',
  '#827717',
  '#1B5E20',
  '#006064',
  '#0D47A1',
  '#311B92',
  '#7B1FA2',
  '#880E4F',
  '#3E2723',
] as const;

export function BeatContextNodeView({
  controller,
}: {
  controller: BeatContextNodeController;
}) {
  const { t } = useTranslation();
  const {
    data,
    size,
    title,
    contexts,
    episode,
    beat,
    isStandaloneContext,
    snapshot,
    workbenchTarget,
    syncStatus,
    isSyncing,
    openingWorkbench,
    editVersion,
    visualDraft,
    identityDraft,
    propDraft,
    identityColorDraft,
    propColorDraft,
    sceneDraft,
    timeDraft,
    identityOptions,
    propOptions,
    sceneOptions,
    timeOptions,
    mentionContext,
    mentionActiveIndex,
    filteredMentionCandidates,
    activeIdentityPaletteId,
    activePropPaletteId,
    visualTextareaRef,
  } = controller;

  return (
    <div
      className="group relative h-full w-full overflow-visible"
      style={{ width: size.width, height: size.height }}
      onClick={controller.select}
    >
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="!h-2.5 !w-2.5 !border-0 !bg-warning"
      />

      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Database className="h-4 w-4" />}
        titleText={title}
        editable
        onTitleChange={controller.rename}
      />

      <NodeResizeHandle
        minWidth={BEAT_CONTEXT_NODE_SIZE_LIMITS.minWidth}
        minHeight={BEAT_CONTEXT_NODE_SIZE_LIMITS.minHeight}
        maxWidth={BEAT_CONTEXT_NODE_SIZE_LIMITS.maxWidth}
        maxHeight={BEAT_CONTEXT_NODE_SIZE_LIMITS.maxHeight}
      />

      <div
        className="flex h-full flex-col overflow-hidden rounded-[var(--node-radius)] border border-warning/35 bg-card text-foreground shadow-lg"
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-warning">
                {t('node.beatContextNode.heading', {
                  defaultValue: '镜头上下文',
                })}
              </div>
              {!isStandaloneContext && (
                <div className="mt-1 text-sm font-semibold text-foreground">
                  EP{episode ?? '?'} / Beat {beat ?? '?'}
                </div>
              )}
            </div>
            <NodeContextBadges contexts={contexts} variant="subtle" />
          </div>
          {workbenchTarget && (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={openingWorkbench}
              onClick={(event) => {
                event.stopPropagation();
                void controller.openWorkbench();
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {openingWorkbench
                ? t('node.beatContextNode.openingWorkbench', {
                    defaultValue: '打开中...',
                  })
                : t('node.beatContextNode.openWorkbench', {
                    defaultValue: '打开工作台',
                  })}
            </button>
          )}
        </div>

        <div
          key={`snapshot-${editVersion}`}
          className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3 text-xs leading-relaxed"
        >
          <section>
            <div className="mb-2 font-semibold text-foreground">
              {t('node.beatContextNode.fields.visual', {
                defaultValue: '起始画面',
              })}
            </div>
            <div className="relative">
              <textarea
                ref={visualTextareaRef}
                value={visualDraft}
                placeholder={t('node.beatContextNode.placeholders.visual', {
                  defaultValue: '未设置;点击输入起始画面描述',
                })}
                rows={3}
                onChange={(event) =>
                  controller.changeVisualDraft(event.target)
                }
                onSelect={(event) =>
                  controller.updateMentionContext(event.currentTarget)
                }
                onClick={(event) => {
                  event.stopPropagation();
                  controller.updateMentionContext(event.currentTarget);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={controller.handleVisualKeyDown}
                onBlur={controller.blurVisualDraft}
                className="w-full resize-y rounded-[8px] border border-border bg-muted p-2 text-foreground outline-none focus:border-warning/55"
              />
              {mentionContext && filteredMentionCandidates.length > 0 && (
                <div
                  className="absolute left-2 top-full z-50 mt-1 max-h-56 min-w-[240px] overflow-auto rounded-lg border border-border bg-popover/95 p-1 shadow-xl backdrop-blur"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                >
                  {filteredMentionCandidates.map((candidate, index) => {
                    const Icon =
                      candidate.kind === 'identity' ? UserRound : Package;
                    return (
                      <button
                        key={`${candidate.kind}:${candidate.id}`}
                        type="button"
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          index === mentionActiveIndex
                            ? 'bg-warning/15 text-warning'
                            : 'text-popover-foreground/75 hover:bg-muted hover:text-popover-foreground'
                        }`}
                        onMouseEnter={() => controller.activateMention(index)}
                        onClick={() => controller.insertMention(candidate)}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                          {candidate.label}
                        </span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {candidate.token}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {!isStandaloneContext && (
            <section className="grid grid-cols-2 gap-2">
              <div className="rounded-[8px] border border-border bg-muted p-2">
                <div className="mb-1.5 text-muted-foreground">
                  {t('node.beatContextNode.fields.scene', {
                    defaultValue: '场景',
                  })}
                </div>
                <div
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <UiSelect
                    aria-label={t('node.beatContextNode.fields.scene', {
                      defaultValue: '场景',
                    })}
                    value={sceneDraft || BEAT_CONTEXT_NONE_SENTINEL}
                    className={BEAT_CONTEXT_SELECT_CLASS}
                    menuClassName={BEAT_CONTEXT_SELECT_MENU_CLASS}
                    onChange={(event) =>
                      controller.changeScene(
                        event.target.value === BEAT_CONTEXT_NONE_SENTINEL
                          ? ''
                          : (event.target.value ?? ''),
                      )
                    }
                  >
                    <option value={BEAT_CONTEXT_NONE_SENTINEL}>
                      {t('node.beatContextNode.unset', {
                        defaultValue: '未设置',
                      })}
                    </option>
                    {sceneOptions.map((sceneId) => (
                      <option key={sceneId} value={sceneId}>
                        {sceneId}
                      </option>
                    ))}
                  </UiSelect>
                </div>
              </div>
              <div className="rounded-[8px] border border-border bg-muted p-2">
                <div className="mb-1.5 text-muted-foreground">
                  {t('node.beatContextNode.fields.time', {
                    defaultValue: '时间',
                  })}
                </div>
                <div
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <UiSelect
                    aria-label={t('node.beatContextNode.fields.time', {
                      defaultValue: '时间',
                    })}
                    value={timeDraft || BEAT_CONTEXT_NONE_SENTINEL}
                    className={BEAT_CONTEXT_SELECT_CLASS}
                    menuClassName={BEAT_CONTEXT_SELECT_MENU_CLASS}
                    onChange={(event) =>
                      controller.changeTime(
                        event.target.value === BEAT_CONTEXT_NONE_SENTINEL
                          ? ''
                          : (event.target.value ?? ''),
                      )
                    }
                  >
                    <option value={BEAT_CONTEXT_NONE_SENTINEL}>
                      {timeOfDayLabel('')}
                    </option>
                    {timeOptions.map((timeOfDay) => (
                      <option key={timeOfDay} value={timeOfDay}>
                        {timeOfDayLabel(timeOfDay)}
                      </option>
                    ))}
                  </UiSelect>
                </div>
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-2">
            <div className="rounded-[8px] border border-border bg-muted p-2">
              <div className="mb-1.5 text-muted-foreground">
                {t('node.beatContextNode.fields.identities', {
                  defaultValue: '出场身份',
                })}
              </div>
              <SelectableTokenGroup
                options={identityOptions}
                selected={identityDraft}
                colorMap={identityColorDraft}
                editableColors={isStandaloneContext}
                activePaletteId={activeIdentityPaletteId}
                onPaletteToggle={controller.toggleIdentityPalette}
                onColorChange={controller.updateIdentityColor}
                emptyLabel={BEAT_CONTEXT_NO_CHARACTER_MARKER}
                emptyText={t('node.beatContextNode.empty.noCharacter', {
                  defaultValue: '无角色出场',
                })}
                staleText={t('node.beatContextNode.stale', {
                  defaultValue: '已移除',
                })}
                icon="identity"
                onToggle={controller.toggleIdentity}
              />
            </div>
            <div className="rounded-[8px] border border-border bg-muted p-2">
              <div className="mb-1.5 text-muted-foreground">
                {t('node.beatContextNode.fields.props', {
                  defaultValue: '出场道具',
                })}
              </div>
              <SelectableTokenGroup
                options={propOptions}
                selected={propDraft}
                colorMap={propColorDraft}
                editableColors={isStandaloneContext}
                activePaletteId={activePropPaletteId}
                onPaletteToggle={controller.togglePropPalette}
                onColorChange={controller.updatePropColor}
                emptyLabel={BEAT_CONTEXT_NO_PROP_MARKER}
                emptyText={t('node.beatContextNode.empty.noProp', {
                  defaultValue: '无道具出场',
                })}
                staleText={t('node.beatContextNode.stale', {
                  defaultValue: '已移除',
                })}
                icon="prop"
                onToggle={controller.toggleProp}
              />
            </div>
          </section>

          <section className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-1">
              {t('node.beatContextNode.assets.background', {
                defaultValue: '背景',
              })}{' '}
              {snapshot.selectedBackgroundExists
                ? t('node.beatContextNode.assets.selected', {
                    defaultValue: '已选',
                  })
                : t('node.beatContextNode.assets.unselected', {
                    defaultValue: '未选',
                  })}
            </span>
            <span className="rounded-full bg-muted px-2 py-1">
              {t('node.beatContextNode.assets.sketch', {
                defaultValue: '草图',
              })}{' '}
              {snapshot.currentSketchExists
                ? t('node.beatContextNode.assets.exists', {
                    defaultValue: '已有',
                  })
                : t('node.beatContextNode.assets.missing', {
                    defaultValue: '缺失',
                  })}
            </span>
            <span className="rounded-full bg-muted px-2 py-1">
              {t('node.beatContextNode.assets.frame', {
                defaultValue: '分镜',
              })}{' '}
              {snapshot.currentFrameExists
                ? t('node.beatContextNode.assets.exists', {
                    defaultValue: '已有',
                  })
                : t('node.beatContextNode.assets.missing', {
                    defaultValue: '缺失',
                  })}
            </span>
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            <RefreshCw
              className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span className="truncate">
              {isStandaloneContext
                ? t('node.beatContextNode.status.standaloneLocalOnly', {
                    defaultValue: '自定义上下文；仅当前画布使用。',
                  })
                : syncStatus === 'error'
                  ? t('node.beatContextNode.status.syncError', {
                      defaultValue: '同步失败：{{message}}',
                      message:
                        data.errorMessage ||
                        t('node.beatContextNode.status.unknownError', {
                          defaultValue: '未知错误',
                        }),
                    })
                  : isSyncing
                    ? t('node.beatContextNode.status.syncing', {
                        defaultValue: '正在同步到主线...',
                      })
                    : syncStatus === 'stale'
                      ? t('node.beatContextNode.status.stale', {
                          defaultValue:
                            '本地已修改，未同步主线；技能会使用当前节点。',
                        })
                      : t('node.beatContextNode.status.fresh', {
                          defaultValue:
                            '上下文已同步；技能会使用当前节点。',
                        })}
            </span>
          </div>
          {!isStandaloneContext && (
            <button
              type="button"
              className="shrink-0 rounded-full border border-warning/35 bg-warning/10 px-2 py-1 text-[10px] text-warning hover:bg-warning/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSyncing}
              onClick={(event) => {
                event.stopPropagation();
                void controller.syncToMainline();
              }}
            >
              {t('node.beatContextNode.syncToMainline', {
                defaultValue: '同步到主线',
              })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectableTokenGroup({
  options,
  selected,
  colorMap,
  emptyLabel,
  emptyText,
  staleText,
  icon,
  onToggle,
  editableColors = false,
  activePaletteId,
  onPaletteToggle,
  onColorChange,
}: {
  options: string[];
  selected: string[];
  colorMap?: Record<string, string>;
  emptyLabel: string;
  emptyText: string;
  staleText: string;
  icon: BeatContextMentionKind;
  onToggle: (id: string) => void;
  editableColors?: boolean;
  activePaletteId: string | null;
  onPaletteToggle: (id: string) => void;
  onColorChange: (id: string, color: string) => void;
}) {
  const { t } = useTranslation();
  const projection = projectBeatContextSelectableTokens(
    options,
    selected,
    emptyLabel,
  );
  const activeToken = activePaletteId
    ? projection.tokens.find(({ id }) => id === activePaletteId)
    : null;

  const renderToken = ({ id, stale }: { id: string; stale: boolean }) => {
    const isSelected = projection.selected.includes(id);
    const label = id === emptyLabel ? emptyText : id;
    const Icon = icon === 'identity' ? UserRound : Package;
    const rawColor = id === emptyLabel ? '' : colorMap?.[id]?.trim();
    const color = rawColor ? parseColorValue(rawColor).hex : null;
    const colorLabel =
      icon === 'identity'
        ? t('node.beatContextNode.palette.identityColor', {
            defaultValue: '身份颜色',
          })
        : t('node.beatContextNode.palette.propColor', {
            defaultValue: '道具颜色',
          });
    const chipClassName = `inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] transition-colors ${
      isSelected
        ? stale
          ? 'border-destructive/35 bg-destructive/10 text-destructive'
          : 'border-primary/45 bg-primary/12 text-primary'
        : 'border-border bg-muted/70 text-foreground/70 hover:border-foreground/25 hover:text-foreground'
    }`;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={isSelected}
        className={chipClassName}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(id);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        title={label}
      >
        <Icon className="h-3 w-3 shrink-0" />
        {editableColors && isSelected && id !== emptyLabel ? (
          <span className="relative shrink-0">
            <span
              aria-label={`${colorLabel} ${id}`}
              className="inline-flex h-4 w-4 cursor-pointer rounded-full border border-border bg-muted/20 align-middle shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              style={{ backgroundColor: color ?? 'transparent' }}
              onClick={(event) => {
                event.stopPropagation();
                onPaletteToggle(id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            />
          </span>
        ) : (
          color && (
            <span
              data-testid={`beat-context-color-${icon}-${id}`}
              className="h-3 w-3 shrink-0 rounded-full border border-border shadow-sm"
              style={{ backgroundColor: color }}
            />
          )
        )}
        <span className="truncate">{label}</span>
        {stale && (
          <span className="shrink-0 text-[10px] opacity-70">{staleText}</span>
        )}
      </button>
    );
  };

  return (
    <div className="relative overflow-visible">
      <div className="flex max-h-56 flex-wrap gap-1.5 overflow-auto">
        {projection.tokens.map(renderToken)}
      </div>
      {activeToken &&
        projection.selected.includes(activeToken.id) &&
        activeToken.id !== emptyLabel && (
          <ContextColorPalette
            onSelect={(nextColor) =>
              onColorChange(activeToken.id, nextColor)
            }
          />
        )}
    </div>
  );
}

function ContextColorPalette({
  onSelect,
}: {
  onSelect: (color: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <span
      className="absolute left-0 top-full z-50 mt-2 block w-[310px] rounded-2xl border border-border bg-popover/95 p-4 text-xs text-popover-foreground/75 shadow-2xl backdrop-blur-xl"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <PaletteSection
        title={t('node.beatContextNode.palette.actorColors', {
          defaultValue: '人物颜色',
        })}
        labelPrefix={t('node.beatContextNode.palette.actorColors', {
          defaultValue: '人物颜色',
        })}
        colors={STANDALONE_ACTOR_COLORS}
        onSelect={onSelect}
      />
      <PaletteSection
        title={t('node.beatContextNode.palette.propColors', {
          defaultValue: '道具颜色',
        })}
        labelPrefix={t('node.beatContextNode.palette.propColors', {
          defaultValue: '道具颜色',
        })}
        colors={STANDALONE_PROP_COLORS}
        onSelect={onSelect}
        className="mt-4"
      />
    </span>
  );
}

function PaletteSection({
  title,
  labelPrefix,
  colors,
  className = '',
  onSelect,
}: {
  title: string;
  labelPrefix: string;
  colors: readonly string[];
  className?: string;
  onSelect: (color: string) => void;
}) {
  return (
    <span className={`block ${className}`}>
      <span className="mb-2 block font-semibold text-muted-foreground">
        {title}
      </span>
      <span className="flex flex-wrap gap-3">
        {colors.map((color) => (
          <span
            key={`${labelPrefix}:${color}`}
            role="button"
            tabIndex={0}
            aria-label={`${labelPrefix} ${color}`}
            className="inline-flex h-9 w-9 cursor-pointer rounded-full border border-border bg-muted p-1 shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(color);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onSelect(color);
            }}
          >
            <span
              className="block h-full w-full rounded-full border border-border"
              style={{ backgroundColor: color }}
            />
          </span>
        ))}
      </span>
    </span>
  );
}
