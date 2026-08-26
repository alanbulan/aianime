// Copyright (c) 2026 AI anime
import {
  Clapperboard,
  FileText,
  Film,
  Image as ImageIcon,
  Mic2,
  Pencil,
  ScrollText,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { StageId } from "@/lib/episode-stage-registry";

/**
 * NiceGUI exposes episode/script/sketch/render as separate workstations.
 * React keeps the current 3-entry aggregation (script/beats/compose) above the
 * legacy 5-stage registry. The stage registry remains the source of truth for
 * asset-readiness derivation (used by `useBeatStates`). This module owns
 * navigation: what routes exist, which tab is active, and how the per-beat
 * workbench exposes its 4 sub-tabs.
 */

export type TopTabId = "script" | "beats" | "compose";
export type BeatSubTabId = "text" | "sketch" | "render" | "audio" | "video";

export interface TopTabDef {
  id: TopTabId;
  labelKey: string;
  icon: LucideIcon;
  routeSegment: "/script" | "/beats" | "/compose";
  /**
   * Which legacy stage ids contribute to this tab's health count.
   * `beats` aggregates sketch+audio+video; `script` is itself; `compose`
   * is the compose gate.
   */
  stageIds: readonly (Exclude<StageId, "compose">)[];
  /** Whether this tab represents the compose gate (special display). */
  isCompose?: boolean;
}

interface BeatSubTabDef {
  id: BeatSubTabId;
  labelKey: string;
  icon: LucideIcon;
  /**
   * Legacy stage this sub-tab surfaces. `null` for the 文案 tab which is
   * cross-cutting beat metadata editing.
   */
  stageId: Exclude<StageId, "compose"> | null;
}

export const TOP_TABS: readonly TopTabDef[] = [
  {
    id: "script",
    labelKey: "episode.nav.script",
    icon: ScrollText,
    routeSegment: "/script",
    stageIds: ["script"],
  },
  {
    id: "beats",
    labelKey: "episode.nav.shots",
    icon: Clapperboard,
    routeSegment: "/beats",
    stageIds: ["sketch", "audio", "video"],
  },
  {
    id: "compose",
    labelKey: "episode.nav.compose",
    icon: Film,
    routeSegment: "/compose",
    stageIds: [],
    isCompose: true,
  },
];

export const BEAT_SUB_TABS: readonly BeatSubTabDef[] = [
  { id: "text", labelKey: "episode.nav.text", icon: FileText, stageId: null },
  { id: "sketch", labelKey: "episode.nav.sketch", icon: Pencil, stageId: "sketch" },
  { id: "render", labelKey: "episode.nav.render", icon: ImageIcon, stageId: "sketch" },
  { id: "audio", labelKey: "episode.nav.audio", icon: Mic2, stageId: "audio" },
  { id: "video", labelKey: "episode.nav.video", icon: Video, stageId: "video" },
];
