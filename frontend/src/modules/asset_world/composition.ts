import { createElement } from "react";

import { CharacterImageSourceSelect } from "@/components/assets/character-image-source-select";
import { NarratorVoicePanel } from "@/components/episode/beat-workbench/narrator-voice-panel";
import { PropsPanel } from "@/components/assets/props-panel";
import { ScenesPanel } from "@/components/assets/scenes-panel";
import { TaskControllerProvider } from "@/components/episode/task-controller-provider";
import { openPresetProjectionInMyCanvas } from "@/features/freezone/openPresetProjection";
import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import { isCeRuntime } from "@/lib/runtime-config";
import { useAssetReferenceIndex } from "@/modules/asset_world/application/use-asset-reference-index";
import { createCharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import { createImageSourceQueryHooks } from "@/modules/asset_world/application/image-source-query-hooks";
import { createPropQueryHooks } from "@/modules/asset_world/application/prop-query-hooks";
import { createSceneQueryHooks } from "@/modules/asset_world/application/scene-query-hooks";
import { createStyleQueryHooks } from "@/modules/asset_world/application/style-query-hooks";
import { createUseAddCharacterController } from "@/modules/asset_world/application/use-add-character-controller";
import { createUseCharacterAssetHistoryController } from "@/modules/asset_world/application/use-character-asset-history-controller";
import { createUseCharacterDetailController } from "@/modules/asset_world/application/use-character-detail-controller";
import { createUseCharacterVoiceController } from "@/modules/asset_world/application/use-character-voice-controller";
import { createUseCharactersPageController } from "@/modules/asset_world/application/use-characters-page-controller";
import { createUseCreateStyleController } from "@/modules/asset_world/application/use-create-style-controller";
import { createUseIdentitiesGridController } from "@/modules/asset_world/application/use-identities-grid-controller";
import {
  createUseIdentityCardController,
  type IdentityCardControllerOptions,
} from "@/modules/asset_world/application/use-identity-card-controller";
import { createUseStyleDetailController } from "@/modules/asset_world/application/use-style-detail-controller";
import { createUseStylesPageController } from "@/modules/asset_world/application/use-styles-page-controller";
import type {
  Character,
  CharacterAssetKind,
} from "@/modules/asset_world/domain/character";
import type { SceneAsset } from "@/modules/asset_world/domain/scene";
import type { Style } from "@/modules/asset_world/domain/style";
import {
  readStoredAssetTab,
  writeStoredAssetTab,
} from "@/modules/asset_world/infrastructure/asset-tab-storage";
import { createBrowserVoiceRecorder } from "@/modules/asset_world/infrastructure/browser-voice-recorder";
import { httpCharacterGateway } from "@/modules/asset_world/infrastructure/http-character-gateway";
import { httpAssetWorldGateway } from "@/modules/asset_world/infrastructure/http-asset-world-gateway";
import { httpImageSourceGateway } from "@/modules/asset_world/infrastructure/http-image-source-gateway";
import { httpPropGateway } from "@/modules/asset_world/infrastructure/http-prop-gateway";
import { httpSceneGateway } from "@/modules/asset_world/infrastructure/http-scene-gateway";
import { stylePreviewUrl } from "@/modules/asset_world/infrastructure/style-preview-url";
import {
  AddCharacterDialogView,
  CharacterAssetHistoryButtonView,
  CharacterDetailView,
  CharactersPageView,
  EmptyCharacterDetailView,
  IdentitiesGridSectionView,
  IdentityCardView,
} from "@/modules/asset_world/presentation/CharactersPageView";
import { CharacterVoicePanelView } from "@/modules/asset_world/presentation/CharacterVoicePanelView";
import {
  CreateStyleDialogView,
  StyleDetailView,
  StylesPageView,
} from "@/modules/asset_world/presentation/StylesPageView";
import {
  useProject,
  useUpdateProject,
} from "@/modules/project_workspace/public";

const styleQueries = createStyleQueryHooks(httpAssetWorldGateway);
const characterQueries = createCharacterQueryHooks(httpCharacterGateway);
const imageSourceQueries = createImageSourceQueryHooks(
  httpImageSourceGateway,
);
const propQueries = createPropQueryHooks(httpPropGateway);
const sceneQueries = createSceneQueryHooks(httpSceneGateway);

export const {
  useBatchGeneratePropReferences,
  useCreateProp,
  useDeleteProp,
  useGeneratePropReferenceAsync,
  useProps,
  useUpdateProp,
  useUploadPropReference,
} = propQueries;

export const {
  useBuildScenes,
  useClearSceneDirectorWorld,
  useCreateScene,
  useDeleteScene,
  useDeleteSceneCustomPackage,
  useDeleteSceneMaster,
  useDeleteScenePano,
  useGenerateScene3gsPlyAsync,
  useGenerateSceneMasterAsync,
  useGenerateScenePanoAsync,
  useGenerateSceneReverseAsync,
  useSaveSceneDirectorWorld,
  useSceneDirectorStageManifest,
  useScenePanoManifest,
  useScenePlatePreview,
  useScenes,
  useUpdateScene,
  useUpdateScenePanoCorrection,
  useUploadSceneCustomPackage,
  useUploadSceneMaster,
  useUploadScenePano,
} = sceneQueries;

export { useAssetReferenceIndex };

export async function listScenes(project: string): Promise<SceneAsset[]> {
  const response = await httpSceneGateway.listScenes(project);
  return response.data;
}

export const {
  useBuildCharacters,
  useCharacterAssetHistory,
  useCharacterIdentities,
  useCharacters,
  useCharacterVoiceSamples,
  useCreateCharacter,
  useCreateIdentity,
  useDeleteCharacter,
  useDeleteCharacterVoiceSample,
  useDeleteIdentity,
  useDeleteIdentityCostume,
  useDeleteIdentityImage,
  useGenerateIdentityImageAsync,
  useGenerateIdentityPortraitAsync,
  useGeneratePortraitAsync,
  useIdentityAttempts,
  useIdentityOwnerIndex,
  useRecordCharacterVoiceSample,
  useRestoreCharacterAsset,
  useTrimCharacterVoiceSample,
  useUpdateCharacter,
  useUpdateIdentity,
  useUploadCharacterVoiceSample,
  useUploadCostumeImage,
  useUploadIdentityImage,
  useUploadIdentityPortrait,
  useUploadPortrait,
} = characterQueries;

export const {
  useAssetImageSourceSelection,
  useCharacterImageSelection,
  useUpdateAssetImageSourceSelection,
} = imageSourceQueries;

export const {
  stylesQueryOptions,
  useAnalyzeStyle,
  useCreateStyle,
  useDeleteStyle,
  useStyleDetail,
  useStyles,
  useUploadStylePreview,
} = styleQueries;

const useStylesPageController = createUseStylesPageController(styleQueries, {
  stylePreviewUrl,
  useProject,
});
const useStyleDetailController = createUseStyleDetailController(styleQueries, {
  stylePreviewUrl,
  useUpdateProject,
});
const useCreateStyleController = createUseCreateStyleController(styleQueries, {
  useGenerationCreditCost,
});
const useCharactersPageController = createUseCharactersPageController(
  characterQueries,
  imageSourceQueries,
  {
    readStoredAssetTab,
    useGenerationCreditCost,
    useProject,
    writeStoredAssetTab,
  },
);
const useAddCharacterController =
  createUseAddCharacterController(characterQueries);
const useCharacterAssetHistoryController =
  createUseCharacterAssetHistoryController(characterQueries);
const useCharacterDetailController = createUseCharacterDetailController(
  characterQueries,
  {
    openCharacterFreezone: (project, characterName) =>
      openPresetProjectionInMyCanvas(project, {
        scope: "asset",
        asset_kind: "character",
        character: characterName,
      }),
    useGenerationCreditCost,
  },
);
const useCharacterVoiceController = createUseCharacterVoiceController(
  characterQueries,
  { createVoiceRecorder: createBrowserVoiceRecorder },
);
const useIdentityCardController = createUseIdentityCardController(
  characterQueries,
  { isCeRuntime, useGenerationCreditCost },
);
const useIdentitiesGridController = createUseIdentitiesGridController(
  characterQueries,
  { useAssetReferenceIndex },
);

function StyleDetailContent({
  isProjectDefault,
  onClearSelection,
  project,
  style,
}: {
  isProjectDefault: boolean;
  onClearSelection(): void;
  project: string;
  style: Style;
}) {
  const controller = useStyleDetailController({
    isProjectDefault,
    onClearSelection,
    project,
    style,
  });
  return createElement(StyleDetailView, { controller });
}

function CreateStyleDialogContent({
  onCreated,
  onOpenChange,
  open,
  project,
}: {
  onCreated(styleId: string): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  project: string;
}) {
  const controller = useCreateStyleController({
    onCreated,
    onOpenChange,
    open,
    project,
  });
  return createElement(CreateStyleDialogView, { controller });
}

export function StylesPageContent({ project }: { project: string }) {
  const controller = useStylesPageController(project);
  const detailContent = controller.selectedStyle
    ? createElement(StyleDetailContent, {
        isProjectDefault: controller.isProjectDefault,
        key: controller.selectedStyle.id,
        onClearSelection: controller.clearSelection,
        project,
        style: controller.selectedStyle,
      })
    : null;
  const createDialog = createElement(CreateStyleDialogContent, {
    onCreated: controller.handleCreated,
    onOpenChange: controller.setCreateOpen,
    open: controller.createOpen,
    project,
  });
  return createElement(StylesPageView, {
    controller,
    createDialog,
    detailContent,
  });
}

interface CharacterAssetHistoryContentProps {
  characterName: string;
  className?: string;
  disabled?: boolean;
  historyUrl?: string;
  iconOnly?: boolean;
  identityId?: string;
  kind: CharacterAssetKind;
  project: string;
  restoreUrl?: string;
}

function CharacterAssetHistoryContent({
  className,
  disabled,
  iconOnly,
  ...options
}: CharacterAssetHistoryContentProps) {
  const controller = useCharacterAssetHistoryController(options);
  return createElement(CharacterAssetHistoryButtonView, {
    className,
    controller,
    disabled,
    iconOnly,
  });
}

function IdentityCardContent(options: IdentityCardControllerOptions) {
  const controller = useIdentityCardController(options);
  const historyBase = {
    characterName: options.characterName,
    identityId: options.identity.identity_id,
    project: options.project,
    restoreUrl: options.identity.restore_url,
  };
  return createElement(IdentityCardView, {
    controller,
    costumeHistory: createElement(CharacterAssetHistoryContent, {
      ...historyBase,
      className:
        "h-7 w-fit gap-1 rounded-[8px] border-border bg-transparent px-2 text-xs font-normal shadow-none hover:bg-muted",
      disabled:
        controller.uploadCostumePending || controller.deleteCostumePending,
      historyUrl: options.identity.costume_history_url,
      kind: "identity_costume",
    }),
    imageHistory: createElement(CharacterAssetHistoryContent, {
      ...historyBase,
      historyUrl: options.identity.history_url,
      kind: "identity",
    }),
    portraitHistory: createElement(CharacterAssetHistoryContent, {
      ...historyBase,
      disabled: !controller.isAgeVariant,
      historyUrl: options.identity.portrait_history_url,
      kind: "identity_portrait",
    }),
  });
}

function IdentitiesGridContent({
  character,
  imageModel,
  onAttempt,
  project,
}: {
  character: Character;
  imageModel?: string;
  onAttempt(): void;
  project: string;
}) {
  const controller = useIdentitiesGridController({
    character,
    imageModel,
    onAttempt,
    project,
  });
  const renderIdentityCard = (identity: (typeof controller.identities)[number]) =>
    createElement(IdentityCardContent, {
      ageLabel: controller.ageLabel,
      characterAgeGroup: character.age_group,
      characterName: character.name,
      identity,
      imageModel,
      onAttempt,
      project,
      referenceCount: controller.referenceIndex.countFor(
        "identity",
        identity.identity_id,
      ),
      references: controller.referenceIndex.referencesFor(
        "identity",
        identity.identity_id,
      ),
      roleLabel: controller.roleLabel,
    });
  return createElement(IdentitiesGridSectionView, {
    controller,
    renderIdentityCard,
  });
}

function CharacterDetailContent({
  attemptCount,
  character,
  imageModel,
  mainCopy,
  onAttempt,
  onDeleted,
  onRenamed,
  project,
}: Parameters<typeof useCharacterDetailController>[0]) {
  const controller = useCharacterDetailController({
    attemptCount,
    character,
    imageModel,
    mainCopy,
    onAttempt,
    onDeleted,
    onRenamed,
    project,
  });
  const portraitHistory = createElement(CharacterAssetHistoryContent, {
    characterName: character.name,
    className:
      "h-7 w-full justify-center gap-1 rounded-[8px] px-2 text-xs",
    historyUrl: character.history_url,
    kind: "portrait",
    project,
    restoreUrl: character.restore_url,
  });
  return createElement(CharacterDetailView, {
    controller,
    identitiesContent: createElement(IdentitiesGridContent, {
      character,
      imageModel,
      onAttempt,
      project,
    }),
    portraitHistory,
    voiceContent: createElement(CharacterVoicePanelContent, {
      character,
      project,
    }),
  });
}

export function CharacterVoicePanelContent({
  character,
  project,
}: {
  character: Character;
  project: string;
}) {
  const controller = useCharacterVoiceController({ character, project });
  return createElement(CharacterVoicePanelView, { controller });
}

function AddCharacterDialogContent({
  onOpenChange,
  open,
  project,
}: {
  onOpenChange(open: boolean): void;
  open: boolean;
  project: string;
}) {
  const controller = useAddCharacterController({
    onOpenChange,
    open,
    project,
  });
  return createElement(AddCharacterDialogView, { controller });
}

function CharactersPageBody({ project }: { project: string }) {
  const controller = useCharactersPageController(project);
  const selectedCharacter = controller.selectedCharacter;
  const detailContent = selectedCharacter
    ? createElement(CharacterDetailContent, {
        attemptCount: controller.selectedAttemptCount,
        character: selectedCharacter,
        imageModel: controller.imageModel,
        key: selectedCharacter.name,
        mainCopy: controller.mainCopy,
        onAttempt: () => controller.handleAttempt(selectedCharacter.name),
        onDeleted: () => controller.selectCharacter(null),
        onRenamed: controller.selectCharacter,
        project,
      })
    : createElement(EmptyCharacterDetailView);
  return createElement(CharactersPageView, {
    addDialogContent: createElement(AddCharacterDialogContent, {
      onOpenChange: controller.setAddDialogOpen,
      open: controller.addDialogOpen,
      project,
    }),
    controller,
    detailContent,
    imageSourceControl: createElement(CharacterImageSourceSelect, {
      className: "shrink-0",
      disabled: controller.rebuildDisabled,
      onSelectionChange: controller.setImageModel,
      project,
    }),
    narratorVoiceContent: controller.isNarratedFirstPerson
      ? null
      : createElement(NarratorVoicePanel, {
          allowFirstPersonProjectVoice: true,
          project,
        }),
    propsContent: createElement(PropsPanel, {
      focusId:
        controller.assetTab === "props" ? controller.assetFocusId : null,
      project,
    }),
    scenesContent: createElement(ScenesPanel, {
      focusId:
        controller.assetTab === "scenes" ? controller.assetFocusId : null,
      project,
    }),
  });
}

export function CharactersPageContent({ project }: { project: string }) {
  return createElement(TaskControllerProvider, {
    children: createElement(CharactersPageBody, { project }),
    episode: 0,
    project,
  });
}
