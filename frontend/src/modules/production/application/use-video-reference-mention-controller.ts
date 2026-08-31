// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { normalizeMentionSeparatorSpaces } from "@/lib/mention-markers";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  buildVideoReferenceLabelIdentityMaps,
  findVideoReferenceTrailingMention,
  getVideoReferenceMentionQuery,
  remapVideoReferenceMentions,
  sameVideoReferenceLabelIdentity,
  type VideoReferenceLabelIdentityMaps,
} from "@/modules/production/domain/video-reference-mentions";
import type { VideoReferenceAssetItem } from "@/modules/production/domain/video-reference-panel";
import type { BeatVideoConfigDraft } from "@/modules/production/domain/video-config";

export type VideoReferenceMentionField = "prompt_guidance" | "final_prompt";

export interface VideoReferenceMentionSelection {
  end: number;
  start: number;
}

export interface VideoReferenceMentionControllerOptions {
  assets: VideoReferenceAssetItem[];
  beatNumber: number;
  changeDraft(
    updater: (current: BeatVideoConfigDraft) => BeatVideoConfigDraft,
  ): void;
  draft: BeatVideoConfigDraft;
  enabled: boolean;
}

export interface VideoReferenceMentionController {
  activeField: VideoReferenceMentionField;
  activeIndex: number;
  mentionLabels: string[];
  mentionOpen: boolean;
  mentionOptions: VideoReferenceAssetItem[];
  mentionPreviews: Record<string, string>;
  mentionQuery: string | null;
  referenceOptions: VideoReferenceAssetItem[];
  acceptsReference(label: string): boolean;
  appendGuidanceTemplate(template: string): void;
  appendReference(field: VideoReferenceMentionField, label: string): void;
  dismissMention(field: VideoReferenceMentionField): void;
  insertDroppedReference(
    field: VideoReferenceMentionField,
    label: string,
    selection?: VideoReferenceMentionSelection,
  ): boolean;
  moveActiveIndex(delta: number): void;
  rememberSelection(
    field: VideoReferenceMentionField,
    selection: VideoReferenceMentionSelection,
  ): void;
  selectActiveMention(field: VideoReferenceMentionField): boolean;
  selectMention(field: VideoReferenceMentionField, label: string): void;
  setActiveField(field: VideoReferenceMentionField): void;
  setActiveIndex(index: number): void;
}

export function useVideoReferenceMentionController(
  options: VideoReferenceMentionControllerOptions,
): VideoReferenceMentionController {
  const [activeIndex, setActiveIndexState] = useState(0);
  const [activeField, setActiveFieldState] =
    useState<VideoReferenceMentionField>("final_prompt");
  const [dismissedQuery, setDismissedQuery] = useState<{
    field: VideoReferenceMentionField;
    query: string | null;
  } | null>(null);
  const selectionRef = useRef<
    Record<VideoReferenceMentionField, VideoReferenceMentionSelection | null>
  >({
    prompt_guidance: null,
    final_prompt: null,
  });
  const previousIdentityRef = useRef<{
    beatNumber: number;
    maps: VideoReferenceLabelIdentityMaps;
  } | null>(null);

  const referenceOptions = useMemo(
    () =>
      options.assets.filter(
        (asset) =>
          asset.reference_label &&
          asset.reference_label !== "未发送" &&
          asset.exists !== false,
      ),
    [options.assets],
  );
  const mentionLabels = useMemo(
    () => referenceOptions.map((asset) => asset.reference_label),
    [referenceOptions],
  );
  const identityMaps = useMemo(
    () => buildVideoReferenceLabelIdentityMaps(referenceOptions),
    [referenceOptions],
  );
  const mentionPreviews = useMemo(() => {
    const previews: Record<string, string> = {};
    for (const asset of referenceOptions) {
      if (asset.media_type !== "image") continue;
      const url = resolveMediaUrl(asset.url || asset.path);
      if (url) previews[asset.reference_label] = url;
    }
    return previews;
  }, [referenceOptions]);
  const mentionQuery = getVideoReferenceMentionQuery(
    options.draft[activeField],
  );
  const mentionOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.trim();
    return referenceOptions.filter((asset) => {
      const label = asset.reference_label;
      return !query || label.includes(query) || `@${label}`.includes(query);
    });
  }, [mentionQuery, referenceOptions]);
  const mentionOpen =
    mentionOptions.length > 0 &&
    !(
      dismissedQuery?.field === activeField &&
      dismissedQuery.query === mentionQuery
    );

  useEffect(() => {
    setActiveIndexState(0);
  }, [activeField, mentionQuery]);

  // Keep each mention bound to the same asset when the backend renumbers labels.
  useEffect(() => {
    if (!options.enabled) return;
    const previous = previousIdentityRef.current;
    previousIdentityRef.current = {
      beatNumber: options.beatNumber,
      maps: identityMaps,
    };
    if (!previous || previous.beatNumber !== options.beatNumber) return;
    if (sameVideoReferenceLabelIdentity(previous.maps, identityMaps)) return;
    options.changeDraft((current) => {
      const finalPrompt = remapVideoReferenceMentions(
        current.final_prompt,
        previous.maps,
        identityMaps,
      );
      const promptGuidance = remapVideoReferenceMentions(
        current.prompt_guidance,
        previous.maps,
        identityMaps,
      );
      if (
        finalPrompt === current.final_prompt &&
        promptGuidance === current.prompt_guidance
      ) {
        return current;
      }
      return {
        ...current,
        final_prompt: finalPrompt,
        prompt_guidance: promptGuidance,
      };
    });
  }, [
    identityMaps,
    options.beatNumber,
    options.changeDraft,
    options.enabled,
  ]);

  const insertReference = useCallback(
    (
      field: VideoReferenceMentionField,
      label: string,
      insertOptions: {
        replaceTrailingMention?: boolean;
        selection?: VideoReferenceMentionSelection;
      } = {},
    ) => {
      const token = `@${label} `;
      options.changeDraft((current) => {
        const rawText = current[field];
        const text = rawText.trimEnd();
        if (insertOptions.selection) {
          const start = Math.max(
            0,
            Math.min(insertOptions.selection.start, rawText.length),
          );
          const end = Math.max(
            start,
            Math.min(insertOptions.selection.end, rawText.length),
          );
          const after = rawText.slice(end).replace(/^\s+/, "");
          const nextText = normalizeMentionSeparatorSpaces(
            `${rawText.slice(0, start)}${token}${after}`,
            mentionLabels,
          ).text;
          return { ...current, [field]: nextText };
        }
        const mention = insertOptions.replaceTrailingMention
          ? findVideoReferenceTrailingMention(text)
          : null;
        const nextPrompt = text.endsWith("@")
          ? `${text.slice(0, -1)}${token}`
          : mention
            ? `${text.slice(0, mention.index)}${token}`
            : text
              ? `${text}\n${token}`
              : token;
        const nextText = normalizeMentionSeparatorSpaces(
          nextPrompt,
          mentionLabels,
        ).text;
        return { ...current, [field]: nextText };
      });
    },
    [mentionLabels, options.changeDraft],
  );

  const acceptsReference = useCallback(
    (label: string) =>
      referenceOptions.some((asset) => asset.reference_label === label),
    [referenceOptions],
  );

  const selectMention = useCallback(
    (field: VideoReferenceMentionField, label: string) => {
      setActiveFieldState(field);
      insertReference(field, label, { replaceTrailingMention: true });
      setDismissedQuery({ field, query: label });
    },
    [insertReference],
  );

  return {
    activeField,
    activeIndex,
    mentionLabels,
    mentionOpen,
    mentionOptions,
    mentionPreviews,
    mentionQuery,
    referenceOptions,
    acceptsReference,
    appendGuidanceTemplate: (template) => {
      options.changeDraft((current) => {
        if (current.prompt_guidance.includes(template)) return current;
        const promptGuidance = [current.prompt_guidance.trim(), template]
          .filter(Boolean)
          .join("\n");
        return { ...current, prompt_guidance: promptGuidance };
      });
    },
    appendReference: (field, label) => insertReference(field, label),
    dismissMention: (field) => {
      setDismissedQuery({
        field,
        query: getVideoReferenceMentionQuery(options.draft[field]),
      });
    },
    insertDroppedReference: (field, label, selection) => {
      if (!acceptsReference(label)) return false;
      setActiveFieldState(field);
      insertReference(field, label, {
        selection: selection ?? selectionRef.current[field] ?? undefined,
      });
      setDismissedQuery({ field, query: label });
      return true;
    },
    moveActiveIndex: (delta) => {
      const count = mentionOptions.length;
      setActiveIndexState((index) =>
        count > 0 ? (index + delta + count) % count : 0,
      );
    },
    rememberSelection: (field, selection) => {
      setActiveFieldState(field);
      selectionRef.current[field] = selection;
    },
    selectActiveMention: (field) => {
      const option =
        mentionOptions[Math.min(activeIndex, mentionOptions.length - 1)];
      if (!option) return false;
      selectMention(field, option.reference_label);
      return true;
    },
    selectMention,
    setActiveField: setActiveFieldState,
    setActiveIndex: setActiveIndexState,
  };
}
