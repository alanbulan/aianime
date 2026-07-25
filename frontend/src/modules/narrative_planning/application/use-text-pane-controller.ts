// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type {
  AssetRefType,
  SceneAsset,
} from "@/modules/asset_world/public";
import {
  extractIdentityMarkers,
  extractPropMarkers,
  mentionsToProgramMarkers,
  programMarkersToMentions,
} from "@/lib/mention-markers";
import {
  sceneNameToRef,
  sceneRefToName,
  type SceneRefRecordLike,
} from "@/lib/scene-ref";
import { timeOfDayOptions } from "@/lib/time-of-day";
import type {
  Beat,
  BeatUpdate,
  Episode,
} from "@/modules/narrative_planning/domain/types";

const NO_CHARACTER_MARKER = "__NO_CHARACTER__";
const NO_PROP_MARKER = "__NO_PROP__";

interface TextPaneDirtyFields {
  narration: boolean;
  visual: boolean;
  sceneRef: boolean;
  timeOfDay: boolean;
  speaker: boolean;
}

interface EpisodeDetailQuery {
  data?: { data: Episode };
}

interface ScenesQuery {
  data?: {
    data: Array<
      Pick<
        SceneAsset,
        "name" | "base_scene_id" | "variant_id" | "time_of_day"
      >
    >;
  };
}

interface ScenePlatePreviewQuery {
  data?:
    | {
        ok: true;
        data: { render?: { label?: string } };
      }
    | {
        ok: false;
        error?: string;
      };
}

interface UpdateBeatMutation {
  mutateAsync(command: {
    beatNum: number;
    data: BeatUpdate;
  }): Promise<unknown>;
}

export interface TextPaneControllerQueries {
  useEpisodeDetail(project: string, episode: number): EpisodeDetailQuery;
  useScenePlatePreview(
    project: string,
    sceneId: string,
    variantId: string,
    timeOfDay: string,
  ): ScenePlatePreviewQuery;
  useScenes(project: string): ScenesQuery;
  useUpdateBeat(project: string, episode: number): UpdateBeatMutation;
}

export interface TextPaneControllerDependencies {
  beatTextScope(
    project: string,
    episode: number,
    beatNumber: number,
  ): string;
  trackSave<T>(
    scope: string,
    operation: () => Promise<T>,
  ): Promise<T>;
  useAssetNavigation(
    project: string,
  ): (type: AssetRefType, id: string) => void;
}

export interface TextPaneControllerOptions {
  beat: Beat;
  episode: number;
  project: string;
  spineTemplate: "drama" | "narrated";
}

export interface TextPaneController {
  audioType: string;
  audioTypeOptions: readonly string[];
  baseSceneChoices: readonly string[];
  currentSceneRef: { scene_id: string; variant_id: string };
  episodeIdentityIds: readonly string[];
  hasIdentityDetectionState: boolean;
  identities: readonly string[];
  identityOptions: readonly string[];
  mentionLabels: string[];
  narration: string;
  noCharacterMarker: string;
  noPropMarker: string;
  onAudioTypeChange(value: string): void;
  onIdentityToggle(id: string): void;
  onJumpToAsset(type: AssetRefType, id: string): void;
  onNarrationBlur(): void;
  onNarrationChange(value: string): void;
  onPropToggle(id: string): void;
  onSceneChange(sceneId: string): void;
  onSceneVariantChange(variantId: string): void;
  onSpeakerChange(speaker: string): void;
  onTimeOfDayChange(timeOfDay: string): void;
  onVisualBlur(): void;
  onVisualChange(value: string): void;
  propOptions: readonly string[];
  props: readonly string[];
  sceneId: string;
  scenePlateLabel: string | null;
  sceneVariantChoices: readonly string[];
  speaker: string;
  spineTemplate: "drama" | "narrated";
  timeOfDay: string;
  timeOfDayChoices: readonly string[];
  visual: string;
}

export function createUseTextPaneController(
  queries: TextPaneControllerQueries,
  dependencies: TextPaneControllerDependencies,
) {
  return function useTextPaneController({
    beat,
    episode,
    project,
    spineTemplate,
  }: TextPaneControllerOptions): TextPaneController {
    const { t } = useTranslation();
    const navigateToAsset = dependencies.useAssetNavigation(project);
    const update = queries.useUpdateBeat(project, episode);
    const beatTextScope = dependencies.beatTextScope(
      project,
      episode,
      beat.beat_number,
    );
    const episodeQuery = queries.useEpisodeDetail(project, episode);
    const episodeIdentityIds = useMemo(
      () => episodeQuery.data?.data?.identity_ids ?? [],
      [episodeQuery.data],
    );
    const identityOptions = useMemo(
      () => [NO_CHARACTER_MARKER, ...episodeIdentityIds],
      [episodeIdentityIds],
    );
    const episodePropIds = useMemo(
      () => (episodeQuery.data?.data?.prop_menu ?? []).map((item) => item.prop_id),
      [episodeQuery.data],
    );
    const propOptions = useMemo(
      () => [NO_PROP_MARKER, ...episodePropIds],
      [episodePropIds],
    );
    const scenesQuery = queries.useScenes(project);
    // Scene records drive the split base/variant controls. Beat storage remains
    // canonical `{scene_id, variant_id}`; time-version plates stay out of writes.
    const sceneRefRecords = useMemo<SceneRefRecordLike[]>(
      () => [
        ...(scenesQuery.data?.data ?? []).map((scene) => ({
          name: scene.name,
          base_scene_id: scene.base_scene_id,
          variant_id: scene.variant_id,
          time_of_day: scene.time_of_day,
        })),
        ...(episodeQuery.data?.data?.scene_menu ?? []).map((item) => ({
          scene_id: item.scene_id,
          base_scene_id: item.base_scene_id,
          variant_id: item.variant_id,
          time_of_day: item.time_of_day,
        })),
      ],
      [scenesQuery.data, episodeQuery.data],
    );

    const [narration, setNarration] = useState(
      programMarkersToMentions(beat.narration_segment ?? ""),
    );
    const [visual, setVisual] = useState(
      programMarkersToMentions(beat.visual_description ?? ""),
    );
    const [audioType, setAudioType] = useState(beat.audio_type ?? "narration");
    const [sceneId, setSceneId] = useState(
      sceneRefToName(beat.scene_ref) || beat.location || "",
    );
    const [timeOfDay, setTimeOfDay] = useState(beat.time_of_day ?? "");

    const [speaker, setSpeaker] = useState(beat.speaker ?? "");

    const [identities, setIdentities] = useState<string[]>(
      beat.detected_identities ?? [],
    );
    const [props, setProps] = useState<string[]>(beat.detected_props ?? []);
    const dirtyRef = useRef<TextPaneDirtyFields>({
      narration: false,
      visual: false,
      sceneRef: false,
      timeOfDay: false,
      speaker: false,
    });
    const clearDirtyForPatch = (patch: BeatUpdate) => {
      if ("narration_segment" in patch) dirtyRef.current.narration = false;
      if ("visual_description" in patch) dirtyRef.current.visual = false;
      if ("scene_ref" in patch) dirtyRef.current.sceneRef = false;
      if ("time_of_day" in patch) dirtyRef.current.timeOfDay = false;
      if ("speaker" in patch) dirtyRef.current.speaker = false;
    };

    // Reset when beat_number changes (user selected a different beat).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
      setNarration(programMarkersToMentions(beat.narration_segment ?? ""));
      setVisual(programMarkersToMentions(beat.visual_description ?? ""));
      setAudioType(beat.audio_type ?? "narration");
      setSceneId(sceneRefToName(beat.scene_ref) || beat.location || "");
      setTimeOfDay(beat.time_of_day ?? "");
      setSpeaker(beat.speaker ?? "");
      setIdentities(beat.detected_identities ?? []);
      setProps(beat.detected_props ?? []);
      dirtyRef.current = {
        narration: false,
        visual: false,
        sceneRef: false,
        timeOfDay: false,
        speaker: false,
      };
    }, [beat.beat_number]);

    const saveField = async (patch: BeatUpdate) => {
      try {
        await dependencies.trackSave(beatTextScope, () =>
          update.mutateAsync({ beatNum: beat.beat_number, data: patch }),
        );
        clearDirtyForPatch(patch);
      } catch {
        toast.error(t("episode.workbench.text.saveFailed"));
      }
    };
    const blurIfChanged = <K extends keyof BeatUpdate>(
      key: K,
      next: BeatUpdate[K],
      original: BeatUpdate[K],
    ) => {
      if (next !== original) saveField({ [key]: next } as BeatUpdate);
    };
    const normalizeMentionText = (text: string) =>
      mentionsToProgramMarkers(text, {
        identities: episodeIdentityIds,
        props: episodePropIds,
      });
    const markerPatchForVisual = (text: string): Pick<
      BeatUpdate,
      "detected_identities" | "detected_props"
    > => {
      const next: Pick<BeatUpdate, "detected_identities" | "detected_props"> = {};
      const markerIdentities = extractIdentityMarkers(text);
      const markerProps = extractPropMarkers(text);
      if (markerIdentities.length > 0) next.detected_identities = markerIdentities;
      if (markerProps.length > 0) next.detected_props = markerProps;
      return next;
    };
    const saveNarration = () => {
      const normalized = normalizeMentionText(narration);
      blurIfChanged("narration_segment", normalized, beat.narration_segment ?? "");
    };
    const saveVisual = () => {
      const normalized = normalizeMentionText(visual);
      if (normalized === (beat.visual_description ?? "")) return;
      saveField({
        visual_description: normalized,
        ...markerPatchForVisual(normalized),
      });
    };

    const currentSceneRef = useMemo(
      () => sceneNameToRef(sceneId, sceneRefRecords),
      [sceneId, sceneRefRecords],
    );
    const scenePlatePreview = queries.useScenePlatePreview(
      project,
      currentSceneRef.scene_id,
      currentSceneRef.variant_id,
      timeOfDay,
    );
    const scenePlateRender = scenePlatePreview.data?.ok
      ? scenePlatePreview.data.data.render
      : null;

    const sceneNameForRef = (baseSceneId: string, variantId: string) => {
      const base = baseSceneId.trim();
      const variant = variantId.trim();
      if (!base) return "";
      for (const record of sceneRefRecords) {
        if (record.time_of_day?.trim()) continue;
        const recordName = String(record.name || record.scene_id || "").trim();
        if (!recordName) continue;
        const ref = sceneNameToRef(recordName, sceneRefRecords);
        if (ref.scene_id === base && ref.variant_id === variant) {
          return recordName;
        }
      }
      return sceneRefToName({ scene_id: base, variant_id: variant });
    };

    const saveSceneRefValue = (baseSceneId: string, variantId: string) => {
      const currentSceneId = sceneRefToName(beat.scene_ref) || beat.location || "";
      const currentRef = sceneNameToRef(currentSceneId, sceneRefRecords);
      const nextBase = baseSceneId.trim();
      const nextVariant = variantId.trim();
      if (
        nextBase !== currentRef.scene_id ||
        nextVariant !== currentRef.variant_id
      ) {
        const patch: BeatUpdate = {
          scene_ref: {
            scene_id: nextBase,
            variant_id: nextVariant,
          },
        };
        saveField({
          ...patch,
        });
      }
    };
    const baseSceneChoices = useMemo(() => {
      const set = new Set<string>();
      for (const record of sceneRefRecords) {
        if (record.time_of_day?.trim()) continue;
        const recordName = String(record.name || record.scene_id || "").trim();
        if (!recordName) continue;
        const ref = sceneNameToRef(recordName, sceneRefRecords);
        if (ref.scene_id) set.add(ref.scene_id);
      }
      if (currentSceneRef.scene_id) set.add(currentSceneRef.scene_id);
      return Array.from(set);
    }, [currentSceneRef.scene_id, sceneRefRecords]);
    const sceneVariantChoices = useMemo(() => {
      const set = new Set<string>();
      for (const record of sceneRefRecords) {
        if (record.time_of_day?.trim()) continue;
        const recordName = String(record.name || record.scene_id || "").trim();
        if (!recordName) continue;
        const ref = sceneNameToRef(recordName, sceneRefRecords);
        if (ref.scene_id === currentSceneRef.scene_id && ref.variant_id) {
          set.add(ref.variant_id);
        }
      }
      if (currentSceneRef.variant_id) set.add(currentSceneRef.variant_id);
      return Array.from(set);
    }, [currentSceneRef.scene_id, currentSceneRef.variant_id, sceneRefRecords]);

    // Latest-state ref — updated in useEffect (not during render) so the
    // unmount-flush cleanup reads values from the beat that was *committed*,
    // not values racing ahead of an incoming beat prop.
    const latestRef = useRef({
      narration,
      visual,
      sceneId,
      sceneRef: currentSceneRef,
      timeOfDay,
      speaker,
      identityIds: episodeIdentityIds,
      propIds: episodePropIds,
    });
    useEffect(() => {
      latestRef.current = {
        narration,
        visual,
        sceneId,
        sceneRef: currentSceneRef,
        timeOfDay,
        speaker,
        identityIds: episodeIdentityIds,
        propIds: episodePropIds,
      };
    });

    // Flush any dirty fields on beat switch / unmount.
    //
    // Everything the cleanup needs is *captured at setup time*. Previously we
    // stored `beat`, `update`, and `scope` in refs that were
    // reassigned during render — which meant the cleanup for beat N compared
    // beat N's form state against beat N+1's server snapshot, and PATCHed beat
    // N+1 with beat N's text. Capturing at setup binds the closure to the
    // right (project, episode, beatNumber) tuple.
    useEffect(() => {
      const capturedBeat = beat;
      const capturedScope = beatTextScope;
      const capturedMut = update;
      return () => {
        const latest = latestRef.current;
        const patches: BeatUpdate = {};
        const normalizedNarration = mentionsToProgramMarkers(latest.narration, {
          identities: latest.identityIds,
          props: latest.propIds,
        });
        const normalizedVisual = mentionsToProgramMarkers(latest.visual, {
          identities: latest.identityIds,
          props: latest.propIds,
        });
        const dirty = dirtyRef.current;
        if (dirty.narration && normalizedNarration !== (capturedBeat.narration_segment ?? ""))
          patches.narration_segment = normalizedNarration;
        if (dirty.visual && normalizedVisual !== (capturedBeat.visual_description ?? "")) {
          patches.visual_description = normalizedVisual;
          const markerIdentities = extractIdentityMarkers(normalizedVisual);
          const markerProps = extractPropMarkers(normalizedVisual);
          if (markerIdentities.length > 0) patches.detected_identities = markerIdentities;
          if (markerProps.length > 0) patches.detected_props = markerProps;
        }
        const capturedSceneId =
          sceneRefToName(capturedBeat.scene_ref) || capturedBeat.location || "";
        const capturedSceneRef = capturedBeat.scene_ref
          ? {
              scene_id: capturedBeat.scene_ref.scene_id || "",
              variant_id: capturedBeat.scene_ref.variant_id || "",
            }
          : { scene_id: capturedSceneId, variant_id: "" };
        if (
          dirty.sceneRef &&
          (latest.sceneRef.scene_id !== capturedSceneRef.scene_id ||
            latest.sceneRef.variant_id !== capturedSceneRef.variant_id)
        ) {
          patches.scene_ref = {
            scene_id: latest.sceneRef.scene_id,
            variant_id: latest.sceneRef.variant_id,
          };
        }
        if (dirty.timeOfDay && latest.timeOfDay !== (capturedBeat.time_of_day ?? ""))
          patches.time_of_day = latest.timeOfDay;
        if (dirty.speaker && latest.speaker !== (capturedBeat.speaker ?? ""))
          patches.speaker = latest.speaker;

        if (Object.keys(patches).length > 0) {
          // mutateAsync + trackSave — the promise chain survives unmount,
          // unlike inline mutate() callbacks which TanStack Query suppresses
          // once the observer unsubscribes.
          void dependencies.trackSave(capturedScope, () =>
            capturedMut.mutateAsync({
              beatNum: capturedBeat.beat_number,
              data: patches,
            }),
          ).catch(() => {
            // Error state already written by trackSave; swallow the rejection.
          });
        }
      };
    }, [beat.beat_number]);

    const toggleIdentity = (id: string) => {
      const currentReal = identities.filter((x) => x && x !== NO_CHARACTER_MARKER);
      const next =
        id === NO_CHARACTER_MARKER
          ? [NO_CHARACTER_MARKER]
          : identities.includes(id)
            ? currentReal.filter((x) => x !== id)
            : [...currentReal, id];
      const normalized = next.length > 0 ? next : [NO_CHARACTER_MARKER];
      setIdentities(normalized);
      saveField({ detected_identities: normalized });
    };
    const toggleProp = (id: string) => {
      const currentReal = props.filter((x) => x && x !== NO_PROP_MARKER);
      const next =
        id === NO_PROP_MARKER
          ? [NO_PROP_MARKER]
          : props.includes(id)
            ? currentReal.filter((x) => x !== id)
            : [...currentReal, id];
      const normalized = next.length > 0 ? next : [NO_PROP_MARKER];
      setProps(normalized);
      saveField({ detected_props: normalized });
    };
    const hasIdentityDetectionState = identities.some((id) => id.trim());
    const mentionLabels = useMemo(
      () => [...episodeIdentityIds, ...episodePropIds],
      [episodeIdentityIds, episodePropIds],
    );
    const audioTypeOptions = useMemo(
      () =>
        spineTemplate === "narrated"
          ? (["narration", "dialogue"] as const)
          : (["silence", "narration", "dialogue"] as const),
      [spineTemplate],
    );
    const timeOfDayChoices = useMemo(
      () => timeOfDayOptions(timeOfDay, beat.time_of_day),
      [beat.time_of_day, timeOfDay],
    );
    const onAudioTypeChange = (next: string) => {
      setAudioType(next);
      if (next === (beat.audio_type ?? "narration")) return;
      const patch: BeatUpdate = { audio_type: next };
      if (
        (spineTemplate !== "narrated" || next !== "dialogue") &&
        speaker.trim()
      ) {
        patch.speaker = "";
        setSpeaker("");
      }
      saveField(patch);
    };
    const onSceneChange = (nextBase: string) => {
      const nextSceneId = sceneNameForRef(nextBase, "");
      dirtyRef.current.sceneRef = true;
      setSceneId(nextSceneId);
      saveSceneRefValue(nextBase, "");
    };
    const onSceneVariantChange = (nextVariant: string) => {
      const nextSceneId = sceneNameForRef(
        currentSceneRef.scene_id,
        nextVariant,
      );
      dirtyRef.current.sceneRef = true;
      setSceneId(nextSceneId);
      saveSceneRefValue(currentSceneRef.scene_id, nextVariant);
    };
    const onTimeOfDayChange = (next: string) => {
      dirtyRef.current.timeOfDay = true;
      setTimeOfDay(next);
      if (next !== (beat.time_of_day ?? "")) {
        saveField({ time_of_day: next });
      }
    };
    const onSpeakerChange = (next: string) => {
      dirtyRef.current.speaker = true;
      setSpeaker(next);
      if (next !== (beat.speaker ?? "")) {
        saveField({ speaker: next });
      }
    };

    return {
      audioType,
      audioTypeOptions,
      baseSceneChoices,
      currentSceneRef,
      episodeIdentityIds,
      hasIdentityDetectionState,
      identities,
      identityOptions,
      mentionLabels,
      narration,
      noCharacterMarker: NO_CHARACTER_MARKER,
      noPropMarker: NO_PROP_MARKER,
      onAudioTypeChange,
      onIdentityToggle: toggleIdentity,
      onJumpToAsset: navigateToAsset,
      onNarrationBlur: saveNarration,
      onNarrationChange: (value) => {
        dirtyRef.current.narration = true;
        setNarration(value);
      },
      onPropToggle: toggleProp,
      onSceneChange,
      onSceneVariantChange,
      onSpeakerChange,
      onTimeOfDayChange,
      onVisualBlur: saveVisual,
      onVisualChange: (value) => {
        dirtyRef.current.visual = true;
        setVisual(value);
      },
      propOptions,
      props,
      sceneId,
      scenePlateLabel: scenePlateRender?.label ?? null,
      sceneVariantChoices,
      speaker,
      spineTemplate,
      timeOfDay,
      timeOfDayChoices,
      visual,
    };
  };
}
