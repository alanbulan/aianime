// Copyright (c) 2026 AI anime
import { splitImageSource } from './browserImageCommands';

import type { CanvasImageSplitGateway } from '../application/canvasToolProcessor';

export const webImageSplitGateway: CanvasImageSplitGateway = {
  split: (imageSource, rows, cols, lineThickness) =>
    splitImageSource(imageSource, rows, cols, lineThickness),
};
