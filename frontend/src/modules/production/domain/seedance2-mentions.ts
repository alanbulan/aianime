// Copyright (c) 2026 AI anime
import { buildMentionRegex } from "@/lib/mention-markers";

export interface Seedance2ReferenceAssetLike {
  reference_label: string;
  url?: string;
  path?: string;
  key: string;
}

export function seedance2AssetIdentity(
  asset: Seedance2ReferenceAssetLike,
): string {
  return asset.url || asset.path || asset.key;
}

export interface Seedance2LabelIdentityMaps {
  labelToIdentity: Map<string, string>;
  identityToLabel: Map<string, string>;
  labels: string[];
}

export interface Seedance2TrailingMention {
  index: number;
  query: string;
}

export function buildSeedance2LabelIdentityMaps(
  assets: Seedance2ReferenceAssetLike[],
): Seedance2LabelIdentityMaps {
  const labelToIdentity = new Map<string, string>();
  const identityToLabel = new Map<string, string>();
  const labels: string[] = [];
  for (const asset of assets) {
    const label = asset.reference_label;
    const identity = seedance2AssetIdentity(asset);
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

export function sameSeedance2LabelIdentity(
  a: Seedance2LabelIdentityMaps,
  b: Seedance2LabelIdentityMaps,
): boolean {
  if (a.labelToIdentity.size !== b.labelToIdentity.size) return false;
  for (const [label, identity] of a.labelToIdentity) {
    if (b.labelToIdentity.get(label) !== identity) return false;
  }
  return true;
}

export function remapSeedance2Mentions(
  text: string,
  prev: Seedance2LabelIdentityMaps,
  current: Seedance2LabelIdentityMaps,
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

export function findSeedance2TrailingMention(
  text: string,
): Seedance2TrailingMention | null {
  const match = /@([^\s@]*)$/u.exec(text.trimEnd());
  if (!match) return null;
  return { index: match.index, query: match[1] ?? "" };
}

export function getSeedance2MentionQuery(text: string): string | null {
  return findSeedance2TrailingMention(text)?.query ?? null;
}
