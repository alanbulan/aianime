// Copyright (c) 2026 AI anime
import type { ComponentProps } from "react";

import { useMentionTextareaController } from "@/modules/mention_textarea/application/use-mention-textarea-controller";
import { MentionTextareaView } from "@/modules/mention_textarea/presentation/MentionTextareaView";

export interface MentionTextareaProps
  extends Omit<ComponentProps<"textarea">, "value"> {
  inputClassName?: string;
  mentionLabels?: string[];
  mentionPreviews?: Record<string, string>;
  value: string;
}

export function MentionTextarea({
  className,
  inputClassName,
  mentionLabels = [],
  mentionPreviews,
  onChange,
  onKeyDown,
  onKeyUp,
  onMouseLeave,
  onMouseMove,
  onMouseUp,
  onScroll,
  onSelect,
  value,
  ...textareaProps
}: MentionTextareaProps) {
  const controller = useMentionTextareaController({
    mentionLabels,
    mentionPreviews,
    onChange,
    onKeyDown,
    onKeyUp,
    onMouseLeave,
    onMouseMove,
    onMouseUp,
    onScroll,
    onSelect,
    value,
  });

  return (
    <MentionTextareaView
      className={className}
      controller={controller}
      inputClassName={inputClassName}
      textareaProps={textareaProps}
      value={value}
    />
  );
}
