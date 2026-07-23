// Copyright (c) 2026 AI anime
export type AssetSortKey = "name" | "usage";

type Searchable = (string | null | undefined)[];

export function filterAssets<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => Searchable,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) =>
    fields(item)
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  );
}

export function sortAssets<T>(
  items: readonly T[],
  sortKey: AssetSortKey,
  nameOf: (item: T) => string,
  countOf: (item: T) => number,
): T[] {
  const copy = [...items];
  if (sortKey === "usage") {
    copy.sort(
      (a, b) => countOf(b) - countOf(a) || nameOf(a).localeCompare(nameOf(b)),
    );
  } else {
    copy.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }
  return copy;
}
