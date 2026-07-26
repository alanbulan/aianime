// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

// ---------- Episodes ---------- //

export interface AiAnimeEpisodeSummary {
  episode_num: number;
  /** 后端实际返回的集数字段是 `number`;listEpisodes 会归一到 episode_num。 */
  number?: number;
  title?: string;
  [key: string]: unknown;
}

export async function listEpisodes(projectId: string): Promise<AiAnimeEpisodeSummary[]> {
  const episodes = await apiCall<AiAnimeEpisodeSummary[]>(
    `projects/${encodeURIComponent(projectId)}/episodes`,
  );
  // 后端集数字段名是 `number`（见 narrative_planning/domain/types.ts），历史类型却写成
  // `episode_num`。这里统一归一,保证 episode_num 始终是有效数字,避免下游(CommitDialog /
  // ImportPanel)拿到 undefined → Number(undefined)=NaN → 请求 /episodes/NaN/beats。
  return episodes.map((ep) => {
    const resolved =
      typeof ep.episode_num === "number"
        ? ep.episode_num
        : typeof ep.number === "number"
          ? ep.number
          : ep.episode_num;
    return { ...ep, episode_num: resolved };
  });
}

// ---------- Beats ---------- //

export interface AiAnimeBeat {
  beat_index?: number;
  beat_number?: number;
  narration_segment?: string;
  visual_description?: string;
  scene_ref?: { scene_id?: string; variant_id?: string };
  time_of_day?: string;
  detected_identities?: string[];
  detected_props?: string[];
  speaker?: string;
  frame_url?: string;
  video_url?: string;
  audio_url?: string;
  [key: string]: unknown;
}

export async function listBeats(
  projectId: string,
  episodeNum: number,
): Promise<AiAnimeBeat[]> {
  return await apiCall<AiAnimeBeat[]>(
    `projects/${encodeURIComponent(projectId)}/episodes/${episodeNum}/beats`,
  );
}

// ---------- Static URL helpers ---------- //

// AI anime serves user assets at `/static/<user>/<project>/...`. The backend
// embeds `<user>/<project>` in URLs it returns (frame_url, video_url, identity
// image_url, portrait_url). For assets the backend doesn't directly expose
// (sketch, director-render combined.png), we derive a URL by rewriting the
// path segment after the `/static/<u>/<p>/` prefix of an already-known asset.
// If no anchor URL is available (no frames yet), the asset can't be derived
// and ImportPanel skips it.
//
// F5 sprint may add a dedicated `/freezone/list-assets` endpoint, which would
// remove the need for these helpers.

function pad(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

const STATIC_PREFIX_RE = /^(\/static\/[^/]+\/[^/]+\/)/;

export function staticPrefixOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = STATIC_PREFIX_RE.exec(url);
  return m ? m[1] : null;
}

export function deriveSketchUrl(
  anchorUrl: string | null | undefined,
  episode: number,
  beatNum: number,
): string | null {
  const prefix = staticPrefixOf(anchorUrl);
  if (!prefix) return null;
  return `${prefix}sketches/ep${pad(episode, 3)}/beat_${pad(beatNum, 2)}.png`;
}

export function deriveDirectorRenderUrl(
  anchorUrl: string | null | undefined,
  episode: number,
  beatNum: number,
): string | null {
  const prefix = staticPrefixOf(anchorUrl);
  if (!prefix) return null;
  return `${prefix}director_control_frames/ep${pad(episode, 3)}/beat_${pad(beatNum, 2)}/combined.png`;
}
