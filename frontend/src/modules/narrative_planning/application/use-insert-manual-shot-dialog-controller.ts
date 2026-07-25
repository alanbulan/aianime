// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  extractIdentityMarkers,
  extractPropMarkers,
  mentionsToProgramMarkers,
  programMarkersToMentions,
} from "@/lib/mention-markers";
import { sceneNameToRef, sceneRefToName } from "@/lib/scene-ref";
import { timeOfDayOptions } from "@/lib/time-of-day";
import type { InsertManualShotParams } from "@/modules/narrative_planning/application/ports";
import type {
  Beat,
  Episode,
} from "@/modules/narrative_planning/domain/types";

export type ManualShotAudioType = "silence" | "narration" | "dialogue";

interface EpisodeBeatsQuery {
  data?: { data: Beat[] };
}

interface EpisodeDetailQuery {
  data?: { data: Episode };
}

interface InsertManualShotMutation {
  isPending: boolean;
  mutateAsync(
    command: InsertManualShotParams,
  ): Promise<{ ok: boolean; error?: string }>;
}

export interface InsertManualShotDialogControllerQueries {
  useEpisodeBeats(project: string, episode: number): EpisodeBeatsQuery;
  useEpisodeDetail(project: string, episode: number): EpisodeDetailQuery;
  useInsertManualShot(
    project: string,
    episode: number,
  ): InsertManualShotMutation;
}

export interface InsertManualShotDialogControllerOptions {
  afterBeatNumber: number | null;
  episode: number;
  onInserted?(): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  project: string;
  spineTemplate: "drama" | "narrated";
}

export interface InsertManualShotDialogController {
  audioType: ManualShotAudioType;
  duration: number;
  episodeIdentityIds: readonly string[];
  identitiesText: string;
  isNarratedProject: boolean;
  location: string;
  locationChoices: readonly string[];
  locationVariant: string;
  locationVariantChoices: readonly string[];
  mentionLabels: string[];
  narrationText: string;
  onAudioTypeChange(value: ManualShotAudioType): void;
  onDurationChange(value: number): void;
  onIdentitiesTextChange(value: string): void;
  onLocationChange(value: string): void;
  onLocationVariantChange(value: string): void;
  onNarrationTextChange(value: string): void;
  onOpenChange(open: boolean): void;
  onPropsTextChange(value: string): void;
  onSpeakerChange(value: string): void;
  onSubmit(): Promise<void>;
  onTimeOfDayChange(value: string): void;
  onVisualChange(value: string): void;
  open: boolean;
  placeholderIdentities: string;
  placeholderProps: string;
  propsText: string;
  speaker: string;
  submitting: boolean;
  timeChoices: readonly string[];
  timeOfDay: string;
  titleText: string;
  visual: string;
}

interface SceneRefRecord {
  base_scene_id?: string;
  scene_id: string;
  time_of_day?: string;
  variant_id?: string;
}

const DEFAULT_DURATION = 3;
const EMPTY_MANUAL_SHOT_VISUAL_DESCRIPTION = "\u200B";

function commaSeparatedValues(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createUseInsertManualShotDialogController(
  queries: InsertManualShotDialogControllerQueries,
) {
  return function useInsertManualShotDialogController({
    afterBeatNumber,
    episode,
    onInserted,
    onOpenChange,
    open,
    project,
    spineTemplate,
  }: InsertManualShotDialogControllerOptions): InsertManualShotDialogController {
    const { t } = useTranslation();
    const insertMutation = queries.useInsertManualShot(project, episode);
    const beatsQuery = queries.useEpisodeBeats(project, episode);
    const episodeQuery = queries.useEpisodeDetail(project, episode);
    const allBeats = useMemo(
      () => beatsQuery.data?.data ?? [],
      [beatsQuery.data],
    );
    const episodeData = episodeQuery.data?.data;
    const sceneRefRecords = useMemo<SceneRefRecord[]>(
      () =>
        (episodeData?.scene_menu ?? []).map((item) => ({
          scene_id: item.scene_id,
          base_scene_id: item.base_scene_id,
          variant_id: item.variant_id,
          time_of_day: item.time_of_day,
        })),
      [episodeData?.scene_menu],
    );
    const locationChoices = useMemo(() => {
      const locations = new Set<string>();
      for (const item of episodeData?.scene_menu ?? []) {
        const sceneId = item.scene_id?.trim();
        if (!sceneId) continue;
        const ref = sceneNameToRef(sceneId, sceneRefRecords);
        if (ref.scene_id) locations.add(ref.scene_id);
      }
      for (const beat of allBeats) {
        const name = (
          sceneRefToName(beat.scene_ref) ||
          beat.location ||
          ""
        ).trim();
        if (!name) continue;
        const ref = sceneNameToRef(name, sceneRefRecords);
        if (ref.scene_id) locations.add(ref.scene_id);
      }
      return Array.from(locations);
    }, [allBeats, episodeData?.scene_menu, sceneRefRecords]);
    const episodeIdentityIds = useMemo(
      () => episodeData?.identity_ids ?? [],
      [episodeData?.identity_ids],
    );
    const propIds = useMemo(
      () => (episodeData?.prop_menu ?? []).map((item) => item.prop_id),
      [episodeData?.prop_menu],
    );
    const isNarratedProject = spineTemplate === "narrated";

    const [visual, setVisual] = useState("");
    const [location, setLocation] = useState("");
    const [locationVariant, setLocationVariant] = useState("");
    const [timeOfDay, setTimeOfDay] = useState("");
    const [duration, setDuration] = useState(DEFAULT_DURATION);
    const [audioType, setAudioType] =
      useState<ManualShotAudioType>("silence");
    const [narrationText, setNarrationText] = useState("");
    const [speaker, setSpeaker] = useState("");
    const [identitiesText, setIdentitiesText] = useState("");
    const [propsText, setPropsText] = useState("");
    const [identityManuallyEdited, setIdentityManuallyEdited] =
      useState(false);
    const [propsManuallyEdited, setPropsManuallyEdited] = useState(false);
    const timeChoices = useMemo(
      () => timeOfDayOptions(timeOfDay),
      [timeOfDay],
    );
    const locationVariantChoices = useMemo(() => {
      const variants = new Set<string>();
      for (const record of sceneRefRecords) {
        if (record.time_of_day?.trim()) continue;
        const recordName = record.scene_id.trim();
        if (!recordName) continue;
        const ref = sceneNameToRef(recordName, sceneRefRecords);
        if (ref.plate_time_of_day) continue;
        if (ref.scene_id === location && ref.variant_id) {
          variants.add(ref.variant_id);
        }
      }
      return Array.from(variants);
    }, [location, sceneRefRecords]);

    const prefilledRef = useRef(false);
    useEffect(() => {
      if (!open) {
        prefilledRef.current = false;
        return;
      }
      if (prefilledRef.current) return;
      setVisual("");
      setLocation("");
      setLocationVariant("");
      setTimeOfDay("");
      setDuration(DEFAULT_DURATION);
      setAudioType("silence");
      setNarrationText("");
      setSpeaker("");
      setIdentitiesText("");
      setPropsText("");
      setIdentityManuallyEdited(false);
      setPropsManuallyEdited(false);
      prefilledRef.current = true;
    }, [open]);

    const onVisualChange = (next: string) => {
      const displayText = programMarkersToMentions(next);
      setVisual(displayText);
      const normalized = mentionsToProgramMarkers(displayText, {
        identities: episodeIdentityIds,
        props: propIds,
      });
      if (!identityManuallyEdited) {
        setIdentitiesText(extractIdentityMarkers(normalized).join(", "));
      }
      if (!propsManuallyEdited) {
        setPropsText(extractPropMarkers(normalized).join(", "));
      }
    };

    const onSubmit = async () => {
      const trimmedNarration = narrationText.trim();
      const trimmedSpeaker = speaker.trim();
      const selectedSpeaker = isNarratedProject
        ? episodeIdentityIds.includes(trimmedSpeaker)
          ? trimmedSpeaker
          : ""
        : "";
      if (audioType !== "silence" && !trimmedNarration) {
        toast.error(t("episode.workbench.insertManual.narrationRequired"));
        return;
      }
      if (isNarratedProject && audioType === "dialogue" && !selectedSpeaker) {
        toast.error(t("episode.workbench.insertManual.speakerRequired"));
        return;
      }
      const normalizedVisual = mentionsToProgramMarkers(visual.trim(), {
        identities: episodeIdentityIds,
        props: propIds,
      });
      const identityList = commaSeparatedValues(identitiesText);
      const propList = commaSeparatedValues(propsText);
      const detectedIdentities =
        identityList.length > 0
          ? identityList
          : extractIdentityMarkers(normalizedVisual);
      const detectedProps =
        propList.length > 0
          ? propList
          : extractPropMarkers(normalizedVisual);

      try {
        const selectedLocation = location.trim();
        const selectedVariant = locationVariant.trim();
        const response = await insertMutation.mutateAsync({
          after_beat_number: afterBeatNumber,
          visual_description:
            normalizedVisual.trim().length > 0
              ? normalizedVisual
              : EMPTY_MANUAL_SHOT_VISUAL_DESCRIPTION,
          duration_seconds: duration > 0 ? duration : DEFAULT_DURATION,
          scene_ref: selectedLocation
            ? { scene_id: selectedLocation, variant_id: selectedVariant }
            : null,
          time_of_day: timeOfDay.trim() || null,
          detected_identities:
            detectedIdentities.length > 0 ? detectedIdentities : null,
          detected_props: detectedProps.length > 0 ? detectedProps : null,
          audio_type: audioType,
          speaker:
            isNarratedProject && audioType === "dialogue"
              ? selectedSpeaker
              : null,
          narration_segment:
            audioType === "silence" ? null : trimmedNarration,
        });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        toast.success(t("episode.workbench.insertManual.success"));
        onOpenChange(false);
        onInserted?.();
      } catch {
        toast.error(t("common.error"));
      }
    };

    return {
      audioType,
      duration,
      episodeIdentityIds,
      identitiesText,
      isNarratedProject,
      location,
      locationChoices,
      locationVariant,
      locationVariantChoices,
      mentionLabels: [...episodeIdentityIds, ...propIds],
      narrationText,
      onAudioTypeChange: setAudioType,
      onDurationChange: setDuration,
      onIdentitiesTextChange: (value) => {
        setIdentityManuallyEdited(true);
        setIdentitiesText(value);
      },
      onLocationChange: (value) => {
        setLocation(value);
        setLocationVariant("");
      },
      onLocationVariantChange: setLocationVariant,
      onNarrationTextChange: setNarrationText,
      onOpenChange,
      onPropsTextChange: (value) => {
        setPropsManuallyEdited(true);
        setPropsText(value);
      },
      onSpeakerChange: setSpeaker,
      onSubmit,
      onTimeOfDayChange: setTimeOfDay,
      onVisualChange,
      open,
      placeholderIdentities: episodeIdentityIds.slice(0, 2).join(", "),
      placeholderProps: propIds.slice(0, 2).join(", "),
      propsText,
      speaker: episodeIdentityIds.includes(speaker) ? speaker : "",
      submitting: insertMutation.isPending,
      timeChoices,
      timeOfDay,
      titleText:
        afterBeatNumber === null
          ? t("episode.workbench.insertManual.titleBeforeFirst")
          : t("episode.workbench.insertManual.titleAfter", {
              n: afterBeatNumber,
            }),
      visual,
    };
  };
}
