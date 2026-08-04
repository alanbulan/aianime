// Copyright (c) 2026 AI anime
import { v4 as uuidv4 } from 'uuid';

import type { CanvasToolIdGenerator } from '../application/canvasToolProcessor';

export const uuidGenerator = {
  next: () => uuidv4(),
} satisfies CanvasToolIdGenerator;
