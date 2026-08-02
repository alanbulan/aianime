// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";

import {
  type CanvasCommitMediaType,
  GLOBAL_SLOT_KINDS,
  KIND_LABELS,
  SCENE_SLOT_KINDS,
  buildCommitTarget,
  firstIdentityOptionValue,
  getFreezoneAssetImpact as previewAssetImpact,
  identityOptionValue,
  identityOptionsForSelect,
  isUserSelectableCommitKind,
  modelSlotKindsForNodeData,
  renderCommitTargetLabel,
  sceneOptionValue,
  type ImpactBeat,
  type PushTarget,
  type PushTargetKind,
} from "@/modules/creative_canvas/public";
import {
  listCharacterIdentities,
  listCharacters,
  listScenes,
  type Character,
  type Identity,
  type SceneAsset,
} from "@/modules/asset_world/public";
import {
  listBeats,
  listEpisodes,
  type Episode,
} from "@/modules/narrative_planning/public";

export interface CommitDialogTargetControllerOptions {
  project: string;
  sourceUrl: string;
  mediaType: CanvasCommitMediaType;
  defaultTarget?: Partial<PushTarget> & { kind: PushTargetKind };
  nodeData?: Record<string, unknown> | null;
}

export function useCommitDialogTargetController({
  project,
  sourceUrl,
  mediaType,
  defaultTarget,
  nodeData,
}: CommitDialogTargetControllerOptions) {
  const modelSlotKinds =
    mediaType === "model"
      ? modelSlotKindsForNodeData(nodeData, sourceUrl)
      : [];
  const defaultKind = defaultTarget?.kind;
  const initialKind =
    mediaType === "video"
      ? "video"
      : mediaType === "audio"
        ? "beat_audio"
        : mediaType === "model"
          ? defaultKind &&
            (defaultKind === "scene_director_world" ||
              modelSlotKinds.includes(defaultKind))
            ? defaultKind
            : modelSlotKinds[0] ?? "scene_3gs_custom_scene"
          : defaultKind ?? "frame";
  const [kind, setKind] = useState<PushTargetKind>(initialKind);
  const [episode, setEpisode] = useState<number | null>(
    typeof (defaultTarget as { episode?: number })?.episode === "number"
      ? (defaultTarget as { episode: number }).episode
      : null,
  );
  const [beat, setBeat] = useState<number | null>(
    typeof (defaultTarget as { beat?: number })?.beat === "number"
      ? (defaultTarget as { beat: number }).beat
      : null,
  );
  const [character, setCharacter] = useState<string | null>(
    typeof (defaultTarget as { character?: string })?.character === "string"
      ? (defaultTarget as { character: string }).character
      : null,
  );
  const [identityId, setIdentityId] = useState<string | null>(
    typeof (defaultTarget as { identity_id?: string })?.identity_id === "string"
      ? (defaultTarget as { identity_id: string }).identity_id
      : null,
  );
  const [sceneId, setSceneId] = useState(
    typeof (defaultTarget as { scene_id?: string })?.scene_id === "string"
      ? (defaultTarget as { scene_id: string }).scene_id
      : "",
  );
  const [propId, setPropId] = useState(
    typeof (defaultTarget as { prop_id?: string })?.prop_id === "string"
      ? (defaultTarget as { prop_id: string }).prop_id
      : "",
  );
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [scenes, setScenes] = useState<SceneAsset[]>([]);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [beatOptions, setBeatOptions] = useState<number[]>([]);
  const [beatsLoading, setBeatsLoading] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [identityOptions, setIdentityOptions] = useState<Identity[]>([]);
  const [identitiesLoading, setIdentitiesLoading] = useState(false);
  const [impactBeats, setImpactBeats] = useState<ImpactBeat[]>([]);
  const [impactLoading, setImpactLoading] = useState(false);
  const [markStale, setMarkStale] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loadedCharacters, loadedEpisodes] = await Promise.all([
          listCharacters(project),
          listEpisodes(project),
        ]);
        if (cancelled) return;
        setCharacters(loadedCharacters);
        setEpisodes(loadedEpisodes);
        if (episode === null && loadedEpisodes.length > 0) {
          setEpisode(loadedEpisodes[0].number);
        }
        if (character === null && loadedCharacters.length > 0) {
          setCharacter(loadedCharacters[0].name);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "加载选项失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  useEffect(() => {
    let cancelled = false;
    setScenesLoading(true);
    void (async () => {
      try {
        const sceneAssets = await listScenes(project);
        if (cancelled) return;
        setScenes(sceneAssets);
        setSceneId(
          (current) => current.trim() || sceneOptionValue(sceneAssets[0]) || "",
        );
      } catch {
        if (cancelled) return;
        setScenes([]);
      } finally {
        if (!cancelled) setScenesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  useEffect(() => {
    let cancelled = false;
    if (episode === null) {
      setBeatOptions([]);
      setBeat(null);
      setBeatsLoading(false);
      return;
    }
    setBeatsLoading(true);
    void (async () => {
      try {
        const beats = await listBeats(project, episode);
        if (cancelled) return;
        const options = beats
          .map((item, index) => {
            if (
              typeof item.beat_number === "number" &&
              Number.isFinite(item.beat_number)
            ) {
              return item.beat_number;
            }
            if (
              typeof item.beat_index === "number" &&
              Number.isFinite(item.beat_index)
            ) {
              return item.beat_index > 0
                ? item.beat_index
                : item.beat_index + 1;
            }
            return index + 1;
          })
          .filter((value) => value > 0);
        const uniqueOptions = Array.from(new Set(options));
        setBeatOptions(uniqueOptions);
        setBeat((current) => {
          if (uniqueOptions.length === 0) return null;
          return current !== null && uniqueOptions.includes(current)
            ? current
            : uniqueOptions[0];
        });
      } catch {
        if (cancelled) return;
        setBeatOptions([]);
        setBeat(null);
      } finally {
        if (!cancelled) setBeatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project, episode]);

  const isBeatStyle =
    kind === "frame" ||
    kind === "sketch" ||
    kind === "director_render" ||
    kind === "selected_background" ||
    kind === "video" ||
    kind === "beat_audio";
  const isIdentityStyle =
    kind === "identity" ||
    kind === "identity_costume" ||
    kind === "identity_portrait" ||
    kind === "portrait";
  const needsIdentityId =
    kind === "identity" ||
    kind === "identity_costume" ||
    kind === "identity_portrait";
  const isSceneStyle = SCENE_SLOT_KINDS.has(kind);
  const isPropStyle = kind === "prop_ref";
  const isGlobalSlot = GLOBAL_SLOT_KINDS.has(kind);
  const modelCommitKindAllowed =
    mediaType !== "model" ||
    kind === "scene_director_world" ||
    modelSlotKinds.includes(kind);
  const noTargetYet = mediaType === "model" && !modelCommitKindAllowed;
  const noModelSourceForSlotCommit =
    mediaType === "model" && modelSlotKinds.length === 0;
  const showTargetKindSelect =
    mediaType === "image" ||
    (mediaType === "model" && kind !== "scene_director_world");
  const targetKindOptions = Object.entries(KIND_LABELS).filter(([value]) => {
    const optionKind = value as PushTargetKind;
    if (!isUserSelectableCommitKind(optionKind)) return false;
    return mediaType === "model" ? modelSlotKinds.includes(optionKind) : true;
  });

  useEffect(() => {
    let cancelled = false;
    if (!needsIdentityId || !character) {
      setIdentityOptions([]);
      setIdentitiesLoading(false);
      return;
    }

    const embeddedIdentities =
      characters.find((candidate) => candidate.name === character)
        ?.identities ?? [];
    if (embeddedIdentities.length > 0) {
      setIdentityOptions(embeddedIdentities);
      setIdentitiesLoading(false);
      setIdentityId((current) => {
        if (
          current &&
          embeddedIdentities.some(
            (item) => identityOptionValue(item) === current,
          )
        ) {
          return current;
        }
        return current || firstIdentityOptionValue(embeddedIdentities);
      });
      return;
    }

    setIdentitiesLoading(true);
    void (async () => {
      try {
        const identities = await listCharacterIdentities(project, character);
        if (cancelled) return;
        setIdentityOptions(identities);
        setIdentityId((current) => {
          if (
            current &&
            identities.some((item) => identityOptionValue(item) === current)
          ) {
            return current;
          }
          return current || firstIdentityOptionValue(identities);
        });
      } catch (caught) {
        if (cancelled) return;
        setIdentityOptions([]);
        setIdentityId(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "加载 identity_id 失败",
        );
      } finally {
        if (!cancelled) setIdentitiesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project, character, characters, needsIdentityId]);

  const displayedIdentityOptions = identityOptionsForSelect(
    identityOptions,
    identityId,
  );
  const target = buildCommitTarget(
    kind,
    episode,
    beat,
    character,
    identityId,
    sceneId,
    propId,
  );
  const targetLabel = target
    ? renderCommitTargetLabel(target)
    : "目标未完整";

  useEffect(() => {
    let cancelled = false;
    if (!target || !GLOBAL_SLOT_KINDS.has(target.kind)) {
      setImpactBeats([]);
      setImpactLoading(false);
      return;
    }
    setImpactLoading(true);
    void (async () => {
      try {
        const result = await previewAssetImpact(project, target);
        if (cancelled) return;
        setImpactBeats(result.affected_beats ?? []);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setImpactBeats([]);
      } finally {
        if (!cancelled) setImpactLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project, kind, episode, beat, character, identityId, sceneId, propId]);

  return {
    modelSlotKinds,
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
    setError,
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
  };
}
