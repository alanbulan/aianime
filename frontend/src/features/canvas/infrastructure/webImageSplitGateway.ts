// Copyright (c) 2026 AI anime
import { splitImageSource } from '@/commands/image';

import type { ImageSplitGateway } from '../application/ports';

export const webImageSplitGateway: ImageSplitGateway = {
  split: (imageSource, rows, cols, lineThickness) =>
    splitImageSource(imageSource, rows, cols, lineThickness),
};
