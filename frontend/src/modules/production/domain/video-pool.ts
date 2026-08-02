// Copyright (c) 2026 AI anime

export interface VideoPoolEntry {
  id: string;
  beat_num: number;
  video_path: string;
  video_url: string;
  generated_at?: string | null;
  duration: number;
  video_mode: string;
  video_model: string;
  prompt: string;
}

export interface VideoPoolData {
  episode: number;
  videos: VideoPoolEntry[];
  beat_assignments: Record<string, string>;
}
