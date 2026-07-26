// Copyright (c) 2026 AI anime
export interface CreateIdentityAssetPayload {
  source_url: string;
  character: string;
  identity_name: string;
  appearance_details?: string;
  face_prompt?: string;
  age_group?: string;
}

export interface CreateIdentityAssetResult {
  character: string;
  identity_id: string;
  identity_name: string;
  target_path: string;
  target_url: string;
}
