// Copyright (c) 2026 AI anime

// `v` is backend-authored and authoritative; `st_v` is the renderer fallback
// for newly written same-path assets that do not have a content version yet.
export function withImageCacheBust(
  imageUrl: string,
  token: string | number | null | undefined,
): string {
  if (!imageUrl || token === null || token === undefined) return imageUrl;
  const trimmed = imageUrl.trim();
  if (
    !trimmed ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("asset:")
  ) {
    return imageUrl;
  }
  const [base, hash = ""] = trimmed.split("#", 2);
  const [path, query = ""] = base.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("st_v");
  if (params.has("v")) {
    const versioned = params.toString();
    const stable = versioned ? `${path}?${versioned}` : path;
    return hash ? `${stable}#${hash}` : stable;
  }
  params.set("st_v", String(token));
  const busted = `${path}?${params.toString()}`;
  return hash ? `${busted}#${hash}` : busted;
}
