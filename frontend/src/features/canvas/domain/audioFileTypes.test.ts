import { describe, expect, it } from 'vitest';

import { isAudioFile } from './audioFileTypes';

describe('isAudioFile', () => {
  it('accepts standard audio MIME types', () => {
    expect(isAudioFile({ type: 'audio/mpeg', name: 'voice.mp3' })).toBe(true);
    expect(isAudioFile({ type: 'audio/wav', name: 'voice.wav' })).toBe(true);
  });

  it('accepts supported extensions when MIME is missing or unreliable', () => {
    expect(isAudioFile({ type: '', name: 'voice.M4A' })).toBe(true);
    expect(isAudioFile({ type: '', name: 'music.flac' })).toBe(true);
    expect(isAudioFile({ type: 'application/octet-stream', name: 'take.aiff' })).toBe(true);
  });

  it('rejects non-audio files and partial extension matches', () => {
    expect(isAudioFile({ type: 'video/mp4', name: 'clip.mp4' })).toBe(false);
    expect(isAudioFile({ type: 'image/png', name: 'cover.png' })).toBe(false);
    expect(isAudioFile({ type: '', name: 'voice.mp3.txt' })).toBe(false);
  });
});
