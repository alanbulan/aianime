// Copyright (c) 2026 AI anime
import { openGlobalErrorDialog } from '@/features/app/errorDialogEvents';

export async function showErrorDialog(
  text: string,
  title: string,
  details?: string,
  copyText?: string,
): Promise<void> {
  const content = text.trim();
  if (!content) {
    return;
  }

  openGlobalErrorDialog({
    title,
    message: content,
    details: details?.trim() || undefined,
    copyText: copyText?.trim() || undefined,
  });
}
