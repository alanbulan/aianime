// Copyright (c) 2026 AI anime
import { buildMentionRegex } from "@/lib/mention-markers";

export interface MentionSegment {
  mention: boolean;
  text: string;
}

export interface MentionQuery {
  end: number;
  query: string;
  start: number;
}

export interface MentionRange {
  end: number;
  start: number;
}

export interface MentionToken extends MentionRange {
  label: string;
}

export interface MentionTextEdit {
  caret: number;
  value: string;
}

export function buildMentionSegments(
  text: string,
  labels: string[],
): MentionSegment[] {
  if (!text) return [];
  const pattern = buildMentionRegex(labels);
  if (!pattern) return [{ text, mention: false }];

  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        mention: false,
      });
    }
    segments.push({ text: match[0], mention: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), mention: false });
  }
  return segments;
}

export function findMentionTokenAtSelection(
  text: string,
  labels: string[],
  selectionStart: number,
  selectionEnd: number,
): MentionToken | null {
  const pattern = buildMentionRegex(labels);
  if (!pattern) return null;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start < selectionEnd && end > selectionStart) {
      return { start, end, label: match[0].replace(/^@/, "") };
    }
  }
  return null;
}

export function detectMentionQuery(
  text: string,
  caret: number,
): MentionQuery | null {
  const before = text.slice(0, caret);
  const match = before.match(/(^|[\s，,。！？；;：:、（(])@([^\s@]*)$/);
  if (!match) return null;
  return {
    start: before.length - match[2].length - 1,
    end: caret,
    query: match[2],
  };
}

export function filterMentionLabels(
  labels: string[],
  query: string | null,
  replacing: boolean,
): string[] {
  if (!replacing && query === null) return [];
  const normalizedQuery = query?.toLowerCase() ?? "";
  return labels
    .filter(Boolean)
    .filter(
      (label) =>
        replacing ||
        !normalizedQuery ||
        label.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 8);
}

export function insertMentionText(
  value: string,
  mention: MentionQuery,
  label: string,
): MentionTextEdit {
  const suffix = value.slice(mention.end).replace(/^\s+/, "");
  const inserted = `@${label} `;
  return {
    value: value.slice(0, mention.start) + inserted + suffix,
    caret: mention.start + inserted.length,
  };
}

export function replaceMentionText(
  value: string,
  range: MentionRange,
  label: string,
): MentionTextEdit {
  const inserted = `@${label}`;
  return {
    value:
      value.slice(0, range.start) + inserted + value.slice(range.end),
    caret: range.start + inserted.length,
  };
}

export function mentionPreviewPosition(
  anchor: { left: number; top: number },
  viewport: { height: number; width: number },
  previewSize: number,
): { bottom: number; left: number } {
  return {
    left: Math.min(
      Math.max(8, anchor.left),
      viewport.width - previewSize - 8,
    ),
    bottom: viewport.height - anchor.top + 6,
  };
}
