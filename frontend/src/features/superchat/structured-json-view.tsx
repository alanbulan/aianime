// Copyright (c) 2026 AI anime
import { cn } from "@/lib/utils";

function renderJsonScalar(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function JsonNode({
  name,
  value,
  depth = 0,
}: {
  name?: string;
  value: unknown;
  depth?: number;
}) {
  if (Array.isArray(value)) {
    return (
      <div className={cn("space-y-1", depth > 0 && "pl-3")}>
        {name && (
          <div className="text-xs font-medium text-muted-foreground">{name}</div>
        )}
        {value.map((item, index) => (
          <JsonNode
            key={index}
            name={`#${index + 1}`}
            value={item}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const objectTitle =
      typeof (value as Record<string, unknown>).title === "string"
        ? String((value as Record<string, unknown>).title)
        : name;
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-muted p-2",
          depth > 0 && "ml-2",
        )}
      >
        {objectTitle && (
          <div className="mb-1 text-xs font-semibold text-foreground">
            {objectTitle}
          </div>
        )}
        <div className="space-y-1">
          {entries.map(([key, item]) => (
            <JsonNode
              key={key}
              name={key}
              value={item}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[88px_minmax(0,1fr)] gap-2 text-xs",
        depth > 0 && "pl-2",
      )}
    >
      {name && <span className="truncate text-muted-foreground">{name}</span>}
      <span className="min-w-0 break-words font-mono text-foreground/90">
        {renderJsonScalar(value)}
      </span>
    </div>
  );
}
