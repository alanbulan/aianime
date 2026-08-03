// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_SHARED_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
} from './modelDefaults';

describe('Canvas model defaults', () => {
  it('leaves persisted model identifiers for the authenticated catalog', () => {
    expect({
      image: DEFAULT_IMAGE_MODEL_ID,
      shared: DEFAULT_SHARED_MODEL_ID,
      video: DEFAULT_VIDEO_MODEL_ID,
    }).toEqual({
      image: '',
      shared: '',
      video: '',
    });
  });
});
