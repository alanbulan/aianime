// Copyright (c) 2026 AI anime
import { splitImageSource } from '@/commands/image';

import type { CanvasImageSplitGateway } from '@/modules/creative_canvas/public';

export const webImageSplitGateway: CanvasImageSplitGateway = {
  split: (imageSource, rows, cols, lineThickness) =>
    splitImageSource(imageSource, rows, cols, lineThickness),
};
