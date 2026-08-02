// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, X } from "lucide-react";

import type { ImpactBeat, PushTarget, PushTargetKind } from "../domain/assetCommit";
import type { CanvasCommitMediaType } from "../domain/canvasCommitSource";
import {
  BEAT_SLOT_KINDS,
  directorWorldSourceDisplayName,
  identityOptionLabel,
  identityOptionValue,
  renderMediaLabel,
  sceneOptionLabel,
  sceneOptionValue,
  shortKindLabel,
} from "./commitDialogViewModel";
import { UiButton, UiInput, UiPanel, UiSelect } from "@/components/ui";
import { UI_DIALOG_TRANSITION_MS } from "@/components/ui/motion";
import { useDialogTransition } from "@/components/ui/useDialogTransition";
import type {
  Character,
  Identity,
  SceneAsset,
} from "@/modules/asset_world/public";
import type { Episode } from "@/modules/narrative_planning/public";

const COMMIT_FIELD_BORDER_CLASS =
  "!border-border hover:!border-foreground/25 focus-visible:!border-primary/55";
const COMMIT_SELECT_MENU_CLASS =
  "!z-[260] !border-border !bg-popover text-popover-foreground shadow-2xl";

interface CommitDialogTargetViewState {
  kind: PushTargetKind;
  setKind: (kind: PushTargetKind) => void;
  episode: number | null;
  setEpisode: (episode: number | null) => void;
  beat: number | null;
  setBeat: (beat: number | null) => void;
  character: string | null;
  setCharacter: (character: string | null) => void;
  identityId: string | null;
  setIdentityId: (identityId: string | null) => void;
  sceneId: string;
  setSceneId: (sceneId: string) => void;
  propId: string;
  setPropId: (propId: string) => void;
  episodes: Episode[];
  scenes: SceneAsset[];
  scenesLoading: boolean;
  beatOptions: number[];
  beatsLoading: boolean;
  characters: Character[];
  displayedIdentityOptions: Identity[];
  identitiesLoading: boolean;
  impactBeats: ImpactBeat[];
  impactLoading: boolean;
  markStale: boolean;
  setMarkStale: (markStale: boolean) => void;
  error: string | null;
  isBeatStyle: boolean;
  isIdentityStyle: boolean;
  needsIdentityId: boolean;
  isSceneStyle: boolean;
  isPropStyle: boolean;
  isGlobalSlot: boolean;
  noTargetYet: boolean;
  noModelSourceForSlotCommit: boolean;
  showTargetKindSelect: boolean;
  targetKindOptions: Array<[string, string]>;
  target: PushTarget | null;
  targetLabel: string;
}

interface CommitDialogSubmissionViewState {
  submitting: boolean;
  ready: boolean;
  submit: () => Promise<void>;
}

export interface CommitDialogViewProps {
  project: string;
  sourceUrl: string;
  previewUrl?: string | null;
  sourceLabelOverride?: string | null;
  mediaType: CanvasCommitMediaType;
  nodeData?: Record<string, unknown> | null;
  targetState: CommitDialogTargetViewState;
  submission: CommitDialogSubmissionViewState;
  onClose: () => void;
}

export function CommitDialogView({
  project,
  sourceUrl,
  previewUrl,
  sourceLabelOverride,
  mediaType,
  nodeData,
  targetState,
  submission,
  onClose,
}: CommitDialogViewProps) {
  const {
    kind,
    setKind,
    episode,
    setEpisode,
    beat,
    setBeat,
    character,
    setCharacter,
    identityId,
    setIdentityId,
    sceneId,
    setSceneId,
    propId,
    setPropId,
    episodes,
    scenes,
    scenesLoading,
    beatOptions,
    beatsLoading,
    characters,
    displayedIdentityOptions,
    identitiesLoading,
    impactBeats,
    impactLoading,
    markStale,
    setMarkStale,
    error,
    isBeatStyle,
    isIdentityStyle,
    needsIdentityId,
    isSceneStyle,
    isPropStyle,
    isGlobalSlot,
    noTargetYet,
    noModelSourceForSlotCommit,
    showTargetKindSelect,
    targetKindOptions,
    target,
    targetLabel,
  } = targetState;
  const { submitting, ready, submit } = submission;
  const { shouldRender, isVisible } = useDialogTransition(true, UI_DIALOG_TRANSITION_MS);

  const nodeSourceLabel =
    typeof sourceLabelOverride === "string" && sourceLabelOverride.trim()
      ? sourceLabelOverride.trim()
      : "";
  const sourceLabel = nodeSourceLabel || sourceDisplayName(sourceUrl);
  const mediaLabel = renderMediaLabel(mediaType);
  const modelSourceLabel = mediaType === "model"
    ? directorWorldSourceDisplayName(nodeData, sourceUrl, nodeSourceLabel)
    : "";
  const commitSourceTitle = target?.kind === "scene_director_world"
    ? "导演世界状态"
    : mediaType === "model"
      ? modelSourceLabel
      : mediaLabel;
  const commitSourceSubtitle = target?.kind === "scene_director_world"
    ? "提交当前导演世界 manifest"
    : mediaType === "model"
      ? "提交当前 3D 世界到主线场景"
      : sourceLabel;
  const commitSourceBadge = target?.kind === "scene_director_world"
    ? "WORLD"
    : mediaType === "audio"
      ? "audio"
      : mediaType === "model"
        ? "3gs"
        : "image";

  if (!shouldRender || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center">
      <div
        className={`absolute inset-0 bg-scrim backdrop-blur-[2px] transition-opacity duration-200 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={submitting ? undefined : onClose}
      />
      <UiPanel
        className={`relative flex max-h-[82vh] w-[560px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden !bg-card transition-[opacity,transform] duration-200 ${
          isVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
        }`}
      >
        <header className="flex items-start gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold leading-tight text-foreground">提交到主线资产</h2>
            <p className="mt-0.5 truncate text-xs text-text-muted">项目：{project}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-muted-foreground transition hover:text-foreground disabled:opacity-30"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="ui-scrollbar flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-2">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-[var(--ui-surface-field)] p-2">
            {mediaType === "video" ? (
              <video
                src={sourceUrl}
                muted
                playsInline
                className="h-14 w-14 shrink-0 rounded-full object-cover"
              />
            ) : mediaType === "audio" ? (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {commitSourceBadge}
              </div>
            ) : mediaType === "model" ? (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {commitSourceBadge}
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="source preview"
                className="h-14 w-14 shrink-0 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-muted text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {commitSourceBadge}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="mt-0.5 truncate text-sm font-medium text-foreground">{commitSourceTitle}</div>
              <div className="mt-0.5 truncate text-xs text-text-muted/88">{commitSourceSubtitle}</div>
            </div>
          </div>

          {noTargetYet && (
            <div className="rounded-lg border border-warning/35 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
              {noModelSourceForSlotCommit
                ? "无来源没有可提交的 3D 世界素材；请切换到具体世界来源后再提交到主线槽位。"
                : "当前 3D 世界没有可提交到该槽位的素材。"}
            </div>
          )}

          {/* 目标类型下拉：图像可选全部可见槽；3D 模型只可选场景 3GS 槽。 */}
          {showTargetKindSelect && (
            <Section title="目标类型">
              <UiSelect
                value={kind}
                onChange={(e) => setKind(e.target.value as PushTargetKind)}
                aria-label="目标类型"
                className={COMMIT_FIELD_BORDER_CLASS}
                menuClassName={COMMIT_SELECT_MENU_CLASS}
              >
                {targetKindOptions
                  .map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
              </UiSelect>
            </Section>
          )}

          {!noTargetYet && isBeatStyle && (
            <Section title="目标位置">
              {mediaType === "image" && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {BEAT_SLOT_KINDS.map((slotKind) => {
                    const active = kind === slotKind;
                    return (
                      <button
                        key={slotKind}
                        type="button"
                        onClick={() => setKind(slotKind)}
                        className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-[color:var(--ui-border-soft)] bg-[var(--ui-surface-field)] text-muted-foreground hover:border-[color:var(--ui-border-strong)] hover:text-foreground"
                        }`}
                      >
                        {shortKindLabel(slotKind)}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1">
                  <UiSelect
                    value={episode ?? ""}
                    onChange={(e) => setEpisode(Number(e.target.value))}
                    aria-label="集数"
                    className={COMMIT_FIELD_BORDER_CLASS}
                    menuClassName={COMMIT_SELECT_MENU_CLASS}
                  >
                    {episodes.map((ep) => (
                      <option key={ep.number} value={ep.number}>
                        ep{ep.number}
                        {ep.title ? ` · ${ep.title}` : ""}
                      </option>
                    ))}
                  </UiSelect>
                </div>
                <div className="w-32">
                  <UiSelect
                    value={beat ?? ""}
                    onChange={(e) => setBeat(Number(e.target.value))}
                    disabled={beatsLoading || beatOptions.length === 0}
                    aria-label="Beat"
                    className={COMMIT_FIELD_BORDER_CLASS}
                    menuClassName={COMMIT_SELECT_MENU_CLASS}
                  >
                    {beatsLoading && (
                      <option value="" disabled>
                        加载 beat…
                      </option>
                    )}
                    {!beatsLoading && beatOptions.length === 0 && (
                      <option value="" disabled>
                        无 beat
                      </option>
                    )}
                    {beatOptions.map((n) => (
                      <option key={n} value={n}>
                        B{n}
                      </option>
                    ))}
                  </UiSelect>
                </div>
              </div>
            </Section>
          )}

          {isIdentityStyle && (
            <Section title="目标位置">
              <div className="space-y-2">
                <UiSelect
                  value={character ?? ""}
                  onChange={(e) => {
                    setCharacter(e.target.value);
                    setIdentityId(null);
                  }}
                  aria-label="角色"
                  className={COMMIT_FIELD_BORDER_CLASS}
                  menuClassName={COMMIT_SELECT_MENU_CLASS}
                >
                  {characters.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.display_name || c.name}
                    </option>
                  ))}
                </UiSelect>
                {needsIdentityId && (
                  <UiSelect
                    value={identityId ?? ""}
                    onChange={(e) => setIdentityId(e.target.value)}
                    disabled={identitiesLoading}
                    aria-label="identity_id"
                    className={COMMIT_FIELD_BORDER_CLASS}
                    menuClassName={COMMIT_SELECT_MENU_CLASS}
                  >
                    {identitiesLoading ? (
                      <option value="" disabled>
                        加载 identity_id…
                      </option>
                    ) : displayedIdentityOptions.length === 0 ? (
                      <option value="" disabled>
                        当前角色没有 identity_id
                      </option>
                    ) : (
                      displayedIdentityOptions.map((id) => {
                        const value = identityOptionValue(id);
                        return (
                          <option key={value} value={value}>
                            {identityOptionLabel(id)}
                          </option>
                        );
                      })
                    )}
                  </UiSelect>
                )}
              </div>
            </Section>
          )}

          {isSceneStyle && (
            <Section title="目标位置">
              {scenes.length > 0 ? (
                <UiSelect
                  value={sceneId}
                  onChange={(e) => setSceneId(e.target.value)}
                  disabled={scenesLoading}
                  aria-label="场景"
                  className={COMMIT_FIELD_BORDER_CLASS}
                  menuClassName={COMMIT_SELECT_MENU_CLASS}
                >
                  {scenes.map((scene) => {
                    const value = sceneOptionValue(scene);
                    if (!value) return null;
                    return (
                      <option key={value} value={value}>
                        {sceneOptionLabel(scene)}
                      </option>
                    );
                  })}
                </UiSelect>
              ) : (
                <UiInput
                  value={sceneId}
                  onChange={(e) => setSceneId(e.target.value)}
                  placeholder="scene_id,例如:兰州拉面馆"
                  className={COMMIT_FIELD_BORDER_CLASS}
                />
              )}
              <p className="mt-2 text-[11px] text-text-muted">将写入该场景资产槽位。</p>
            </Section>
          )}

          {isPropStyle && (
            <Section title="目标位置">
              <UiInput
                value={propId}
                onChange={(e) => setPropId(e.target.value)}
                placeholder="prop_id,例如:办公纸箱"
                className={COMMIT_FIELD_BORDER_CLASS}
              />
              <p className="mt-2 text-[11px] text-text-muted">将写入该道具参考资产槽位。</p>
            </Section>
          )}

          {isGlobalSlot && (
            <Section title="影响预览">
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
                {impactLoading ? (
                  <div className="flex items-center gap-2 text-text-muted">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    正在计算影响范围…
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 font-semibold text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      将影响 {impactBeats.length} 个镜头
                    </div>
                    {impactBeats.length > 0 && (
                      <div className="ui-scrollbar mt-2 max-h-28 space-y-1 overflow-y-auto pr-1">
                        {impactBeats.slice(0, 12).map((b) => (
                          <div key={`${b.episode}-${b.beat}`} className="text-text-muted">
                            EP{b.episode} / B{b.beat}
                            {b.visual_description ? ` · ${b.visual_description.slice(0, 48)}` : ""}
                          </div>
                        ))}
                        {impactBeats.length > 12 && (
                          <div className="text-text-muted">
                            还有 {impactBeats.length - 12} 个未显示
                          </div>
                        )}
                      </div>
                    )}
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-text-muted">
                      <input
                        type="checkbox"
                        checked={markStale}
                        onChange={(e) => setMarkStale(e.target.checked)}
                        className="sr-only peer"
                      />
                      <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background text-transparent transition-colors peer-checked:border-warning/70 peer-checked:bg-warning/20 peer-checked:text-warning">
                        <svg
                          viewBox="0 0 16 16"
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3.5 8.5l3 3 6-7" />
                        </svg>
                      </span>
                      <span className="leading-relaxed">
                        提交后把这些镜头标记为需重生，后续主流程可按标记重生
                      </span>
                    </label>
                  </>
                )}
              </div>
            </Section>
          )}

          <div className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>将覆盖「{targetLabel}」已有资产；原文件会保留在历史记录中。</span>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive break-words">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3.5">
          <UiButton variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            取消
          </UiButton>
          <UiButton
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={!ready}
            className="!h-9 rounded-full !bg-primary px-4 text-primary-foreground hover:!bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                提交中
              </>
            ) : (
              "提交"
            )}
          </UiButton>
        </footer>
      </UiPanel>
    </div>,
    document.body
  );
}

function sourceDisplayName(sourceUrl: string): string {
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(sourceUrl, base);
    const last = url.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : sourceUrl;
  } catch {
    const last = sourceUrl.split("?")[0].split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : sourceUrl;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}
