// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import {
  ArrowUp,
  Check,
  CircleHelp,
  Copy,
  Languages,
  Loader2,
  Repeat,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';

import {
  CANVAS_NODE_OPS_PANEL_CLASS,
  MUSIC_LENGTH_PRESETS,
  NODE_CREDIT_PILL_FLAT_CLASS,
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_DISABLED_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
  NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS,
  NODE_INLINE_ICON_BUTTON_CLASS,
  OperationPanelShell,
  PanelExpandButton,
  ReferenceTextChip,
} from '@/modules/creative_canvas/public';
import type { AudioOperationsPanelController } from '@/features/canvas/hooks/useAudioOperationsPanelController';
import { CreditCostPill } from '@/components/credits/credit-visual';
import { UiSelect } from '@/components/ui';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { VoiceSelectionModal } from './VoiceSelectionModal';

const PANEL_GAP_PX = 12;
const PANEL_OVERHANG_PX = 60;
const PANEL_EXPANDED_WIDTH_PX = 760;
const AUDIO_INPUT_LABEL_CLASS = 'text-[12px] font-medium text-text-muted/90';
const AUDIO_INPUT_FIELD_CLASS =
  'nodrag nowheel w-full rounded-[10px] border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/25 focus:border-primary/45';
const MUSIC_LENGTH_SELECT_CLASS =
  '!h-8 !w-[116px] !rounded-[8px] !border-border !bg-muted !px-3 !text-[13px] !text-foreground hover:!border-foreground/25';
const MUSIC_LENGTH_SELECT_MENU_CLASS =
  '!z-[260] !min-w-[140px] !border-border !bg-popover !text-popover-foreground shadow-xl';
const AUDIO_MODEL_SELECT_CLASS =
  '!h-8 !w-[180px] !rounded-[8px] !border-border !bg-muted !px-3 !text-[12px] !text-foreground hover:!border-foreground/25';

export interface AudioOperationsPanelViewProps {
  controller: AudioOperationsPanelController;
}

export function AudioOperationsPanelView({
  controller,
}: AudioOperationsPanelViewProps) {
  const {
    panelExpanded,
    collapsePanel,
    togglePanelExpanded,
    upstreamTextContents,
    detachUpstream,
    isMusic,
    text,
    textDraft,
    changeTextDraft,
    startTextComposition,
    finishTextComposition,
    emotionDraft,
    changeEmotionDraft,
    startEmotionComposition,
    finishEmotionComposition,
    isGenerating,
    isTranslating,
    translate,
    showVoiceSettings,
    toggleVoiceSettings,
    showMusicSettings,
    toggleMusicSettings,
    audioCostDisplay,
    audioModels,
    selectedModel,
    modelCatalogLoading,
    modelCatalogError,
    setSelectedModel,
    submitDisabled,
    submit,
  } = controller;

  return (
    <OperationPanelShell
      expanded={panelExpanded}
      onCollapse={collapsePanel}
      inlineClassName={`nodrag absolute z-10 flex flex-col rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS}`}
      inlineStyle={{
        top: `calc(100% + ${PANEL_GAP_PX}px)`,
        left: -PANEL_OVERHANG_PX,
        right: -PANEL_OVERHANG_PX,
      }}
      modalStyle={{ width: `min(${PANEL_EXPANDED_WIDTH_PX}px, 92vw)` }}
    >
      <PanelExpandButton
        expanded={panelExpanded}
        onToggle={togglePanelExpanded}
        className="absolute right-2 top-2 z-20"
      />
      {upstreamTextContents.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 px-3 pt-2">
          {upstreamTextContents.map((content) => (
            <ReferenceTextChip
              key={`upstream-text-${content.nodeId}`}
              nodeId={content.nodeId}
              text={content.text ?? ''}
              sourceLabel={content.displayName ?? content.nodeType}
              onDetach={detachUpstream}
            />
          ))}
        </div>
      )}

      <div className="px-3 pt-3">
        <label className="flex flex-col gap-2">
          <span className={AUDIO_INPUT_LABEL_CLASS}>
            {isMusic ? '输入音乐描述' : '输入要合成的文本'}
          </span>
          <textarea
            value={textDraft}
            onChange={(event) => changeTextDraft(event.target.value)}
            onCompositionStart={startTextComposition}
            onCompositionEnd={(event) =>
              finishTextComposition(
                (event.target as HTMLTextAreaElement).value,
              )
            }
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder={
              isMusic
                ? '描述想要的音乐：风格、乐器、节奏、氛围…'
                : '输入要合成的文本'
            }
            disabled={isGenerating}
            className={`${AUDIO_INPUT_FIELD_CLASS} ui-scrollbar resize-none py-2 leading-[1.65] ${
              panelExpanded
                ? 'min-h-[360px] max-h-[560px]'
                : 'min-h-[108px] max-h-[180px]'
            }`}
          />
        </label>
      </div>

      {!isMusic && (
        <div className="px-3 pb-3 pt-4">
          <label className="flex flex-col gap-2">
            <span className={AUDIO_INPUT_LABEL_CLASS}>
              语气词
              <span className="ml-1 text-text-muted">（可选，自由输入）</span>
            </span>
            <input
              type="text"
              value={emotionDraft}
              onChange={(event) => changeEmotionDraft(event.target.value)}
              onCompositionStart={startEmotionComposition}
              onCompositionEnd={(event) =>
                finishEmotionComposition(
                  (event.target as HTMLInputElement).value,
                )
              }
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="如：紧张、压低声音、带一点恐惧感"
              disabled={isGenerating}
              className={`${AUDIO_INPUT_FIELD_CLASS} h-9`}
            />
          </label>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-end gap-2 px-3 pb-3 pt-1">
        <UiSelect
          aria-label="音频模型"
          title={modelCatalogError || undefined}
          value={selectedModel}
          onChange={(event) => setSelectedModel(event.target.value)}
          onMouseDown={(event) => event.stopPropagation()}
          disabled={isGenerating || modelCatalogLoading || audioModels.length === 0}
          className={AUDIO_MODEL_SELECT_CLASS}
          menuClassName={MUSIC_LENGTH_SELECT_MENU_CLASS}
        >
          {audioModels.length === 0 ? (
            <option value="">
              {modelCatalogLoading ? '加载模型…' : '无可用音频模型'}
            </option>
          ) : null}
          {audioModels.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </UiSelect>
        <IconButton
          title="翻译（中英文互译）"
          onClick={translate}
          disabled={isGenerating || isTranslating || text.trim().length === 0}
          active={isTranslating}
        >
          {isTranslating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Languages className="h-4 w-4" />
          )}
        </IconButton>
        {!isMusic && (
          <IconButton
            title="音色设置"
            onClick={toggleVoiceSettings}
            active={showVoiceSettings}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </IconButton>
        )}
        {isMusic && (
          <IconButton
            title="高级设置"
            onClick={toggleMusicSettings}
            active={showMusicSettings}
          >
            <Settings2 className="h-4 w-4" />
          </IconButton>
        )}
        <CreditCostPill
          display={audioCostDisplay}
          disabled={submitDisabled}
          className={NODE_CREDIT_PILL_FLAT_CLASS}
        />
        <button
          type="button"
          disabled={submitDisabled}
          title="生成"
          onClick={submit}
          className={`${NODE_GENERATE_BUTTON_BASE_CLASS} ${
            submitDisabled
              ? NODE_GENERATE_BUTTON_DISABLED_CLASS
              : NODE_GENERATE_BUTTON_ENABLED_CLASS
          }`}
        >
          {isGenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )}
        </button>
      </div>

      {!isMusic && showVoiceSettings && (
        <AudioVoiceSettingsPanel controller={controller} />
      )}
      {isMusic && showMusicSettings && (
        <AudioMusicSettingsPanel controller={controller} />
      )}
    </OperationPanelShell>
  );
}

interface IconButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}

function IconButton({
  children,
  onClick,
  disabled,
  active,
  title,
}: IconButtonProps) {
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

function MusicSettingToggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className="nodrag inline-flex shrink-0 items-center"
    >
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-input'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-card shadow-sm transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function MusicSettingHelp({ text }: { text: string }) {
  return (
    <TooltipProvider delay={120}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="说明"
              className="inline-flex cursor-help items-center text-muted-foreground transition-colors hover:text-foreground"
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] leading-5">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AudioMusicSettingsPanel({
  controller,
}: {
  controller: AudioOperationsPanelController;
}) {
  const {
    musicSettings,
    setMusicLengthMs,
    setForceInstrumental,
    setRespectSectionsDurations,
  } = controller;
  return (
    <div className="border-t border-border px-4 pb-3 pt-1">
      <div className="flex items-center justify-between py-2">
        <span className="text-[12px] font-semibold text-text-muted">
          高级设置
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
          音乐时长
          <MusicSettingHelp text="设定歌曲长度。自动模式下优先保证歌词完整；指定时长后则优先匹配时长。" />
        </span>
        <UiSelect
          aria-label="音乐时长"
          value={String(musicSettings.musicLengthMs)}
          onChange={(event) => setMusicLengthMs(Number(event.target.value))}
          onMouseDown={(event) => event.stopPropagation()}
          className={MUSIC_LENGTH_SELECT_CLASS}
          menuClassName={MUSIC_LENGTH_SELECT_MENU_CLASS}
        >
          {MUSIC_LENGTH_PRESETS.map((preset) => (
            <option key={preset.ms} value={String(preset.ms)}>
              {preset.label}
            </option>
          ))}
        </UiSelect>
      </div>
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
          强制纯音乐
          <MusicSettingHelp text="是否强制纯音乐（不含人声）。" />
        </span>
        <MusicSettingToggle
          ariaLabel="强制纯音乐"
          checked={musicSettings.forceInstrumental}
          onChange={setForceInstrumental}
        />
      </div>
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
          遵守段落时长
          <MusicSettingHelp text="是否严格遵守音乐段落时长策略。" />
        </span>
        <MusicSettingToggle
          ariaLabel="遵守段落时长"
          checked={musicSettings.respectSectionsDurations}
          onChange={setRespectSectionsDurations}
        />
      </div>
    </div>
  );
}

function AudioVoiceSettingsPanel({
  controller,
}: {
  controller: AudioOperationsPanelController;
}) {
  const {
    voiceSettings,
    voiceModalOpen,
    openVoiceModal,
    closeVoiceModal,
    pickVoice,
    copyState,
    copyVoiceReference,
  } = controller;
  return (
    <div className="border-t border-border px-4 pb-3 pt-1">
      <div className="flex items-center justify-between py-2">
        <span className="text-[12px] font-semibold text-text-muted">
          音色设置
        </span>
      </div>
      <div className="flex min-h-[55px] w-full items-center gap-3 rounded-[10px] border border-border bg-card px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-medium text-foreground">
              {voiceSettings.voiceLabel}
            </span>
            <button
              type="button"
              title={
                copyState === 'success'
                  ? '已复制'
                  : copyState === 'error'
                    ? '复制失败'
                    : '复制声线引用'
              }
              onClick={copyVoiceReference}
              className={`flex h-4 w-4 shrink-0 items-center justify-center transition-colors ${
                copyState === 'success'
                  ? 'text-success'
                  : copyState === 'error'
                    ? 'text-destructive'
                    : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {copyState === 'success' ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {voiceSettings.voiceLanguage && (
            <span className="h-5 rounded bg-muted px-1.5 text-[12px] leading-5 text-foreground">
              {voiceSettings.voiceLanguage}
            </span>
          )}
          <button
            type="button"
            title="切换音色"
            onClick={openVoiceModal}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
          >
            <Repeat className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <VoiceSelectionModal
        projectId={controller.projectId}
        open={voiceModalOpen}
        onClose={closeVoiceModal}
        currentRef={voiceSettings.currentRef}
        onPick={pickVoice}
      />
    </div>
  );
}
