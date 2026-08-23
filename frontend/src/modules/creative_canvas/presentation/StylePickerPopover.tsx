// Copyright (c) 2026 AI anime
import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

import type { CanvasStyleTemplate } from "../application/generationCatalog";
import { useCanvasStyleTemplates } from "../generationCatalogComposition";
import { NODE_FLOATING_PANEL_SURFACE_CLASS } from "./canvasNodeControlStyles";

interface StylePickerPopoverProps {
  projectId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}

export function StylePickerPopover({
  projectId,
  selectedId,
  onSelect,
  onClose,
}: StylePickerPopoverProps) {
  const { templates, isLoading } = useCanvasStyleTemplates(projectId);

  // Stable groups: backend `category` first (insertion order), un-categorized
  // bucket goes last under 「其他」.
  const grouped = useMemo(() => {
    const buckets = new Map<string, CanvasStyleTemplate[]>();
    for (const item of templates) {
      const key = item.category && item.category.trim().length > 0
        ? item.category
        : '__other__';
      const arr = buckets.get(key) ?? [];
      arr.push(item);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries()).map(([key, items]) => ({
      key,
      label: key === '__other__' ? '其他' : key,
      items,
    }));
  }, [templates]);

  return (
    <div
      className={`nodrag nowheel flex max-h-[520px] w-[420px] flex-col overflow-hidden ${NODE_FLOATING_PANEL_SURFACE_CLASS}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex h-11 shrink-0 items-center justify-between px-4">
        <span className="text-sm font-medium text-foreground">风格</span>
        <div className="flex items-center gap-1">
          {selectedId && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="h-7 rounded-md px-2 text-[11px] font-medium text-foreground/78 transition-colors hover:bg-muted hover:text-foreground"
            >
              清除
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="关闭"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="ui-scrollbar nowheel flex-1 overflow-y-auto px-4 pb-3 pt-1">
        {isLoading && templates.length === 0 && (
          <div className="flex h-20 items-center justify-center text-[11px] text-text-muted">
            加载中…
          </div>
        )}
        {!isLoading && templates.length === 0 && (
          <div className="flex h-20 items-center justify-center text-[11px] text-text-muted">
            暂无风格模板
          </div>
        )}
        {grouped.map((group) => (
          <div key={group.key} className="mb-2.5 last:mb-0">
            <div className="pb-1.5 pt-1 text-[11px] font-semibold leading-none text-muted-foreground">
              {group.label}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {group.items.map((item) => {
                const isActive = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    data-ui-tooltip={item.stylePrompt}
                    className={`group relative aspect-[4/3] overflow-hidden rounded-lg text-left transition-all ${
                      isActive
                        ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                        : 'ring-1 ring-border/70 hover:ring-foreground/35'
                    }`}
                  >
                    <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted via-muted/80 to-primary/15 text-xl font-semibold text-muted-foreground/55">
                      {item.label.slice(0, 1)}
                    </span>
                    {item.coverUrl && (
                      <img
                        src={item.coverUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 via-black/55 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-medium text-white">
                      {item.label}
                    </span>
                    {isActive && (
                      <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function describeStyleSelection(
  selectedId: string | null,
  templates: CanvasStyleTemplate[],
): CanvasStyleTemplate | null {
  if (!selectedId) return null;
  return templates.find((item) => item.id === selectedId) ?? null;
}
