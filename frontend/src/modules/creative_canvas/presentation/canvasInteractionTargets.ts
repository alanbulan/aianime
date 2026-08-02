// Copyright (c) 2026 AI anime
export const PAN_ACTIVATION_KEY_CODE = 'Space';

const INTERACTIVE_CANVAS_SELECTOR = [
  '.react-flow__node',
  '.react-flow__edge',
  '.react-flow__controls',
  '.react-flow__minimap',
  '.nodrag',
  '.nopan',
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
].join(', ');

export function isCanvasPaneTarget(
  target: EventTarget | null,
  wrapperElement: HTMLElement,
): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element || !wrapperElement.contains(element)) {
    return false;
  }
  if (!element.closest('.react-flow__pane')) {
    return false;
  }
  return !element.closest(INTERACTIVE_CANVAS_SELECTOR);
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) {
    return false;
  }
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || element.isContentEditable
    || Boolean(element.closest('[role="textbox"]'))
  );
}

export function isSpacePanKey(event: Pick<KeyboardEvent, 'code' | 'key'>): boolean {
  return (
    event.code === PAN_ACTIVATION_KEY_CODE
    || event.key === ' '
    || event.key === 'Spacebar'
  );
}
