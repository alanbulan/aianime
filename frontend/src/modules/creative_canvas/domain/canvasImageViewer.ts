// Copyright (c) 2026 AI anime

export interface CanvasImageViewerState {
  isOpen: boolean;
  currentImageUrl: string | null;
  imageList: string[];
  currentIndex: number;
}

export type CanvasImageViewerDirection = 'prev' | 'next';

export function createClosedCanvasImageViewer(): CanvasImageViewerState {
  return {
    isOpen: false,
    currentImageUrl: null,
    imageList: [],
    currentIndex: 0,
  };
}

export function openCanvasImageViewer(
  imageUrl: string,
  imageList: string[] = [],
): CanvasImageViewerState {
  const list = imageList.length > 0 ? imageList : [imageUrl];
  const index = list.indexOf(imageUrl);
  return {
    isOpen: true,
    currentImageUrl: imageUrl,
    imageList: list,
    currentIndex: index >= 0 ? index : 0,
  };
}

export function navigateCanvasImageViewer(
  state: CanvasImageViewerState,
  direction: CanvasImageViewerDirection,
): CanvasImageViewerState {
  const offset = direction === 'prev' ? -1 : 1;
  const nextIndex = state.currentIndex + offset;
  if (nextIndex < 0 || nextIndex >= state.imageList.length) {
    return state;
  }

  return {
    ...state,
    currentIndex: nextIndex,
    currentImageUrl: state.imageList[nextIndex],
  };
}
