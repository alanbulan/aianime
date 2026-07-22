// Copyright (c) 2026 AI anime
export interface TTSVoice {
  name: string;
  short_name: string;
  gender: string;
  locale: string;
}

export interface GridImage {
  cell_url?: string;
  grid_url?: string;
  stale?: boolean;
}
