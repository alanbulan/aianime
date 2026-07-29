// Copyright (c) 2026 AI anime

const AUDIO_UPLOAD_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'flac',
  'weba',
  'wma',
  'aiff',
  'aif',
  'caf',
  'amr',
]);

/** Browser MIME may be empty for valid audio files, so extensions are a fallback. */
export function isAudioFile(file: {
  readonly type: string;
  readonly name: string;
}): boolean {
  if (file.type.startsWith('audio/')) {
    return true;
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_UPLOAD_EXTENSIONS.has(extension);
}
