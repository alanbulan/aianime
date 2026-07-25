// Copyright (c) 2026 AI anime
import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";
import type { BeatViewerGateway } from "@/modules/asset_world/application/beat-viewer-gateway";
import type {
  AssetErrorResponse,
  AssetResponse,
} from "@/modules/asset_world/application/ports";
import type {
  BeatBackgroundAnchorItem,
  BeatBackgroundAnchors,
  BeatBackgroundReference,
  DirectorControlFrameStatus,
} from "@/modules/asset_world/domain/beat-viewer";
import { p } from "@/shared/api/path";
import { api } from "@/shared/api/transport";

interface BeatBackgroundReferenceDto {
  id: string;
  label: string;
  anchor_id?: string;
  path?: string;
  rel_path?: string | null;
  url?: string | null;
}

interface BeatBackgroundAnchorItemDto extends BeatBackgroundReferenceDto {
  current: boolean;
  exists: boolean;
  snapshot_to_selected_background?: boolean;
}

interface BeatBackgroundAnchorsDto {
  episode: number;
  beat_num: number;
  scene_id: string;
  can_choose: boolean;
  render_anchor_id?: string;
  current_source?: string;
  current_anchor: string;
  current_reference?: BeatBackgroundReferenceDto | null;
  display_reference?: BeatBackgroundReferenceDto | null;
  render_input?: BeatBackgroundReferenceDto | null;
  anchors: BeatBackgroundAnchorItemDto[];
  error?: string;
}

interface DirectorControlFrameStatusDto {
  episode: number;
  beat_num: number;
  ready: boolean;
  path?: string | null;
  rel_path?: string | null;
  url?: string | null;
  scope: string;
}

type TransportResponse<T> = { ok: true; data: T } | AssetErrorResponse;

function mapReference(
  reference: BeatBackgroundReferenceDto,
): BeatBackgroundReference {
  return {
    id: reference.id,
    label: reference.label,
    anchorId: reference.anchor_id,
    path: reference.path,
    relativePath: reference.rel_path,
    url: reference.url,
  };
}

function mapOptionalReference(
  reference: BeatBackgroundReferenceDto | null | undefined,
): BeatBackgroundReference | null | undefined {
  return reference == null ? reference : mapReference(reference);
}

function mapAnchor(
  anchor: BeatBackgroundAnchorItemDto,
): BeatBackgroundAnchorItem {
  return {
    ...mapReference(anchor),
    current: anchor.current,
    exists: anchor.exists,
    snapshotToSelectedBackground: anchor.snapshot_to_selected_background,
  };
}

function mapBackgroundAnchors(
  data: BeatBackgroundAnchorsDto,
): BeatBackgroundAnchors {
  return {
    episode: data.episode,
    beatNumber: data.beat_num,
    sceneId: data.scene_id,
    canChoose: data.can_choose,
    renderAnchorId: data.render_anchor_id,
    currentSource: data.current_source,
    currentAnchor: data.current_anchor,
    currentReference: mapOptionalReference(data.current_reference),
    displayReference: mapOptionalReference(data.display_reference),
    renderInput: mapOptionalReference(data.render_input),
    anchors: data.anchors.map(mapAnchor),
    error: data.error,
  };
}

function mapBackgroundResponse(
  response: TransportResponse<BeatBackgroundAnchorsDto>,
): AssetResponse<BeatBackgroundAnchors> {
  return response.ok
    ? { ok: true, data: mapBackgroundAnchors(response.data) }
    : response;
}

function mapDirectorControlFrameStatus(
  data: DirectorControlFrameStatusDto,
): DirectorControlFrameStatus {
  return {
    episode: data.episode,
    beatNumber: data.beat_num,
    ready: data.ready,
    path: data.path,
    relativePath: data.rel_path,
    url: data.url,
    scope: data.scope,
  };
}

function beatPath(
  project: string,
  episode: number,
  beatNumber: number,
  suffix: string,
) {
  const base = p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNumber}`;
  return `${base}/${suffix}`;
}

export const httpBeatViewerGateway: BeatViewerGateway = {
  async getDirectorStageManifest(project, episode, beatNumber, signal) {
    return api
      .get(
        beatPath(
          project,
          episode,
          beatNumber,
          "director-stage/manifest",
        ),
        { signal },
      )
      .json<AssetResponse<DirectorStageManifest>>();
  },

  async getBackgroundAnchors(project, episode, beatNumber, signal) {
    const response = await api
      .get(beatPath(project, episode, beatNumber, "background-anchors"), {
        signal,
      })
      .json<TransportResponse<BeatBackgroundAnchorsDto>>();
    return mapBackgroundResponse(response);
  },

  async updateBackgroundAnchor(
    project,
    episode,
    beatNumber,
    anchorId,
  ) {
    const response = await api
      .patch(beatPath(project, episode, beatNumber, "background-anchor"), {
        json: { anchor_id: anchorId },
      })
      .json<TransportResponse<BeatBackgroundAnchorsDto>>();
    return mapBackgroundResponse(response);
  },

  async uploadBackgroundAnchor(project, episode, beatNumber, file) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const response = await api
      .post(
        beatPath(project, episode, beatNumber, "background-anchor/upload"),
        { body: formData },
      )
      .json<TransportResponse<BeatBackgroundAnchorsDto>>();
    return mapBackgroundResponse(response);
  },

  async cropBackgroundAnchor(project, episode, beatNumber, command) {
    const response = await api
      .post(
        beatPath(project, episode, beatNumber, "background-anchor/crop"),
        {
          json: {
            anchor_id: command.anchorId,
            x: command.crop.x,
            y: command.crop.y,
            width: command.crop.width,
            height: command.crop.height,
          },
        },
      )
      .json<TransportResponse<BeatBackgroundAnchorsDto>>();
    return mapBackgroundResponse(response);
  },

  async getDirectorControlFrameStatus(
    project,
    episode,
    beatNumber,
    signal,
  ) {
    const response = await api
      .get(
        beatPath(project, episode, beatNumber, "director-control-frame"),
        { signal },
      )
      .json<TransportResponse<DirectorControlFrameStatusDto>>();
    return response.ok
      ? { ok: true, data: mapDirectorControlFrameStatus(response.data) }
      : response;
  },
};
