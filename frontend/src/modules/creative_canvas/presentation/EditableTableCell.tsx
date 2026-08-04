// Copyright (c) 2026 AI anime
import { useEffect, useRef } from 'react';

export interface EditableTableCellProps {
  value: string;
  onCommit: (nextValue: string) => void;
  emptyPlaceholder?: string;
}

export function EditableTableCell({
  value,
  onCommit,
  emptyPlaceholder = '-',
}: EditableTableCellProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.innerText !== value) {
      element.innerText = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-empty-placeholder={emptyPlaceholder}
      className="editable-table-cell nodrag nowheel -mx-1 block min-h-[1.2em] cursor-text whitespace-pre-wrap break-words rounded px-1 leading-snug outline-none focus:bg-muted focus:ring-1 focus:ring-ring/50"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={(event) => {
        const next = event.currentTarget.innerText;
        if (next !== value) {
          onCommit(next);
        }
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          if (ref.current) {
            ref.current.innerText = value;
          }
          event.currentTarget.blur();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        const plain = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, plain);
      }}
    />
  );
}
