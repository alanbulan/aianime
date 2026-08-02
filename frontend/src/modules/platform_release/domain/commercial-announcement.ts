export interface CommercialAnnouncement {
  id: string | number;
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
  const root = record(value, "commercial announcements");
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
      const item = record(value, `commercial announcements.items[${index}]`);
      return {
        id: identifier(item.id, `commercial announcements.items[${index}].id`),
        title: text(item.title, `commercial announcements.items[${index}].title`),
        body: text(item.body, `commercial announcements.items[${index}].body`),
        level: text(item.level, `commercial announcements.items[${index}].level`),
        pinned: item.pinned === true,
        publishAt: optionalText(item.publishAt),
        expiresAt: optionalText(item.expiresAt),
      };
    }),
    total: root.total,
  };
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, name: string): string | number {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new Error(`${name} must be a string or safe integer`);
}

function text(value: unknown, name: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}

function optionalText(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}
