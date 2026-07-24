// Copyright (c) 2026 AI anime

export interface ComposeEpisodeCommand {
  addSubtitles?: boolean;
  addBgm?: boolean;
  resolution?: string;
}

export interface FinalVideoData {
  exists: boolean;
  filename: string;
  video_url?: string;
}
