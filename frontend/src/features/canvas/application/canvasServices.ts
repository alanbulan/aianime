// Copyright (c) 2026 AI anime
import { InMemoryCanvasEventBus } from './eventBus';
import { DefaultGraphContentResolver } from './graphContentResolver';
import { DefaultGraphImageResolver } from './graphImageResolver';

export const canvasEventBus = new InMemoryCanvasEventBus();
export const graphImageResolver = new DefaultGraphImageResolver();
export const graphContentResolver = new DefaultGraphContentResolver();
