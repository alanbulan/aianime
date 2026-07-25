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
  buildSeedance2LabelIdentityMaps,
  findSeedance2TrailingMention,
  getSeedance2MentionQuery,
  remapSeedance2Mentions,
  sameSeedance2LabelIdentity,
  type Seedance2LabelIdentityMaps,
} from "@/modules/production/domain/seedance2-mentions";
import type { Seedance2AssetItem } from "@/modules/production/domain/seedance2-panel";
import type { Seedance2ConfigDraft } from "@/modules/production/domain/video-config";

export type Seedance2MentionField = "prompt_guidance" | "final_prompt";

export interface Seedance2MentionSelection {
  end: number;
  start: number;
}

export interface Seedance2MentionControllerOptions {
  assets: Seedance2AssetItem[];
  beatNumber: number;
  changeDraft(
    updater: (current: Seedance2ConfigDraft) => Seedance2ConfigDraft,
  ): void;
  draft: Seedance2ConfigDraft;
  enabled: boolean;
}

export interface Seedance2MentionController {
  activeField: Seedance2MentionField;
  activeIndex: number;
  mentionLabels: string[];
  mentionOpen: boolean;
  mentionOptions: Seedance2AssetItem[];
  mentionPreviews: Record<string, string>;
  mentionQuery: string | null;
  referenceOptions: Seedance2AssetItem[];
  acceptsReference(label: string): boolean;
  appendGuidanceTemplate(template: string): void;
  appendReference(field: Seedance2MentionField, label: string): void;
  dismissMention(field: Seedance2MentionField): void;
  insertDroppedReference(
    field: Seedance2MentionField,
    label: string,
    selection?: Seedance2MentionSelection,
  ): boolean;
  moveActiveIndex(delta: number): void;
  rememberSelection(
    field: Seedance2MentionField,
    selection: Seedance2MentionSelection,
  ): void;
  selectActiveMention(field: Seedance2MentionField): boolean;
  selectMention(field: Seedance2MentionField, label: string): void;
  setActiveField(field: Seedance2MentionField): void;
  setActiveIndex(index: number): void;
}

export function useSeedance2MentionController(
  options: Seedance2MentionControllerOptions,
): Seedance2MentionController {
  const [activeIndex, setActiveIndexState] = useState(0);
  const [activeField, setActiveFieldState] =
    useState<Seedance2MentionField>("final_prompt");
  const [dismissedQuery, setDismissedQuery] = useState<{
    field: Seedance2MentionField;
    query: string | null;
  } | null>(null);
  const selectionRef = useRef<
    Record<Seedance2MentionField, Seedance2MentionSelection | null>
  >({
    prompt_guidance: null,
    final_prompt: null,
  });
  const previousIdentityRef = useRef<{
    beatNumber: number;
    maps: Seedance2LabelIdentityMaps;
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
    () => buildSeedance2LabelIdentityMaps(referenceOptions),
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
  const mentionQuery = getSeedance2MentionQuery(
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
    if (sameSeedance2LabelIdentity(previous.maps, identityMaps)) return;
    options.changeDraft((current) => {
      const finalPrompt = remapSeedance2Mentions(
        current.final_prompt,
        previous.maps,
        identityMaps,
      );
      const promptGuidance = remapSeedance2Mentions(
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
      field: Seedance2MentionField,
      label: string,
      insertOptions: {
        replaceTrailingMention?: boolean;
        selection?: Seedance2MentionSelection;
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
          ? findSeedance2TrailingMention(text)
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
    (field: Seedance2MentionField, label: string) => {
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
        query: getSeedance2MentionQuery(options.draft[field]),
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
