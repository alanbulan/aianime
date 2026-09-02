// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAssetsDeepLink } from "./useAssetsDeepLink";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useTaskStream } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import type { CharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import type { ImageSourceQueryHooks } from "@/modules/asset_world/application/image-source-query-hooks";
import {
  characterMainCopyForSpineTemplate,
  filterCharacters,
  type AssetRefType,
  type AssetTab,
} from "@/modules/asset_world/domain/character";
import {
  backendErrorResponseToastMessage,
  backendErrorToastMessage,
} from "@/shared/api/errors";

const TAB_BY_ASSET_TYPE: Record<AssetRefType, AssetTab> = {
  identity: "characters",
  scene: "scenes",
  prop: "props",
};

const ASSET_TYPE_BY_TAB: Partial<Record<AssetTab, AssetRefType>> = {
  characters: "identity",
  scenes: "scene",
  props: "prop",
};

interface ProjectQuery {
  data?: {
    narration_style?: string | null;
    spine_template?: string | null;
  };
}

export interface CharactersPageControllerDependencies {
  readStoredAssetTab(project: string): AssetTab;
  useProject(project: string): ProjectQuery;
  writeStoredAssetTab(project: string, tab: AssetTab): void;
}

export function createUseCharactersPageController(
  characterQueries: CharacterQueryHooks,
  imageSourceQueries: ImageSourceQueryHooks,
  dependencies: CharactersPageControllerDependencies,
) {
  return function useCharactersPageController(project: string) {
    const { t } = useTranslation();
    const { data: charactersResponse, isLoading } =
      characterQueries.useCharacters(project);
    const { data: projectResponse } = dependencies.useProject(project);
    const { data: imageSelectionResponse } =
      imageSourceQueries.useCharacterImageSelection(project);
    const buildCharacters = characterQueries.useBuildCharacters(project);
    const identityOwnerIndex =
      characterQueries.useIdentityOwnerIndex(project);
    const isDesktop = useMediaQuery("(min-width: 1024px)");
    const deepLink = useAssetsDeepLink();
    const appliedIdentityDeepLink = useRef<string | null>(null);

    const [selectedName, setSelectedName] = useState<string | null>(null);
    const [buildStarted, setBuildStarted] = useState(false);
    const [rebuildDialogOpen, setRebuildDialogOpen] = useState(false);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [attempts, setAttempts] = useState<Record<string, number>>({});
    const [assetTab, setAssetTab] = useState<AssetTab>(() =>
      deepLink.type
        ? TAB_BY_ASSET_TYPE[deepLink.type]
        : dependencies.readStoredAssetTab(project),
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [imageModel, setImageModel] = useState("");

    const taskStream = useTaskStream({
      taskType: "build_characters",
      project,
      episode: 0,
      enabled: buildStarted,
      invalidateKeys: [queryKeys.characters(project)],
      onComplete: () => setBuildStarted(false),
      onError: () => setBuildStarted(false),
    });

    const characters = charactersResponse?.data ?? [];
    const savedImageModel =
      imageSelectionResponse?.data.character_image_selection ?? "";
    const narratorMain = useMemo(
      () => characters.find((character) => character.is_main) ?? null,
      [characters],
    );
    const isNarratedFirstPerson =
      projectResponse?.spine_template === "narrated" &&
      projectResponse?.narration_style === "first_person";
    const mainCopy = characterMainCopyForSpineTemplate(
      projectResponse?.spine_template,
      projectResponse?.narration_style,
    );
    const filteredCharacters = useMemo(
      () => filterCharacters(characters, searchQuery),
      [characters, searchQuery],
    );

    useEffect(() => {
      setImageModel(savedImageModel);
    }, [savedImageModel]);

    useEffect(() => {
      if (deepLink.type) setAssetTab(TAB_BY_ASSET_TYPE[deepLink.type]);
      else setAssetTab(dependencies.readStoredAssetTab(project));
    }, [deepLink.type, project]);

    const selectedCharacter = selectedName
      ? (filteredCharacters.find(
          (character) => character.name === selectedName,
        ) ?? null)
      : null;

    useEffect(() => {
      if (!selectedName && filteredCharacters.length > 0) {
        setSelectedName(filteredCharacters[0].name);
      } else if (
        selectedName &&
        !filteredCharacters.some(
          (character) => character.name === selectedName,
        )
      ) {
        setSelectedName(filteredCharacters[0]?.name ?? null);
      }
    }, [filteredCharacters, selectedName]);

    const identityDeepLinkId =
      deepLink.type === "identity" ? deepLink.id : null;
    const identityOwner = identityDeepLinkId
      ? identityOwnerIndex.ownerOf(identityDeepLinkId)
      : null;
    useEffect(() => {
      if (!identityDeepLinkId || !identityOwner) return;
      if (appliedIdentityDeepLink.current === identityDeepLinkId) return;
      setSelectedName(identityOwner);
      appliedIdentityDeepLink.current = identityDeepLinkId;
    }, [identityDeepLinkId, identityOwner]);

    const handleBuild = async () => {
      setRebuildDialogOpen(false);
      try {
        const response = await buildCharacters.mutateAsync();
        if (response.ok === false) {
          toast.error(backendErrorResponseToastMessage(response, t));
          return;
        }
        setBuildStarted(true);
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handleAssetTabChange = (next: AssetTab) => {
      dependencies.writeStoredAssetTab(project, next);
      setAssetTab(next);
      const assetRefType = ASSET_TYPE_BY_TAB[next];
      if (assetRefType) deepLink.select(assetRefType);
    };

    const handleAttempt = (name: string) => {
      setAttempts((current) => ({
        ...current,
        [name]: (current[name] ?? 0) + 1,
      }));
    };

    const selectNarratorMain = () => {
      if (!narratorMain) return;
      dependencies.writeStoredAssetTab(project, "characters");
      setAssetTab("characters");
      setSelectedName(narratorMain.name);
    };

    return {
      addDialogOpen,
      assetFocusId: deepLink.id,
      assetTab,
      buildStarted,
      characters,
      filteredCharacters,
      handleAssetTabChange,
      handleAttempt,
      handleBuild,
      imageModel,
      isDesktop,
      isLoading,
      isNarratedFirstPerson,
      mainCopy,
      narratorMain,
      openAddDialog: () => setAddDialogOpen(true),
      openRebuildDialog: () => setRebuildDialogOpen(true),
      project,
      rebuildDialogOpen,
      rebuildDisabled: buildCharacters.isPending || buildStarted,
      searchQuery,
      selectCharacter: setSelectedName,
      selectedAttemptCount: selectedCharacter
        ? (attempts[selectedCharacter.name] ?? 0)
        : 0,
      selectedCharacter,
      selectedName,
      selectNarratorMain,
      setAddDialogOpen,
      setImageModel,
      setRebuildDialogOpen,
      setSearchQuery,
      taskStream,
    };
  };
}

export type CharactersPageController = ReturnType<
  ReturnType<typeof createUseCharactersPageController>
>;
