// Copyright (c) 2026 AI anime
import { buildMentionRegex } from "@/lib/mention-markers";

export interface VideoReferenceAssetLike {
  reference_label: string;
  url?: string;
  path?: string;
  key: string;
}

export function videoReferenceAssetIdentity(
  asset: VideoReferenceAssetLike,
): string {
  return asset.url || asset.path || asset.key;
}

export interface VideoReferenceLabelIdentityMaps {
  labelToIdentity: Map<string, string>;
  identityToLabel: Map<string, string>;
  labels: string[];
}

export interface VideoReferenceTrailingMention {
  index: number;
  query: string;
}

export function buildVideoReferenceLabelIdentityMaps(
  assets: VideoReferenceAssetLike[],
): VideoReferenceLabelIdentityMaps {
  const labelToIdentity = new Map<string, string>();
  const identityToLabel = new Map<string, string>();
  const labels: string[] = [];
  for (const asset of assets) {
    const label = asset.reference_label;
    const identity = videoReferenceAssetIdentity(asset);
    if (!label || !identity) continue;
    if (!labelToIdentity.has(label)) {
      labelToIdentity.set(label, identity);
      labels.push(label);
    }
    if (!identityToLabel.has(identity)) {
      identityToLabel.set(identity, label);
    }
  }
  return { labelToIdentity, identityToLabel, labels };
}

export function sameVideoReferenceLabelIdentity(
  a: VideoReferenceLabelIdentityMaps,
  b: VideoReferenceLabelIdentityMaps,
): boolean {
  if (a.labelToIdentity.size !== b.labelToIdentity.size) return false;
  for (const [label, identity] of a.labelToIdentity) {
    if (b.labelToIdentity.get(label) !== identity) return false;
  }
  return true;
}

export function remapVideoReferenceMentions(
  text: string,
  prev: VideoReferenceLabelIdentityMaps,
  current: VideoReferenceLabelIdentityMaps,
): string {
  const knownLabels = Array.from(new Set([...prev.labels, ...current.labels]));
  const pattern = buildMentionRegex(knownLabels);
  if (!pattern) return text;

  let out = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const label = match[1];
    out += text.slice(lastIndex, start);

    const identity = prev.labelToIdentity.get(label);
    if (identity === undefined) {
      out += match[0];
      lastIndex = end;
      continue;
    }
    const nextLabel = current.identityToLabel.get(identity);
    if (nextLabel === undefined) {
      lastIndex = text[end] === " " ? end + 1 : end;
      continue;
    }
    out += `@${nextLabel}`;
    lastIndex = end;
  }
  out += text.slice(lastIndex);
  return out;
}

export function findVideoReferenceTrailingMention(
  text: string,
): VideoReferenceTrailingMention | null {
  const match = /@([^\s@]*)$/u.exec(text.trimEnd());
  if (!match) return null;
  return { index: match.index, query: match[1] ?? "" };
}

export function getVideoReferenceMentionQuery(text: string): string | null {
  return findVideoReferenceTrailingMention(text)?.query ?? null;
}
