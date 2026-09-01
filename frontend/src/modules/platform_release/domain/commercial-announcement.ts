export interface CommercialAnnouncement {
  id: string;
  title: string;
  body: string;
  level: string;
  pinned: boolean;
  publishAt: string | null;
  expiresAt: string | null;
}

export interface CommercialAnnouncementFeed {
  items: CommercialAnnouncement[];
  total: number;
}

export function parseCommercialAnnouncementFeed(
  value: unknown,
): CommercialAnnouncementFeed {
  const root = record(value, "commercial announcements", ["items", "total"]);
  if (!Array.isArray(root.items)) {
    throw new Error("commercial announcements.items must be an array");
  }
  if (
    typeof root.total !== "number" ||
    !Number.isSafeInteger(root.total) ||
    root.total < 0
  ) {
    throw new Error("commercial announcements.total must be a non-negative integer");
  }
  return {
    items: root.items.map((value, index) => {
      const name = `commercial announcements.items[${index}]`;
      const item = record(value, name, [
        "id",
        "title",
        "body",
        "level",
        "pinned",
        "publishAt",
        "expiresAt",
      ]);
      if (typeof item.pinned !== "boolean") {
        throw new Error(`${name}.pinned must be a boolean`);
      }
      return {
        id: identifier(item.id, `${name}.id`),
        title: text(item.title, `commercial announcements.items[${index}].title`),
        body: text(item.body, `commercial announcements.items[${index}].body`),
        level: text(item.level, `commercial announcements.items[${index}].level`),
        pinned: item.pinned,
        publishAt: optionalText(item.publishAt, `${name}.publishAt`),
        expiresAt: optionalText(item.expiresAt, `${name}.expiresAt`),
      };
    }),
    total: root.total,
  };
}

function record(
  value: unknown,
  name: string,
  fields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const result = value as Record<string, unknown>;
  const actual = Object.keys(result).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw new Error(`${name} fields must be exactly ${expected.join(", ")}`);
  }
  return result;
}

function identifier(value: unknown, name: string): string {
  if (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  ) {
    return value.trim().toLowerCase();
  }
  throw new Error(`${name} must be a UUID string`);
}

function text(value: unknown, name: string): string {
  const normalized = optionalText(value, name);
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}

function optionalText(value: unknown, name: string): string | null {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value.trim() || null;
}
