import { createElement, useMemo, type ReactNode } from "react";

import { TaskControllerProvider } from "@/modules/task_execution/public";
import { useAssetFocus } from "./application/useAssetFocus";
import { useNavigateToAsset } from "./application/useAssetsDeepLink";
import { downloadBlobAsFile } from "@/lib/browserDownload";
import { useGenerationCreditCost } from "@/modules/model_usage/public";
import { isCeRuntime } from "@/lib/runtime-config";
import { createBeatViewerQueryHooks } from "@/modules/asset_world/application/beat-viewer-query-hooks";
import {
  loadBeatDirectorStageManifest as loadBeatDirectorStageManifestUseCase,
} from "@/modules/asset_world/application/load-beat-director-manifest";
import {
  clearSceneDirectorWorld as clearSceneDirectorWorldUseCase,
  loadSceneDirectorStageManifest as loadSceneDirectorStageManifestUseCase,
  saveSceneDirectorWorld as saveSceneDirectorWorldUseCase,
  saveSceneDirectorWorldSource as saveSceneDirectorWorldSourceUseCase,
} from "@/modules/asset_world/application/scene-director-world";
import type {
  SceneDirectorWorldPayload,
  SceneDirectorWorldSourcePayload,
} from "@/modules/asset_world/application/scene-gateway";
import { useAssetReferenceIndex } from "@/modules/asset_world/application/use-asset-reference-index";
import { createCharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import {
  listCharacterIdentities as listCharacterIdentitiesUseCase,
  listCharacters as listCharactersUseCase,
} from "@/modules/asset_world/application/character-catalog";
import {
  createIdentityAsset as createIdentityAssetUseCase,
} from "@/modules/asset_world/application/identity-asset";
import { createPropQueryHooks } from "@/modules/asset_world/application/prop-query-hooks";
import { createSceneQueryHooks } from "@/modules/asset_world/application/scene-query-hooks";
import { createUseAddCharacterController } from "@/modules/asset_world/application/use-add-character-controller";
import { createUseCharacterAssetHistoryController } from "@/modules/asset_world/application/use-character-asset-history-controller";
import {
  createUseCharacterDetailController,
  type CharacterDetailControllerOptions,
} from "@/modules/asset_world/application/use-character-detail-controller";
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
import {
  createUsePropAssetCardController,
  type PropAssetCardControllerOptions,
} from "@/modules/asset_world/application/use-prop-asset-card-controller";
import {
  createUsePropDialogController,
  type PropDialogControllerOptions,
} from "@/modules/asset_world/application/use-prop-dialog-controller";
import { createUsePropsPanelController } from "@/modules/asset_world/application/use-props-panel-controller";
import {
  createUseSceneAssetCardController,
  type SceneAssetCardControllerOptions,
} from "@/modules/asset_world/application/use-scene-asset-card-controller";
import {
  createUseSceneDialogController,
  type SceneDialogControllerOptions,
} from "@/modules/asset_world/application/use-scene-dialog-controller";
import { createUseScenesPanelController } from "@/modules/asset_world/application/use-scenes-panel-controller";
import type {
  Character,
  CharacterAssetKind,
} from "@/modules/asset_world/domain/character";
import type { CreateIdentityAssetPayload } from "@/modules/asset_world/domain/identity-asset";
import type { PropAsset } from "@/modules/asset_world/domain/prop";
import type { SceneAsset } from "@/modules/asset_world/domain/scene";
import type { Style } from "@/modules/asset_world/domain/style";
import {
  readStoredAssetTab,
  writeStoredAssetTab,
} from "@/modules/asset_world/infrastructure/asset-tab-storage";
import { useAssetWorkspaceNavigation } from "@/modules/asset_world/infrastructure/asset-workspace-navigation";
import { createBrowserVoiceRecorder } from "@/shared/voice-recording/browser-voice-recorder";
import { httpCharacterGateway } from "@/modules/asset_world/infrastructure/http-character-gateway";
import { httpBeatViewerGateway } from "@/modules/asset_world/infrastructure/http-beat-viewer-gateway";
import {
  httpIdentityAssetGateway,
} from "@/modules/asset_world/infrastructure/http-identity-asset-gateway";
import { httpPropGateway } from "@/modules/asset_world/infrastructure/http-prop-gateway";
import { httpSceneGateway } from "@/modules/asset_world/infrastructure/http-scene-gateway";
import {
  readStoredSceneGroupSelection,
  writeStoredSceneGroupSelection,
} from "@/modules/asset_world/infrastructure/scene-group-storage";
import { stylePreviewUrl } from "@/modules/asset_world/infrastructure/style-preview-url";
import { imageSourceQueries } from "@/modules/asset_world/imageSourceComposition";
import { CharacterImageSourceSelect } from "@/modules/asset_world/presentation/CharacterImageSourceSelect";
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
import { PropAssetCardControllerView } from "@/modules/asset_world/presentation/PropAssetCardView";
import { PropDialogView } from "@/modules/asset_world/presentation/PropDialogView";
import { PropsPanelView } from "@/modules/asset_world/presentation/PropsPanelView";
import { SceneAssetCardControllerView } from "@/modules/asset_world/presentation/SceneAssetCardView";
import { SceneDialogView } from "@/modules/asset_world/presentation/SceneDialogView";
import { ScenesPanelView } from "@/modules/asset_world/presentation/ScenesPanelView";
import {
  CreateStyleDialogView,
  StyleDetailView,
  StylesPageView,
} from "@/modules/asset_world/presentation/StylesPageView";
import { styleQueries } from "@/modules/asset_world/styleComposition";
import {
  useProject,
  useUpdateProject,
} from "@/modules/project_workspace/public";

export interface AssetWorldCanvasNavigation {
  openCharacter(project: string, characterName: string): Promise<unknown>;
  openProp(project: string, propName: string): Promise<void>;
  openScene(project: string, sceneName: string): Promise<void>;
}

const beatViewerQueries = createBeatViewerQueryHooks(httpBeatViewerGateway);
const characterQueries = createCharacterQueryHooks(httpCharacterGateway);
const propQueries = createPropQueryHooks(httpPropGateway);
const sceneQueries = createSceneQueryHooks(httpSceneGateway);
const usePropsPanelController = createUsePropsPanelController(
  propQueries,
  imageSourceQueries,
  {
    useAssetFocus,
    useAssetReferenceIndex,
    useGenerationCreditCost,
  },
);
const usePropDialogController = createUsePropDialogController();
const useScenesPanelController = createUseScenesPanelController(
  sceneQueries,
  imageSourceQueries,
  {
    readStoredSceneGroupSelection,
    useAssetFocus,
    useAssetReferenceIndex,
    useGenerationCreditCost,
    writeStoredSceneGroupSelection,
  },
);
const useSceneDialogController = createUseSceneDialogController({
  useNavigateToAsset,
});

export const {
  useBeatBackgroundAnchors,
  useBeatDirectorStageManifest,
  useCropBeatBackgroundAnchor,
  useDirectorControlFrameStatus,
  useUpdateBeatBackgroundAnchor,
  useUploadBeatBackgroundAnchor,
} = beatViewerQueries;

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

export { useAssetReferenceIndex, useAssetWorkspaceNavigation };

export function createIdentityAsset(
  projectId: string,
  payload: CreateIdentityAssetPayload,
) {
  return createIdentityAssetUseCase(
    { projectId, payload },
    httpIdentityAssetGateway,
  );
}

export function listCharacters(project: string) {
  return listCharactersUseCase(project, httpCharacterGateway);
}

export function listCharacterIdentities(
  project: string,
  character: string,
) {
  return listCharacterIdentitiesUseCase(
    project,
    character,
    httpCharacterGateway,
  );
}

export async function listScenes(project: string): Promise<SceneAsset[]> {
  const response = await httpSceneGateway.listScenes(project);
  return response.data;
}

export function loadBeatDirectorStageManifest(
  project: string,
  episode: number,
  beatNumber: number,
) {
  return loadBeatDirectorStageManifestUseCase(
    { project, episode, beatNumber },
    httpBeatViewerGateway,
  );
}

export function loadSceneDirectorStageManifest(
  project: string,
  sceneId: string,
) {
  return loadSceneDirectorStageManifestUseCase(
    { project, sceneId },
    httpSceneGateway,
  );
}

export function saveSceneDirectorWorld(
  project: string,
  sceneId: string,
  payload: SceneDirectorWorldPayload,
) {
  return saveSceneDirectorWorldUseCase(
    { project, sceneId, payload },
    httpSceneGateway,
  );
}

export function saveSceneDirectorWorldSource(
  project: string,
  sceneId: string,
  payload: SceneDirectorWorldSourcePayload,
) {
  return saveSceneDirectorWorldSourceUseCase(
    { project, sceneId, payload },
    httpSceneGateway,
  );
}

export function clearSceneDirectorWorld(
  project: string,
  sceneId: string,
  activeSourceId: string,
) {
  return clearSceneDirectorWorldUseCase(
    { project, sceneId, activeSourceId },
    httpSceneGateway,
  );
}

function PropDialogContent(options: PropDialogControllerOptions) {
  const controller = usePropDialogController(options);
  return createElement(PropDialogView, { controller });
}

function PropAssetCardContent({
  openPropFreezone,
  ...options
}: PropAssetCardControllerOptions & {
  openPropFreezone: AssetWorldCanvasNavigation["openProp"];
}) {
  const useController = useMemo(
    () =>
      createUsePropAssetCardController(propQueries, {
        openPropFreezone,
        useGenerationCreditCost,
      }),
    [openPropFreezone],
  );
  const controller = useController(options);
  return createElement(PropAssetCardControllerView, { controller });
}

export function PropsPanelContent({
  focusId,
  openPropFreezone,
  project,
}: {
  focusId?: string | null;
  openPropFreezone: AssetWorldCanvasNavigation["openProp"];
  project: string;
}) {
  const controller = usePropsPanelController({ focusId, project });
  return createElement(PropsPanelView, {
    controller,
    dialogContent: createElement(PropDialogContent, controller.dialog),
    imageSourceControl: createElement(CharacterImageSourceSelect, {
      kind: "prop",
      project,
    }),
    renderPropCard: (prop: PropAsset) =>
      createElement(PropAssetCardContent, {
        imageSourceSelection: controller.imageSourceSelection,
        onDelete: () => void controller.deleteProp(prop),
        onEdit: () => controller.openEditProp(prop),
        openPropFreezone,
        project,
        prop,
        referenceCount: controller.referenceCountForProp(prop),
      }),
  });
}

function SceneDialogContent(options: SceneDialogControllerOptions) {
  const controller = useSceneDialogController(options);
  return createElement(SceneDialogView, { controller });
}

function SceneAssetCardContent({
  openSceneFreezone,
  ...options
}: SceneAssetCardControllerOptions & {
  openSceneFreezone: AssetWorldCanvasNavigation["openScene"];
}) {
  const useController = useMemo(
    () =>
      createUseSceneAssetCardController(sceneQueries, {
        downloadBlob: downloadBlobAsFile,
        openSceneFreezone,
        useGenerationCreditCost,
      }),
    [openSceneFreezone],
  );
  const controller = useController(options);
  return createElement(SceneAssetCardControllerView, { controller });
}

export function ScenesPanelContent({
  focusId,
  openSceneFreezone,
  project,
}: {
  focusId?: string | null;
  openSceneFreezone: AssetWorldCanvasNavigation["openScene"];
  project: string;
}) {
  const controller = useScenesPanelController({ focusId, project });
  return createElement(ScenesPanelView, {
    controller,
    dialogContent: createElement(SceneDialogContent, controller.dialog),
    imageSourceControl: createElement(CharacterImageSourceSelect, {
      kind: "scene",
      project,
    }),
    renderSceneCard: (scene: SceneAsset) =>
      createElement(SceneAssetCardContent, {
        imageSourceSelection: controller.imageSourceSelection,
        onDelete: () => void controller.deleteScene(scene),
        onEdit: () => controller.openEditScene(scene),
        openSceneFreezone,
        project,
        referenceCount: controller.referenceCountForScene(scene),
        scene,
      }),
  });
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
  openCharacterFreezone,
  onRenamed,
  project,
}: CharacterDetailControllerOptions & {
  openCharacterFreezone: AssetWorldCanvasNavigation["openCharacter"];
}) {
  const useController = useMemo(
    () =>
      createUseCharacterDetailController(characterQueries, {
        openCharacterFreezone,
        useGenerationCreditCost,
      }),
    [openCharacterFreezone],
  );
  const controller = useController({
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

function CharactersPageBody({
  canvasNavigation,
  project,
  renderNarratorVoicePanel,
}: CharactersPageContentProps) {
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
        openCharacterFreezone: canvasNavigation.openCharacter,
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
      : renderNarratorVoicePanel(project),
    propsContent: createElement(PropsPanelContent, {
      focusId:
        controller.assetTab === "props" ? controller.assetFocusId : null,
      openPropFreezone: canvasNavigation.openProp,
      project,
    }),
    scenesContent: createElement(ScenesPanelContent, {
      focusId:
        controller.assetTab === "scenes" ? controller.assetFocusId : null,
      openSceneFreezone: canvasNavigation.openScene,
      project,
    }),
  });
}

export interface CharactersPageContentProps {
  canvasNavigation: AssetWorldCanvasNavigation;
  project: string;
  renderNarratorVoicePanel(project: string): ReactNode;
}

export function CharactersPageContent({
  canvasNavigation,
  project,
  renderNarratorVoicePanel,
}: CharactersPageContentProps) {
  return createElement(TaskControllerProvider, {
    children: createElement(CharactersPageBody, {
      canvasNavigation,
      project,
      renderNarratorVoicePanel,
    }),
    episode: 0,
    project,
  });
}
