// Copyright (c) 2026 AI anime
import { Fragment, type ComponentProps } from "react";
import { createPortal } from "react-dom";

import type { MentionTextareaController } from "@/modules/mention_textarea/application/use-mention-textarea-controller";
import { cn } from "@/lib/utils";

type MentionTextareaNativeProps = Omit<
  ComponentProps<"textarea">,
  | "className"
  | "onChange"
  | "onKeyDown"
  | "onKeyUp"
  | "onMouseLeave"
  | "onMouseMove"
  | "onMouseUp"
  | "onScroll"
  | "onSelect"
  | "value"
>;

export interface MentionTextareaViewProps {
  className?: string;
  controller: MentionTextareaController;
  inputClassName?: string;
  textareaProps: MentionTextareaNativeProps;
  value: string;
}

export function MentionTextareaView({
  className,
  controller,
  inputClassName,
  textareaProps,
  value,
}: MentionTextareaViewProps) {
  const outerBox = cn(
    "relative w-full rounded-lg border bg-transparent transition-colors focus-within:ring-3",
    className,
    "focus-within:border-primary/45 focus-within:ring-primary/10",
  );
  const textLayer = cn(
    "w-full whitespace-pre-wrap break-words",
    inputClassName ?? "px-2.5 py-2 text-sm",
  );

  return (
    <div className={outerBox} ref={controller.rootRef}>
      <div
        ref={controller.backdropRef}
        aria-hidden="true"
        className={cn(
          textLayer,
          "pointer-events-none absolute inset-0 select-none overflow-hidden text-foreground",
        )}
      >
        {controller.segments.map((segment, index) =>
          segment.mention ? (
            <mark
              key={index}
              data-mention-label={segment.text.replace(/^@/, "")}
              className="rounded-[3px] bg-primary/20 text-primary"
            >
              {segment.text}
            </mark>
          ) : (
            <Fragment key={index}>{segment.text}</Fragment>
          ),
        )}
        {value.endsWith("\n") ? "\u00a0" : null}
      </div>
      <textarea
        ref={controller.textareaRef}
        data-slot="textarea"
        value={value}
        onChange={controller.onTextareaChange}
        onScroll={controller.onTextareaScroll}
        onKeyDown={controller.onTextareaKeyDown}
        onKeyUp={controller.onTextareaKeyUp}
        onMouseUp={controller.onTextareaMouseUp}
        onMouseMove={controller.onTextareaMouseMove}
        onMouseLeave={controller.onTextareaMouseLeave}
        onDoubleClick={controller.onTextareaDoubleClick}
        onSelect={controller.onTextareaSelect}
        className={cn(
          textLayer,
          "field-sizing-content relative block min-h-[inherit] resize-none border-0 bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground dark:bg-transparent",
        )}
        {...textareaProps}
      />
      {controller.pickerOpen ? (
        <div
          role="listbox"
          className="absolute left-2 top-full z-50 mt-1 flex min-w-[180px] max-w-[280px] flex-col overflow-hidden rounded-[8px] border border-border bg-popover/95 py-1 shadow-xl backdrop-blur"
        >
          {controller.filteredLabels.map((label, index) => (
            <button
              key={label}
              type="button"
              role="option"
              aria-selected={index === controller.activeIndex}
              onMouseDown={(event) =>
                controller.onLabelMouseDown(event, label)
              }
              onMouseEnter={() => controller.onLabelMouseEnter(index)}
              className={cn(
                "px-2.5 py-1.5 text-left text-xs",
                index === controller.activeIndex
                  ? "bg-primary/15 text-primary"
                  : "text-foreground/82 hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {controller.preview && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[400]"
              style={{
                left: controller.preview.left,
                bottom: controller.preview.bottom,
                width: controller.preview.width,
              }}
            >
              <div className="overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl backdrop-blur-sm">
                <img
                  src={controller.preview.url}
                  alt=""
                  className="block h-auto w-full object-contain"
                  draggable={false}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
