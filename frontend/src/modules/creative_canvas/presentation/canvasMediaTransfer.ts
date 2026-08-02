// Copyright (c) 2026 AI anime
import { isVideoFile } from '../domain/videoFileTypes';

export function resolveClipboardImageFile(event: ClipboardEvent): File | null {
  const clipboardItems = event.clipboardData?.items;
  if (!clipboardItems) {
    return null;
  }

  for (const item of Array.from(clipboardItems)) {
    if (!item.type.startsWith('image/')) {
      continue;
    }
    const file = item.getAsFile();
    if (!file) {
      continue;
    }
    const existingName = typeof file.name === 'string' ? file.name.trim() : '';
    if (existingName) {
      return file;
    }
    const subtype = item.type.split('/')[1]?.split('+')[0] || 'png';
    return new File([file], `pasted-image.${subtype}`, {
      type: file.type || item.type,
      lastModified: Date.now(),
    });
  }
  return null;
}

export function collectDroppedMediaFiles(dataTransfer: DataTransfer): File[] {
  const files = dataTransfer.files;
  if (!files || files.length === 0) {
    return [];
  }
  return Array.from(files).filter(
    (file) =>
      file.type.startsWith('image/')
      || isVideoFile(file)
      || file.type.startsWith('audio/'),
  );
}
