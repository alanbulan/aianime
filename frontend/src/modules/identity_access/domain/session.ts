// Copyright (c) 2026 AI anime
export interface CurrentUser {
  username: string;
  role: string;
  credit_balance: number;
  credential_kind?: string;
  avatar_url?: string | null;
}
