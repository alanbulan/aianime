// Copyright (c) 2026 AI anime
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

import { cn } from "@/lib/utils";

import "./sliding-tabs.css";

export type SlidingTabItem<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ElementType;
  testId?: string;
};

interface SlidingTabsProps<T extends string> {
  items: readonly SlidingTabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
}

export function SlidingTabs<T extends string>({
  items,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: SlidingTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef(new Map<T, HTMLButtonElement>());
  const initializedRef = useRef(false);
  const pendingTimerRef = useRef<number | null>(null);
  const [visualValue, setVisualValue] = useState(value);
  const [slider, setSlider] = useState({
    left: 0,
    width: 0,
    ready: false,
    animate: false,
  });
  const itemValuesKey = items.map((item) => item.value).join("\u001f");

  const positionSlider = useCallback((nextValue: T, animate: boolean) => {
    const container = containerRef.current;
    const activeTrigger = triggerRefs.current.get(nextValue);
    if (!container || !activeTrigger) return;

    const containerRect = container.getBoundingClientRect();
    const triggerRect = activeTrigger.getBoundingClientRect();
    const nextLeft = triggerRect.left - containerRect.left;
    const nextWidth = triggerRect.width;

    setSlider((current) => {
      const samePosition =
        current.ready &&
        Math.abs(current.left - nextLeft) < 0.5 &&
        Math.abs(current.width - nextWidth) < 0.5;
      if (samePosition) return current;
      return {
        left: nextLeft,
        width: nextWidth,
        ready: true,
        animate,
      };
    });
  }, []);

  const cancelPendingChange = useCallback(() => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  useEffect(() => cancelPendingChange, [cancelPendingChange]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    if (!initializedRef.current) {
      initializedRef.current = true;
      setVisualValue(value);
      positionSlider(value, false);
    } else {
      setVisualValue(value);
      positionSlider(value, true);
    }

    const updateSlider = () => positionSlider(value, false);

    if (typeof ResizeObserver === "undefined") return undefined;
    const resizeObserver = new ResizeObserver(updateSlider);
    resizeObserver.observe(container);
    const activeTrigger = triggerRefs.current.get(value);
    if (activeTrigger) resizeObserver.observe(activeTrigger);
    return () => resizeObserver.disconnect();
  }, [itemValuesKey, positionSlider, value]);

  const activate = useCallback(
    (nextValue: T) => {
      if (nextValue === visualValue) return;
      cancelPendingChange();
      flushSync(() => {
        setVisualValue(nextValue);
        positionSlider(nextValue, true);
      });
      // 视觉状态先同步提交；内容切换放到下一帧预算之后，避免重面板
      // 的首次渲染吞掉点击反馈。定时器不依赖后台窗口会暂停的 rAF。
      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        startTransition(() => onValueChange(nextValue));
      }, 16);
    },
    [cancelPendingChange, onValueChange, positionSlider, visualValue],
  );

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn("sliding-tabs flex items-center px-4 py-1 text-xs", className)}
    >
      <span
        aria-hidden="true"
        className="sliding-tabs__slider"
        data-animate={slider.animate ? "true" : "false"}
        data-ready={slider.ready ? "true" : "false"}
        style={{
          transform: `translateX(${slider.left}px)`,
          width: `${slider.width}px`,
        }}
      />
      {items.map((item) => {
        const Icon = item.icon;
        const active = visualValue === item.value;
        return (
          <button
            ref={(node) => {
              if (node) triggerRefs.current.set(item.value, node);
              else triggerRefs.current.delete(item.value);
            }}
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? "true" : "false"}
            data-testid={item.testId}
            className="sliding-tabs__trigger"
            onClick={() => activate(item.value)}
          >
            <span className="sliding-tabs__content">
              {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
              <span>{item.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
