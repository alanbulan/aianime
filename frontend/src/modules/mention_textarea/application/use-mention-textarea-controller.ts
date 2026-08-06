// Copyright (c) 2026 AI anime
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ChangeEventHandler,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type MouseEvent as ReactMouseEvent,
  type MouseEventHandler,
  type ReactEventHandler,
  type RefObject,
  type SyntheticEvent,
  type UIEvent,
  type UIEventHandler,
} from "react";

import {
  buildMentionSegments,
  detectMentionQuery,
  filterMentionLabels,
  findMentionTokenAtSelection,
  insertMentionText,
  mentionPreviewPosition,
  replaceMentionText,
  type MentionQuery,
  type MentionRange,
  type MentionSegment,
} from "@/modules/mention_textarea/domain/mention-text";
import { normalizeMentionSeparatorSpaces } from "@/lib/mention-markers";

const MENTION_PREVIEW_SIZE = 200;

export interface MentionTextareaControllerOptions {
  mentionLabels: string[];
  mentionPreviews?: Record<string, string>;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  onKeyUp?: KeyboardEventHandler<HTMLTextAreaElement>;
  onMouseLeave?: MouseEventHandler<HTMLTextAreaElement>;
  onMouseMove?: MouseEventHandler<HTMLTextAreaElement>;
  onMouseUp?: MouseEventHandler<HTMLTextAreaElement>;
  onScroll?: UIEventHandler<HTMLTextAreaElement>;
  onSelect?: ReactEventHandler<HTMLTextAreaElement>;
  value: string;
}

export interface MentionPreview {
  bottom: number;
  left: number;
  url: string;
  width: number;
}

export interface MentionTextareaController {
  activeIndex: number;
  backdropRef: RefObject<HTMLDivElement | null>;
  filteredLabels: string[];
  onLabelMouseDown(
    event: ReactMouseEvent<HTMLButtonElement>,
    label: string,
  ): void;
  onLabelMouseEnter(index: number): void;
  onTextareaChange(event: ChangeEvent<HTMLTextAreaElement>): void;
  onTextareaDoubleClick(event: ReactMouseEvent<HTMLTextAreaElement>): void;
  onTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void;
  onTextareaKeyUp(event: KeyboardEvent<HTMLTextAreaElement>): void;
  onTextareaMouseLeave(event: ReactMouseEvent<HTMLTextAreaElement>): void;
  onTextareaMouseMove(event: ReactMouseEvent<HTMLTextAreaElement>): void;
  onTextareaMouseUp(event: ReactMouseEvent<HTMLTextAreaElement>): void;
  onTextareaScroll(event: UIEvent<HTMLTextAreaElement>): void;
  onTextareaSelect(event: SyntheticEvent<HTMLTextAreaElement>): void;
  pickerOpen: boolean;
  preview: MentionPreview | null;
  rootRef: RefObject<HTMLDivElement | null>;
  segments: MentionSegment[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

export function useMentionTextareaController({
  mentionLabels,
  mentionPreviews,
  onChange,
  onKeyDown,
  onKeyUp,
  onMouseLeave,
  onMouseMove,
  onMouseUp,
  onScroll,
  onSelect,
  value,
}: MentionTextareaControllerOptions): MentionTextareaController {
  const rootRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hoverLabelRef = useRef<string | null>(null);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [replaceRange, setReplaceRange] = useState<MentionRange | null>(null);
  const [preview, setPreview] = useState<MentionPreview | null>(null);

  const hasPreviews = Boolean(
    mentionPreviews && Object.keys(mentionPreviews).length > 0,
  );
  const segments = useMemo(
    () => buildMentionSegments(value, mentionLabels),
    [value, mentionLabels],
  );
  const filteredLabels = useMemo(
    () =>
      filterMentionLabels(
        mentionLabels,
        mention?.query ?? null,
        replaceRange !== null,
      ),
    [mention, replaceRange, mentionLabels],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [mention?.query, replaceRange]);

  useEffect(() => {
    if (!replaceRange) return;
    const onDocumentMouseDown = (event: globalThis.MouseEvent) => {
      const root = rootRef.current;
      if (
        root &&
        event.target instanceof globalThis.Node &&
        root.contains(event.target)
      ) {
        return;
      }
      setReplaceRange(null);
    };
    document.addEventListener("mousedown", onDocumentMouseDown, true);
    return () =>
      document.removeEventListener("mousedown", onDocumentMouseDown, true);
  }, [replaceRange]);

  const detectMention = (text: string, caret: number) => {
    setMention(detectMentionQuery(text, caret));
  };

  const emitChange = (
    textarea: HTMLTextAreaElement,
    nextValue: string,
    selectionStart = textarea.selectionStart,
    selectionEnd = selectionStart,
  ) => {
    const event = {
      target: {
        ...textarea,
        value: nextValue,
        selectionStart,
        selectionEnd,
      },
      currentTarget: {
        ...textarea,
        value: nextValue,
        selectionStart,
        selectionEnd,
      },
    } as unknown as ChangeEvent<HTMLTextAreaElement>;
    onChange?.(event);
  };

  const restoreSelection = (textarea: HTMLTextAreaElement, caret: number) => {
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  const insertMention = (label: string) => {
    const textarea = textareaRef.current;
    if (!textarea || !mention) return;
    const edit = insertMentionText(value, mention, label);
    emitChange(textarea, edit.value, edit.caret, edit.caret);
    setMention(null);
    restoreSelection(textarea, edit.caret);
  };

  const replaceMention = (label: string) => {
    const textarea = textareaRef.current;
    if (!textarea || !replaceRange) return;
    const edit = replaceMentionText(value, replaceRange, label);
    emitChange(textarea, edit.value, edit.caret, edit.caret);
    setReplaceRange(null);
    setMention(null);
    restoreSelection(textarea, edit.caret);
  };

  const applyLabel = (label: string) => {
    if (replaceRange) {
      replaceMention(label);
    } else {
      insertMention(label);
    }
  };

  const refreshMention = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    detectMention(
      textarea.value,
      textarea.selectionStart ?? textarea.value.length,
    );
  };

  const onTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (replaceRange) setReplaceRange(null);
    const textarea = event.currentTarget;
    const normalized = normalizeMentionSeparatorSpaces(
      textarea.value,
      mentionLabels,
      textarea.selectionStart ?? textarea.value.length,
    );
    if (normalized.text !== textarea.value) {
      emitChange(textarea, normalized.text, normalized.caret, normalized.caret);
      detectMention(normalized.text, normalized.caret);
      window.requestAnimationFrame(() => {
        textarea.setSelectionRange(normalized.caret, normalized.caret);
      });
      return;
    }
    onChange?.(event);
    detectMention(
      textarea.value,
      textarea.selectionStart ?? textarea.value.length,
    );
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      (mention || replaceRange) &&
      filteredLabels.length > 0 &&
      !event.nativeEvent.isComposing
    ) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % filteredLabels.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(
          (index) => (index - 1 + filteredLabels.length) % filteredLabels.length,
        );
        return;
      }
      if (
        event.key === "Enter" ||
        event.key === "Tab" ||
        (event.key === " " && !replaceRange)
      ) {
        event.preventDefault();
        applyLabel(filteredLabels[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        setReplaceRange(null);
        return;
      }
    }
    onKeyDown?.(event);
  };

  const onTextareaDoubleClick = (
    event: ReactMouseEvent<HTMLTextAreaElement>,
  ) => {
    if (mentionLabels.length === 0) return;
    const textarea = event.currentTarget;
    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const hit = findMentionTokenAtSelection(
      value,
      mentionLabels,
      selectionStart,
      selectionEnd,
    );
    if (!hit) return;
    setMention(null);
    setActiveIndex(0);
    setReplaceRange({ start: hit.start, end: hit.end });
  };

  const onTextareaMouseMove = (
    event: ReactMouseEvent<HTMLTextAreaElement>,
  ) => {
    onMouseMove?.(event);
    if (!hasPreviews) return;
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    const { clientX, clientY } = event;
    let hitLabel: string | null = null;
    let hitRect: DOMRect | null = null;
    for (const mark of backdrop.querySelectorAll<HTMLElement>(
      "mark[data-mention-label]",
    )) {
      const rect = mark.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        hitLabel = mark.dataset.mentionLabel ?? null;
        hitRect = rect;
        break;
      }
    }
    if (hitLabel === hoverLabelRef.current) return;
    hoverLabelRef.current = hitLabel;
    const url = hitLabel ? mentionPreviews?.[hitLabel] : undefined;
    if (hitLabel && url && hitRect) {
      const position = mentionPreviewPosition(
        hitRect,
        { width: window.innerWidth, height: window.innerHeight },
        MENTION_PREVIEW_SIZE,
      );
      setPreview({ url, ...position, width: MENTION_PREVIEW_SIZE });
    } else {
      setPreview(null);
    }
  };

  return {
    activeIndex,
    backdropRef,
    filteredLabels,
    onLabelMouseDown: (event, label) => {
      event.preventDefault();
      applyLabel(label);
    },
    onLabelMouseEnter: setActiveIndex,
    onTextareaChange,
    onTextareaDoubleClick,
    onTextareaKeyDown,
    onTextareaKeyUp: (event) => {
      refreshMention(event);
      onKeyUp?.(event);
    },
    onTextareaMouseLeave: (event) => {
      onMouseLeave?.(event);
      hoverLabelRef.current = null;
      setPreview(null);
    },
    onTextareaMouseMove,
    onTextareaMouseUp: (event) => {
      refreshMention(event);
      onMouseUp?.(event);
    },
    onTextareaScroll: (event) => {
      const backdrop = backdropRef.current;
      if (backdrop) {
        backdrop.scrollTop = event.currentTarget.scrollTop;
        backdrop.scrollLeft = event.currentTarget.scrollLeft;
      }
      onScroll?.(event);
    },
    onTextareaSelect: (event) => {
      refreshMention(event);
      onSelect?.(event);
    },
    pickerOpen:
      (mention !== null || replaceRange !== null) && filteredLabels.length > 0,
    preview,
    rootRef,
    segments,
    textareaRef,
  };
}
