// Copyright (c) 2026 AI anime
export type SpineTemplate = "drama" | "narrated";

export interface ProjectConfig {
  display_name?: string;
  cover_path?: string;
  spine_template?: SpineTemplate;
  aspect_ratio?: "2:3" | "9:16" | "16:9";
  visual_style?: string;
  narration_style?: string;
  ethnicity?: string;
  rhythm?: string;
  grid_mode?: string;
  video_model?: string;
  use_director_render?: boolean;
  video_resolution?: string;
  add_subtitles?: boolean;
  add_bgm?: boolean;
  sketch_image_selection?: string;
  render_image_selection?: string;
  sketch_aspect_padding?: boolean;
}

export type ProjectStatus = "active" | "archived" | "deleted";

export type ProjectRole = "viewer" | "editor" | "admin" | "owner";

export type ProjectLifecycleAction =
  | "archive"
  | "unarchive"
  | "delete"
  | "restore"
  | "purge";

export type ProjectDashboardViewMode = "card" | "list";

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  ownerUsername?: string;
  ownerId?: string;
  ownerType?: "user" | "team";
  effectiveRole?: ProjectRole;
  homeNodeId?: string;
  archivedAt?: string; // ISO8601 timestamp
  deletedAt?: string; // ISO8601 timestamp
  updatedAt?: string; // ISO8601 timestamp — latest mutation on the project
  episodeCount?: number; // number of planned episodes (null for Trash)
  beatCount?: number; // number of beats across all episodes (null for Trash)
  displayName?: string;
  coverPath?: string;
}

export interface ProjectCoverCandidate {
  path: string;
  name: string;
  url: string;
}

export interface ProjectCoverCandidatePage {
  items: ProjectCoverCandidate[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ProjectCoverResult {
  path: string;
  url: string;
}

export interface CreatedProject {
  id: string;
  name: string;
}

export interface ProjectGrant {
  id: string;
  projectId: string;
  principalType: "user" | "team";
  principalId: string;
  principalUsername?: string;
  role: Exclude<ProjectRole, "owner">;
  createdAt?: string;
}

export interface UserSearchResult {
  id: string;
  username: string;
}
